// QQ AI Bot — WebOS Wasm App (长连接模式)
//
// 通过 QQ Bot WebSocket 长连接接收事件（JSON 文本帧协议）。
// Build: GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
	"unsafe"
)

var (
	appID       string
	appSecret   string
	initialized bool
	replyBuf    strings.Builder
	deltaCount  int
	inCodeBlock bool

	// 长连接状态
	wsConnID     string
	wsConnecting bool
	wsReady      bool
	tickCount    int

	// 心跳管理（从 Hello 事件动态获取）
	heartbeatInterval int // 心跳间隔（毫秒），0 表示未初始化
	lastSeq           int // 最后收到的事件序号
	heartbeatTick     int // 下次心跳的 tick 计数

	// Token 管理
	accessToken string
	tokenExpire int64 // 过期时间戳（秒）

	// 消息序号
	msgSeqCounter uint64

	// 多用户授权
	allowedUserIDs map[string]bool // 授权的 user_id 集合
	activeUserID   string          // 当前活跃的用户ID
)

// API 端点
const (
	TokenAPI = "https://bots.qq.com/app/getAppAccessToken"
	APIBase  = "https://api.sgroup.qq.com"
)

func main() {}

func ensureInit() {
	if initialized {
		return
	}
	initialized = true

	appID = configGet("qq_app_id")
	appSecret = configGet("qq_app_secret")

	if appID == "" || appSecret == "" {
		logMsg("ERROR: qq_app_id 或 qq_app_secret 未配置")
		return
	}

	logMsg(fmt.Sprintf("QQ AI Bot 初始化完成 (appID=%s...)", appID[:min(6, len(appID))]))

	// 加载授权用户列表
	allowedUserIDs = make(map[string]bool)
	loadQQAllowedUserIDs()

	if len(allowedUserIDs) == 0 {
		logMsg("自动注册模式：首个发消息的用户将被自动授权")
	} else {
		logMsg(fmt.Sprintf("授权用户: %d 个", len(allowedUserIDs)))
		// 自动设置 activeUserID 为第一个授权用户
		for uid := range allowedUserIDs {
			activeUserID = uid
			logMsg(fmt.Sprintf("自动设置活跃用户: %s", uid))
			break
		}
	}

	// 注册客户端上下文
	request("client_context.register", map[string]interface{}{
		"id":           "qq-ai-bot",
		"platform":     "qq",
		"displayName":  "QQ Bot",
		"capabilities": []string{"markdown_basic", "code_blocks", "bold", "italic"},
		"constraints":  []string{"no_latex"},
		"systemHint": "当前用户通过 QQ 客户端与你对话。请遵守以下格式规则：\n" +
			"1. 使用简洁的文本回复\n" +
			"2. 代码块使用 ``` 包裹\n" +
			"3. 支持 **粗体**、*斜体*、`行内代码`\n" +
			"4. 不要使用 LaTeX 公式\n" +
			"5. 回复尽量精炼",
	})

	// 获取 Token 并连接 WebSocket
	getAccessTokenAndConnect()
}

//go:wasmexport on_event
func on_event(ptr uint32, size uint32) uint32 {
	if size == 0 {
		return 0
	}
	raw := make([]byte, size)
	copy(raw, unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), size))

	var ev struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return 1
	}

	switch ev.Method {
	case "host.response":
		handleHostResponse(ev.Params)
	case "host.event":
		handleHostEvent(ev.Params)
	case "chat.delta":
		onChatDelta(ev.Params)
	case "chat.done":
		onChatDone()
	case "chat.error":
		onChatError(ev.Params)
	case "chat.command_result":
		onCommandResult(ev.Params)
	case "system.notify":
		onSystemNotify(ev.Params)
	case "chat.media":
		onChatMedia(ev.Params)
	case "tick":
		ensureInit()
		onTick()
	}
	return 0
}

// ==================== Token 管理 ====================

func getAccessTokenAndConnect() {
	if wsConnecting || wsReady {
		return
	}
	wsConnecting = true
	logMsg("正在获取 QQ Bot Access Token...")

	body := fmt.Sprintf(`{"appId":"%s","clientSecret":"%s"}`, appID, appSecret)
	hb, _ := json.Marshal(map[string]string{"Content-Type": "application/json"})
	httpRequestAsync("POST", TokenAPI, body, string(hb), func(resp string) {
		var r struct {
			AccessToken string `json:"access_token"`
			ExpiresIn   string `json:"expires_in"` // QQ API 返回的是字符串
		}
		if json.Unmarshal([]byte(resp), &r) != nil || r.AccessToken == "" {
			logMsg("ERROR: 获取 Access Token 失败: " + resp[:min(len(resp), 200)])
			wsConnecting = false
			return
		}

		accessToken = r.AccessToken
		expiresInSec := int64(0)
		if v, err := strconv.ParseInt(r.ExpiresIn, 10, 64); err == nil && v > 0 {
			expiresInSec = v
			tokenExpire = time.Now().Unix() + v
		} else {
			tokenExpire = 0
		}
		if expiresInSec > 0 {
			logMsg(fmt.Sprintf("✅ Access Token 获取成功，有效期: %d 秒", expiresInSec))
		} else {
			logMsg(fmt.Sprintf("✅ Access Token 获取成功，有效期原始值: %s", r.ExpiresIn))
		}

		// 获取 Gateway URL
		getGatewayAndConnect()
	})
}

func getGatewayAndConnect() {
	url := APIBase + "/gateway"
	hb, _ := json.Marshal(map[string]string{"Authorization": "QQBot " + accessToken})
	headers := string(hb)
	httpRequestAsync("GET", url, "", headers, func(resp string) {
		var r struct {
			URL string `json:"url"`
		}
		if json.Unmarshal([]byte(resp), &r) != nil || r.URL == "" {
			logMsg("ERROR: 获取 Gateway URL 失败: " + resp[:min(len(resp), 200)])
			wsConnecting = false
			return
		}

		logMsg(fmt.Sprintf("Gateway URL: %s", r.URL))

		// 连接 WebSocket
		wsHeaders := map[string]string{"Authorization": "QQBot " + accessToken}
		wsConnID = wsConnect(r.URL, wsHeaders)
		if wsConnID == "" {
			logMsg("ERROR: wsConnect 调用失败")
			wsConnecting = false
		}
	})
}

// ==================== WebSocket 事件处理 ====================

func handleHostEvent(data json.RawMessage) {
	var evt struct {
		Method string          `json:"method"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(data, &evt) != nil {
		return
	}
	switch evt.Method {
	case "ws.open":
		onWSOpen(evt.Data)
	case "ws.message":
		onWSMessage(evt.Data)
	case "ws.close":
		onWSClose(evt.Data)
	case "ws.error":
		onWSError(evt.Data)
	}
}

func onWSOpen(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
	}
	json.Unmarshal(data, &d)
	if d.ConnID == wsConnID {
		// 连接已建立，等待 Hello 事件（op=10）后再发送 Identify
		// QQ Bot 协议要求：先收到 Hello，再发 Identify
		logMsg("✅ QQ Bot WebSocket 连接已建立 (connID=" + wsConnID + ")，等待 Hello 事件...")
	}
}

func onWSMessage(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
		Data   string `json:"data"`
	}
	if json.Unmarshal(data, &d) != nil || d.ConnID != wsConnID {
		return
	}

	// QQ Bot 发送的是 JSON 文本消息
	handleWSMessage([]byte(d.Data))
}

func onWSClose(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
	}
	json.Unmarshal(data, &d)
	if d.ConnID == wsConnID {
		wsReady = false
		wsConnID = ""
		// 重置心跳状态
		heartbeatInterval = 0
		heartbeatTick = 0
		logMsg("⚠️ QQ Bot WebSocket 连接已断开，将在下次 tick 重连")
	}
}

func onWSError(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
		Error  string `json:"error"`
	}
	json.Unmarshal(data, &d)
	if d.ConnID == wsConnID || wsConnID == "" {
		wsReady = false
		wsConnecting = false
		wsConnID = ""
		// 重置心跳状态
		heartbeatInterval = 0
		heartbeatTick = 0
		logMsg("❌ QQ Bot WebSocket 错误: " + d.Error)
	}
}

func onTick() {
	tickCount++

	if appID == "" || appSecret == "" {
		return
	}

	if wsReady && shouldRefreshQQToken() {
		logMsg("QQ Access Token 即将过期，主动重连刷新")
		if wsConnID != "" {
			wsClose(wsConnID)
		}
		wsReady = false
		wsConnecting = false
		wsConnID = ""
		heartbeatInterval = 0
		heartbeatTick = 0
		lastSeq = 0
		accessToken = ""
		tokenExpire = 0
		return
	}

	// 心跳：根据服务器返回的 heartbeat_interval 发送心跳
	// tick 间隔约 3 秒，heartbeatInterval 单位是毫秒
	if wsReady && wsConnID != "" && heartbeatInterval > 0 {
		// 计算需要多少个 tick：heartbeat_interval / 3000
		ticksPerHeartbeat := heartbeatInterval / 3000
		if ticksPerHeartbeat < 1 {
			ticksPerHeartbeat = 1
		}
		if tickCount >= heartbeatTick+ticksPerHeartbeat {
			sendHeartbeat()
			heartbeatTick = tickCount
		}
	}

	// 断线重连：每 10 个 tick（约 30 秒）检查一次
	if !wsReady && !wsConnecting && tickCount%10 == 0 {
		logMsg("尝试重新建立 QQ Bot 长连接...")
		// 重置心跳状态
		heartbeatInterval = 0
		lastSeq = 0
		getAccessTokenAndConnect()
	}
}

// ==================== QQ Bot 协议处理 ====================

// sendIdentify 发送鉴权包
func sendIdentify() {
	// QQ Bot intents
	const (
		INTENT_GUILDS            = 1 << 0
		INTENT_GUILD_MEMBERS     = 1 << 1
		INTENT_PUBLIC_GUILD_MSGS = 1 << 30
		INTENT_DIRECT_MESSAGE    = 1 << 12
		INTENT_GROUP_AND_C2C     = 1 << 25
	)

	// 完整权限
	intents := INTENT_PUBLIC_GUILD_MSGS | INTENT_DIRECT_MESSAGE | INTENT_GROUP_AND_C2C

	identify := map[string]interface{}{
		"op": 2, // IDENTIFY
		"d": map[string]interface{}{
			"token":   "QQBot " + accessToken,
			"intents": intents,
			"shard":   []int{0, 1},
			"properties": map[string]interface{}{
				"$os":      "linux",
				"$browser": "webos-qqbot",
				"$device":  "webos",
			},
		},
	}
	data, _ := json.Marshal(identify)
	wsSend(wsConnID, data)
	logMsg("已发送 IDENTIFY 鉴权包")
}

// sendHeartbeat 发送心跳（带 lastSeq）
func sendHeartbeat() {
	heartbeat := map[string]interface{}{
		"op": 1,
		"d":  lastSeq, // 心跳需要携带最后收到的事件序号
	}
	data, _ := json.Marshal(heartbeat)
	wsSend(wsConnID, data)
	logMsg(fmt.Sprintf("发送心跳 (lastSeq=%d)", lastSeq))
}

// handleWSMessage 处理 WebSocket 消息
func handleWSMessage(data []byte) {
	var msg struct {
		Op   int             `json:"op"`
		Type string          `json:"t"`
		D    json.RawMessage `json:"d"`
		S    int             `json:"s"`
	}

	if err := json.Unmarshal(data, &msg); err != nil {
		logMsg("WARN: 解析 WS 消息失败: " + string(data[:min(len(data), 100)]))
		return
	}

	// 更新 lastSeq（所有事件都可能带序号）
	if msg.S > 0 {
		lastSeq = msg.S
	}

	switch msg.Op {
	case 0: // Dispatch - 事件分发
		handleDispatchEvent(msg.Type, msg.D)
	case 10: // Hello - 连接成功，需要发送 Identify
		handleHello(msg.D)
	case 11: // Heartbeat ACK
		logMsg("收到心跳响应")
	default:
		logMsg(fmt.Sprintf("收到未知操作码: op=%d", msg.Op))
	}
}

// handleHello 处理 Hello 事件（op=10）
func handleHello(data json.RawMessage) {
	var d struct {
		HeartbeatInterval int `json:"heartbeat_interval"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		logMsg("ERROR: 解析 Hello 事件失败: " + string(data[:min(len(data), 100)]))
		return
	}

	heartbeatInterval = d.HeartbeatInterval
	logMsg(fmt.Sprintf("收到 Hello 事件，心跳间隔: %d ms", heartbeatInterval))

	// 连接成功，可以发送 Identify 了
	wsReady = true
	wsConnecting = false

	// 发送鉴权包
	sendIdentify()
}

// handleDispatchEvent 处理分发事件
func handleDispatchEvent(eventType string, data json.RawMessage) {
	logMsg(fmt.Sprintf("事件: %s", eventType))

	switch eventType {
	case "C2C_MESSAGE_CREATE":
		// 私聊消息
		handleC2CMessage(data)
	case "GROUP_AT_MESSAGE_CREATE":
		// 群聊@消息
		handleGroupAtMessage(data)
	case "MESSAGE_CREATE":
		// 频道消息
		handleChannelMessage(data)
	case "READY":
		logMsg("✅ QQ Bot Ready，鉴权成功")
	default:
		// 其他事件
	}
}

// handleC2CMessage 处理私聊消息
func handleC2CMessage(data json.RawMessage) {
	var msg struct {
		Author struct {
			ID string `json:"id"`
		} `json:"author"`
		Content     string `json:"content"`
		ID          string `json:"id"`
		Timestamp   string `json:"timestamp"`
		Attachments []struct {
			ContentType string `json:"content_type"`
			Filename    string `json:"filename"`
			URL         string `json:"url"`
			Width       int    `json:"width"`
			Height      int    `json:"height"`
			Size        int    `json:"size"`
		} `json:"attachments"`
	}

	if err := json.Unmarshal(data, &msg); err != nil {
		logMsg("ERROR: 解析 C2C 消息失败: " + err.Error())
		return
	}

	userID := msg.Author.ID

	// 自动注册模式
	if len(allowedUserIDs) == 0 {
		saveQQAutoUserID(userID)
		logMsg(fmt.Sprintf("自动授权首个用户: %s", userID))
		sendQQC2CMessage(userID, "✅ 已自动授权，直接发消息即可开始对话。")
	}

	// 未授权用户
	if !isQQUserAllowed(userID) {
		logMsg(fmt.Sprintf("[未授权] user_id=%s", userID))
		sendQQC2CMessage(userID, "🚫 未授权访问，请联系管理员。")
		return
	}

	activeUserID = userID
	userText := strings.TrimSpace(msg.Content)

	// 收集有效附件
	var validAtts []struct {
		URL      string
		Filename string
	}
	for _, att := range msg.Attachments {
		if att.URL != "" {
			validAtts = append(validAtts, struct {
				URL      string
				Filename string
			}{att.URL, att.Filename})
			logMsg(fmt.Sprintf("[C2C:%s] 收到附件: %s (%s, %d bytes)", userID, att.Filename, att.ContentType, att.Size))
		}
	}

	// 无附件 — 直接发给 AI
	if len(validAtts) == 0 {
		if userText == "" {
			return
		}
		logMsg(fmt.Sprintf("[C2C:%s] %s", userID, userText[:min(len(userText), 100)]))
		deltaCount = 0
		replyBuf.Reset()
		request("chat.send", map[string]interface{}{
			"messageContent": userText,
			"clientId":       "qq-ai-bot",
		})
		return
	}

	// 有附件 — 异步下载，所有附件完成后统一发给 AI
	pd := &PendingDownload{
		UserID:   userID,
		UserText: userText,
		Total:    len(validAtts),
	}
	for _, att := range validAtts {
		savePath := fmt.Sprintf("${WEBOS_DATA_DIR}/uploads/qqbot/%s/%s", userID, att.Filename)
		reqID := downloadFileAsync(att.URL, savePath, "")
		if reqID == "" {
			logMsg(fmt.Sprintf("[C2C:%s] 发起下载失败: %s", userID, att.Filename))
			pd.Done++
			continue
		}
		pendingDownloads[reqID] = pd
	}

	// 如果所有下载都立即失败了，直接发文本
	if pd.Done >= pd.Total {
		sendTextToAI(pd)
	}
}

// handleGroupAtMessage 处理群聊@消息
func handleGroupAtMessage(data json.RawMessage) {
	var msg struct {
		GroupID string `json:"group_id"`
		Author  struct {
			ID string `json:"id"`
		} `json:"author"`
		Content   string `json:"content"`
		ID        string `json:"id"`
		Timestamp string `json:"timestamp"`
	}

	if err := json.Unmarshal(data, &msg); err != nil {
		logMsg("ERROR: 解析群聊消息失败: " + err.Error())
		return
	}

	// 去掉 @ 部分
	userText := strings.TrimSpace(msg.Content)
	userText = stripQQAtMention(userText)
	if userText == "" {
		return
	}

	activeUserID = msg.GroupID
	logMsg(fmt.Sprintf("[GROUP:%s] %s: %s", msg.GroupID, msg.Author.ID, userText[:min(len(userText), 50)]))

	// 调用 AI
	deltaCount = 0
	replyBuf.Reset()
	request("chat.send", map[string]interface{}{
		"messageContent": userText,
		"clientId":       "qq-ai-bot",
	})
}

// handleChannelMessage 处理频道消息
func handleChannelMessage(data json.RawMessage) {
	var msg struct {
		ChannelID string `json:"channel_id"`
		GuildID   string `json:"guild_id"`
		Author    struct {
			ID string `json:"id"`
		} `json:"author"`
		Content   string `json:"content"`
		ID        string `json:"id"`
		Timestamp string `json:"timestamp"`
	}

	if err := json.Unmarshal(data, &msg); err != nil {
		logMsg("ERROR: 解析频道消息失败: " + err.Error())
		return
	}

	userText := strings.TrimSpace(msg.Content)
	if userText == "" {
		return
	}

	activeUserID = msg.ChannelID
	logMsg(fmt.Sprintf("[CHANNEL:%s] %s: %s", msg.ChannelID, msg.Author.ID, userText[:min(len(userText), 50)]))

	// 调用 AI
	deltaCount = 0
	replyBuf.Reset()
	request("chat.send", map[string]interface{}{
		"messageContent": userText,
		"clientId":       "qq-ai-bot",
	})
}

// ==================== AI 回复处理 ====================

func onChatDelta(data json.RawMessage) {
	if activeUserID == "" {
		return
	}
	var d struct {
		Content string `json:"content"`
	}
	json.Unmarshal(data, &d)
	replyBuf.WriteString(d.Content)
	deltaCount++
}

func onChatDone() {
	if activeUserID == "" {
		return
	}
	reply := replyBuf.String()
	replyBuf.Reset()
	if strings.TrimSpace(reply) != "" {
		// 判断是私聊还是群聊
		if strings.HasPrefix(activeUserID, "group_") {
			// 群聊回复
			groupID := strings.TrimPrefix(activeUserID, "group_")
			sendQQGroupMessage(groupID, reply, "")
		} else {
			// 私聊回复
			sendQQC2CMessage(activeUserID, reply)
		}
	}
}

func onChatError(data json.RawMessage) {
	if activeUserID == "" {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	replyBuf.Reset()

	errMsg := "AI 错误: " + d.Error
	if strings.HasPrefix(activeUserID, "group_") {
		groupID := strings.TrimPrefix(activeUserID, "group_")
		sendQQGroupMessage(groupID, errMsg, "")
	} else {
		sendQQC2CMessage(activeUserID, errMsg)
	}
}

func onCommandResult(data json.RawMessage) {
	if activeUserID == "" {
		return
	}
	var d struct {
		Text    string `json:"text"`
		IsError bool   `json:"isError"`
	}
	json.Unmarshal(data, &d)
	if d.Text != "" {
		prefix := "📋 "
		if d.IsError {
			prefix = "❌ "
		}
		if strings.HasPrefix(activeUserID, "group_") {
			groupID := strings.TrimPrefix(activeUserID, "group_")
			sendQQGroupMessage(groupID, prefix+d.Text, "")
		} else {
			sendQQC2CMessage(activeUserID, prefix+d.Text)
		}
	}
}

func onSystemNotify(data json.RawMessage) {
	if activeUserID == "" {
		return
	}
	var d struct {
		Level   string `json:"level"`
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	json.Unmarshal(data, &d)
	if d.Message == "" {
		return
	}
	icon := "ℹ️"
	switch d.Level {
	case "success":
		icon = "✅"
	case "warning":
		icon = "⚠️"
	case "error":
		icon = "❌"
	case "plain":
		icon = ""
	}
	text := ""
	if icon != "" {
		text = icon + " "
	}
	if d.Title != "" {
		text += d.Title + "\n"
	}
	text += d.Message

	if strings.HasPrefix(activeUserID, "group_") {
		groupID := strings.TrimPrefix(activeUserID, "group_")
		sendQQGroupMessage(groupID, text, "")
	} else {
		sendQQC2CMessage(activeUserID, text)
	}
}

// onChatMedia 处理 AI 发送的图片/文件
func onChatMedia(data json.RawMessage) {
	if activeUserID == "" {
		logMsg("WARN: 收到 chat_media 但 activeUserID 为空")
		return
	}
	var d struct {
		ConversationID string `json:"conversationId"`
		Attachment     struct {
			NodeID   string `json:"nodeId"`
			Path     string `json:"path"`
			FileName string `json:"fileName"`
			MimeType string `json:"mimeType"`
			Size     int64  `json:"size"`
			Caption  string `json:"caption"`
		} `json:"attachment"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		logMsg("ERROR: 解析 chat_media 失败: " + err.Error())
		return
	}

	logMsg(fmt.Sprintf("收到 chat_media: path=%s, mime=%s, size=%d", d.Attachment.Path, d.Attachment.MimeType, d.Attachment.Size))

	filePath := d.Attachment.Path
	if !strings.HasPrefix(filePath, "/") {
		filePath = "/opt/webos/" + filePath
	}

	// 判断是图片还是文件
	isImage := strings.HasPrefix(d.Attachment.MimeType, "image/")
	fileName := d.Attachment.FileName
	if fileName == "" {
		// 从路径提取文件名
		fileName = filePath[strings.LastIndex(filePath, "/")+1:]
	}

	if strings.HasPrefix(activeUserID, "group_") {
		groupID := strings.TrimPrefix(activeUserID, "group_")
		if isImage {
			sendQQGroupImage(groupID, filePath, "", d.Attachment.Caption)
		} else {
			sendQQGroupFile(groupID, filePath, fileName, d.Attachment.Caption)
		}
	} else {
		if isImage {
			sendQQC2CImage(activeUserID, filePath, "", d.Attachment.Caption)
		} else {
			sendQQC2CFile(activeUserID, filePath, fileName, d.Attachment.Caption)
		}
	}
}

// ==================== QQ 消息发送 ====================

func getNextMsgSeq() uint64 {
	return atomic.AddUint64(&msgSeqCounter, 1)
}

func sendQQC2CMessage(openid, content string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送消息")
		return
	}

	// 检查消息中是否包含图片路径
	if strings.Contains(content, "[文件:") && strings.Contains(content, "]") {
		// 提取图片路径
		if filePath := extractFilePath(content); filePath != "" {
			sendQQC2CImage(openid, filePath, "", extractTextWithoutFiles(content))
			return
		}
	}

	url := APIBase + "/v2/users/" + openid + "/messages"
	body := map[string]interface{}{
		"markdown": map[string]interface{}{
			"content": content,
		},
		"msg_type": 2, // Markdown 格式
		"msg_seq":  getNextMsgSeq(),
	}
	bodyBytes, _ := json.Marshal(body)
	hb, _ := json.Marshal(map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "QQBot " + accessToken,
	})
	headers := string(hb)

	httpRequestAsync("POST", url, string(bodyBytes), headers, func(resp string) {
		if !strings.Contains(resp, `"id"`) {
			logMsg("WARN: C2C 消息发送可能失败: " + resp[:min(len(resp), 100)])
		} else {
			logMsg("✅ C2C Markdown 消息发送成功")
		}
	})
}

func sendQQGroupMessage(groupOpenid, content, msgID string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送消息")
		return
	}

	// 检查消息中是否包含图片路径
	if strings.Contains(content, "[文件:") && strings.Contains(content, "]") {
		// 提取图片路径
		if filePath := extractFilePath(content); filePath != "" {
			sendQQGroupImage(groupOpenid, filePath, msgID, extractTextWithoutFiles(content))
			return
		}
	}

	url := APIBase + "/v2/groups/" + groupOpenid + "/messages"
	body := map[string]interface{}{
		"markdown": map[string]interface{}{
			"content": content,
		},
		"msg_type": 2, // Markdown 格式
		"msg_seq":  getNextMsgSeq(),
	}
	if msgID != "" {
		body["msg_id"] = msgID
	}
	bodyBytes, _ := json.Marshal(body)
	hb, _ := json.Marshal(map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "QQBot " + accessToken,
	})
	headers := string(hb)

	httpRequestAsync("POST", url, string(bodyBytes), headers, func(resp string) {
		if !strings.Contains(resp, `"id"`) {
			logMsg("WARN: 群消息发送可能失败: " + resp[:min(len(resp), 100)])
		} else {
			logMsg("✅ 群消息 Markdown 消息发送成功")
		}
	})
}

// ==================== 用户授权管理 ====================

func loadQQAllowedUserIDs() {
	if s := configGet("qq_user_ids"); s != "" {
		for _, part := range strings.Split(s, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				allowedUserIDs[part] = true
			}
		}
	}
}

func saveQQAutoUserID(uid string) {
	allowedUserIDs[uid] = true
	var ids []string
	for id := range allowedUserIDs {
		ids = append(ids, id)
	}
	configSet("qq_user_ids", strings.Join(ids, ","))
}

func isQQUserAllowed(uid string) bool {
	return allowedUserIDs[uid]
}

// ==================== 工具函数 ====================

// downloadQQImage 下载 QQ 图片到本地
// handleDownloadComplete 处理单个附件下载完成
func handleDownloadComplete(pd *PendingDownload, savedPath, errMsg string) {
	pd.Done++
	if errMsg != "" {
		logMsg(fmt.Sprintf("[C2C:%s] 下载附件失败: %s", pd.UserID, errMsg))
	} else if savedPath != "" {
		// 从绝对路径提取相对路径用于 AI
		relativePath := savedPath
		if idx := strings.Index(savedPath, "/uploads/"); idx >= 0 {
			relativePath = savedPath[idx+1:] // "uploads/qqbot/..."
		}
		pd.Paths = append(pd.Paths, relativePath)
		logMsg(fmt.Sprintf("✅ 附件已保存: %s", relativePath))
	}

	// 所有附件处理完毕，发给 AI
	if pd.Done >= pd.Total {
		sendTextToAI(pd)
	}
}

// sendTextToAI 将用户文本 + 已下载附件路径拼接后发给 AI
func sendTextToAI(pd *PendingDownload) {
	userText := pd.UserText

	// 拼接附件路径
	for _, p := range pd.Paths {
		info := fmt.Sprintf("[文件: local_1:/opt/webos/%s]", p)
		if userText != "" {
			userText = userText + "\n" + info
		} else {
			userText = info
		}
	}

	if userText == "" {
		return
	}

	activeUserID = pd.UserID
	logMsg(fmt.Sprintf("[C2C:%s] %s", pd.UserID, userText[:min(len(userText), 100)]))
	deltaCount = 0
	replyBuf.Reset()
	request("chat.send", map[string]interface{}{
		"messageContent": userText,
		"clientId":       "qq-ai-bot",
	})
}

func stripQQAtMention(text string) string {
	// 移除 QQ 的 @ 标签
	return strings.TrimSpace(strings.TrimPrefix(text, "<@!"))
}

func shouldRefreshQQToken() bool {
	if tokenExpire == 0 {
		return false
	}
	return time.Now().Unix() >= tokenExpire-300
}

func hasValidQQToken() bool {
	if accessToken == "" {
		return false
	}
	if tokenExpire == 0 {
		return true
	}
	return time.Now().Unix() < tokenExpire
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// extractFilePath 从消息中提取文件路径
func extractFilePath(content string) string {
	// 匹配 [文件: node_id:path] 格式
	start := strings.Index(content, "[文件:")
	if start == -1 {
		return ""
	}
	end := strings.Index(content[start:], "]")
	if end == -1 {
		return ""
	}

	filePart := content[start+len("[文件:") : start+end]
	// 格式: node_id:path
	parts := strings.SplitN(strings.TrimSpace(filePart), ":", 2)
	if len(parts) != 2 {
		return ""
	}

	// 检查节点ID是否为local_1
	if parts[0] != "local_1" {
		logMsg(fmt.Sprintf("不支持的文件节点: %s", parts[0]))
		return ""
	}

	// 返回完整路径
	path := strings.TrimSpace(parts[1])
	if strings.HasPrefix(path, "/") {
		return path
	}
	// 相对路径转为绝对路径
	return "/opt/webos/" + path
}

// extractTextWithoutFiles 提取不带文件标记的文本
func extractTextWithoutFiles(content string) string {
	// 简单实现：移除所有 [文件:...] 标记
	result := content
	for {
		start := strings.Index(result, "[文件:")
		if start == -1 {
			break
		}
		end := strings.Index(result[start:], "]")
		if end == -1 {
			break
		}
		result = result[:start] + result[start+end+1:]
	}
	return strings.TrimSpace(result)
}

// sendQQC2CImage 发送私聊图片
func sendQQC2CImage(openid, filePath, msgID, text string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送图片")
		return
	}

	logMsg(fmt.Sprintf("发送 C2C 图片: %s, 文本: %s", filePath, text))
	fileDataB64, err := readHostFileBase64(filePath)
	if err != nil {
		logMsg("ERROR: 读取QQ图片失败: " + err.Error())
		if text != "" {
			sendQQC2CMessage(openid, "❌ 图片读取失败，发送文本: "+text)
		}
		return
	}

	uploadURL := APIBase + "/v2/users/" + openid + "/files"
	resp := request("http.request", map[string]interface{}{
		"method": "POST",
		"url":    uploadURL,
		"headers": map[string]string{
			"Authorization": "QQBot " + accessToken,
		},
		"body": map[string]interface{}{
			"kind": "json",
			"value": map[string]interface{}{
				"file_type":    1,
				"srv_send_msg": false,
				"file_data":    fileDataB64,
			},
		},
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)

	if result.Error != "" {
		logMsg("ERROR: QQ图片上传失败: " + result.Error)
		if text != "" {
			sendQQC2CMessage(openid, "❌ 图片上传失败，发送文本: "+text)
		}
		return
	}

	if result.RequestID != "" {
		httpCallbacks[result.RequestID] = func(respBody string) {
			logMsg("QQ图片上传响应: " + respBody[:min(len(respBody), 300)])

			// 解析上传结果，提取 file_info
			var uploadResp struct {
				FileUUID string `json:"file_uuid"`
				FileInfo string `json:"file_info"`
				TTL      int    `json:"ttl"`
			}
			if json.Unmarshal([]byte(respBody), &uploadResp) != nil {
				logMsg("ERROR: 解析QQ上传响应失败")
				if text != "" {
					sendQQC2CMessage(openid, "❌ 图片解析失败，发送文本: "+text)
				}
				return
			}

			if uploadResp.FileInfo == "" {
				logMsg("ERROR: QQ上传返回空 file_info")
				if text != "" {
					sendQQC2CMessage(openid, "❌ 图片上传失败，发送文本: "+text)
				}
				return
			}

			logMsg(fmt.Sprintf("✅ QQ图片上传成功, file_info=%s", uploadResp.FileInfo[:min(len(uploadResp.FileInfo), 50)]))

			// 发送富媒体消息 (msg_type=7)
			msgURL := APIBase + "/v2/users/" + openid + "/messages"
			body := map[string]interface{}{
				"msg_type": 7,
				"media": map[string]string{
					"file_info": uploadResp.FileInfo,
				},
				"msg_seq": getNextMsgSeq(),
			}
			if msgID != "" {
				body["msg_id"] = msgID
			}
			if text != "" {
				body["content"] = text
			}

			bodyBytes, _ := json.Marshal(body)
			hb, _ := json.Marshal(map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "QQBot " + accessToken,
			})
			headers := string(hb)

			httpRequestAsync("POST", msgURL, string(bodyBytes), headers, func(msgResp string) {
				if !strings.Contains(msgResp, `"id"`) {
					logMsg("WARN: QQ图片消息发送失败: " + msgResp[:min(len(msgResp), 100)])
				} else {
					logMsg("✅ QQ图片消息发送成功")
				}
			})
		}
	}
}

// sendQQGroupImage 发送群聊图片
func sendQQGroupImage(groupOpenid, filePath, msgID, text string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送图片")
		return
	}

	logMsg(fmt.Sprintf("发送群聊图片: %s, 文本: %s", filePath, text))
	fileDataB64, err := readHostFileBase64(filePath)
	if err != nil {
		logMsg("ERROR: 读取QQ群图片失败: " + err.Error())
		if text != "" {
			sendQQGroupMessage(groupOpenid, "❌ 图片读取失败，发送文本: "+text, msgID)
		}
		return
	}

	uploadURL := APIBase + "/v2/groups/" + groupOpenid + "/files"
	resp := request("http.request", map[string]interface{}{
		"method": "POST",
		"url":    uploadURL,
		"headers": map[string]string{
			"Authorization": "QQBot " + accessToken,
		},
		"body": map[string]interface{}{
			"kind": "json",
			"value": map[string]interface{}{
				"file_type":    1,
				"srv_send_msg": false,
				"file_data":    fileDataB64,
			},
		},
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)

	if result.Error != "" {
		logMsg("ERROR: QQ群图片上传失败: " + result.Error)
		if text != "" {
			sendQQGroupMessage(groupOpenid, "❌ 图片上传失败，发送文本: "+text, msgID)
		}
		return
	}

	if result.RequestID != "" {
		httpCallbacks[result.RequestID] = func(respBody string) {
			logMsg("QQ群图片上传响应: " + respBody[:min(len(respBody), 300)])

			// 解析上传结果，提取 file_info
			var uploadResp struct {
				FileUUID string `json:"file_uuid"`
				FileInfo string `json:"file_info"`
				TTL      int    `json:"ttl"`
			}
			if json.Unmarshal([]byte(respBody), &uploadResp) != nil {
				logMsg("ERROR: 解析QQ群上传响应失败")
				if text != "" {
					sendQQGroupMessage(groupOpenid, "❌ 图片解析失败，发送文本: "+text, msgID)
				}
				return
			}

			if uploadResp.FileInfo == "" {
				logMsg("ERROR: QQ群上传返回空 file_info")
				if text != "" {
					sendQQGroupMessage(groupOpenid, "❌ 图片上传失败，发送文本: "+text, msgID)
				}
				return
			}

			logMsg(fmt.Sprintf("✅ QQ群图片上传成功, file_info=%s", uploadResp.FileInfo[:min(len(uploadResp.FileInfo), 50)]))

			// 发送富媒体消息 (msg_type=7)
			msgURL := APIBase + "/v2/groups/" + groupOpenid + "/messages"
			body := map[string]interface{}{
				"msg_type": 7,
				"media": map[string]string{
					"file_info": uploadResp.FileInfo,
				},
				"msg_seq": getNextMsgSeq(),
			}
			if msgID != "" {
				body["msg_id"] = msgID
			}
			if text != "" {
				body["content"] = text
			}

			bodyBytes, _ := json.Marshal(body)
			hb, _ := json.Marshal(map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "QQBot " + accessToken,
			})
			headers := string(hb)

			httpRequestAsync("POST", msgURL, string(bodyBytes), headers, func(msgResp string) {
				if !strings.Contains(msgResp, `"id"`) {
					logMsg("WARN: QQ群图片消息发送失败: " + msgResp[:min(len(msgResp), 100)])
				} else {
					logMsg("✅ QQ群图片消息发送成功")
				}
			})
		}
	}
}

// sendQQC2CFile 发送私聊文件
func sendQQC2CFile(openid, filePath, fileName, caption string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送文件")
		return
	}

	if fileName == "" {
		fileName = filePath[strings.LastIndex(filePath, "/")+1:]
	}

	logMsg(fmt.Sprintf("发送 C2C 文件: %s, 文件名: %s", filePath, fileName))
	fileDataB64, err := readHostFileBase64(filePath)
	if err != nil {
		logMsg("ERROR: 读取QQ文件失败: " + err.Error())
		sendQQC2CMessage(openid, "❌ 文件读取失败: "+fileName)
		return
	}

	uploadURL := APIBase + "/v2/users/" + openid + "/files"
	resp := request("http.request", map[string]interface{}{
		"method": "POST",
		"url":    uploadURL,
		"headers": map[string]string{
			"Authorization": "QQBot " + accessToken,
		},
		"body": map[string]interface{}{
			"kind": "json",
			"value": map[string]interface{}{
				"file_type":    4,
				"srv_send_msg": false,
				"file_data":    fileDataB64,
				"file_name":    fileName,
			},
		},
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)

	if result.Error != "" {
		logMsg("ERROR: QQ文件上传失败: " + result.Error)
		sendQQC2CMessage(openid, "❌ 文件上传失败: "+fileName)
		return
	}

	if result.RequestID != "" {
		httpCallbacks[result.RequestID] = func(respBody string) {
			logMsg("QQ文件上传响应: " + respBody[:min(len(respBody), 300)])

			var uploadResp struct {
				FileUUID string `json:"file_uuid"`
				FileInfo string `json:"file_info"`
				TTL      int    `json:"ttl"`
			}
			if json.Unmarshal([]byte(respBody), &uploadResp) != nil {
				logMsg("ERROR: 解析QQ文件上传响应失败")
				sendQQC2CMessage(openid, "❌ 文件解析失败: "+fileName)
				return
			}

			if uploadResp.FileInfo == "" {
				logMsg("ERROR: QQ文件上传返回空 file_info")
				sendQQC2CMessage(openid, "❌ 文件上传失败: "+fileName)
				return
			}

			logMsg(fmt.Sprintf("✅ QQ文件上传成功, file_info=%s", uploadResp.FileInfo[:min(len(uploadResp.FileInfo), 50)]))

			// 发送富媒体消息 (msg_type=7)
			msgURL := APIBase + "/v2/users/" + openid + "/messages"
			body := map[string]interface{}{
				"msg_type": 7,
				"media": map[string]string{
					"file_info": uploadResp.FileInfo,
				},
				"msg_seq": getNextMsgSeq(),
			}
			if caption != "" {
				body["content"] = caption
			}

			bodyBytes, _ := json.Marshal(body)
			hb, _ := json.Marshal(map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "QQBot " + accessToken,
			})
			headers := string(hb)

			httpRequestAsync("POST", msgURL, string(bodyBytes), headers, func(msgResp string) {
				if !strings.Contains(msgResp, `"id"`) {
					logMsg("WARN: QQ文件消息发送失败: " + msgResp[:min(len(msgResp), 100)])
				} else {
					logMsg("✅ QQ文件消息发送成功")
				}
			})
		}
	}
}

// sendQQGroupFile 发送群聊文件
func sendQQGroupFile(groupOpenid, filePath, fileName, caption string) {
	if !hasValidQQToken() {
		logMsg("ERROR: accessToken 不可用或已过期，无法发送文件")
		return
	}

	if fileName == "" {
		fileName = filePath[strings.LastIndex(filePath, "/")+1:]
	}

	logMsg(fmt.Sprintf("发送群聊文件: %s, 文件名: %s", filePath, fileName))
	fileDataB64, err := readHostFileBase64(filePath)
	if err != nil {
		logMsg("ERROR: 读取QQ群文件失败: " + err.Error())
		sendQQGroupMessage(groupOpenid, "❌ 文件读取失败: "+fileName, "")
		return
	}

	uploadURL := APIBase + "/v2/groups/" + groupOpenid + "/files"
	resp := request("http.request", map[string]interface{}{
		"method": "POST",
		"url":    uploadURL,
		"headers": map[string]string{
			"Authorization": "QQBot " + accessToken,
		},
		"body": map[string]interface{}{
			"kind": "json",
			"value": map[string]interface{}{
				"file_type":    4,
				"srv_send_msg": false,
				"file_data":    fileDataB64,
				"file_name":    fileName,
			},
		},
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)

	if result.Error != "" {
		logMsg("ERROR: QQ群文件上传失败: " + result.Error)
		sendQQGroupMessage(groupOpenid, "❌ 文件上传失败: "+fileName, "")
		return
	}

	if result.RequestID != "" {
		httpCallbacks[result.RequestID] = func(respBody string) {
			logMsg("QQ群文件上传响应: " + respBody[:min(len(respBody), 300)])

			var uploadResp struct {
				FileUUID string `json:"file_uuid"`
				FileInfo string `json:"file_info"`
				TTL      int    `json:"ttl"`
			}
			if json.Unmarshal([]byte(respBody), &uploadResp) != nil {
				logMsg("ERROR: 解析QQ群文件上传响应失败")
				sendQQGroupMessage(groupOpenid, "❌ 文件解析失败: "+fileName, "")
				return
			}

			if uploadResp.FileInfo == "" {
				logMsg("ERROR: QQ群文件上传返回空 file_info")
				sendQQGroupMessage(groupOpenid, "❌ 文件上传失败: "+fileName, "")
				return
			}

			logMsg(fmt.Sprintf("✅ QQ群文件上传成功, file_info=%s", uploadResp.FileInfo[:min(len(uploadResp.FileInfo), 50)]))

			msgURL := APIBase + "/v2/groups/" + groupOpenid + "/messages"
			body := map[string]interface{}{
				"msg_type": 7,
				"media": map[string]string{
					"file_info": uploadResp.FileInfo,
				},
				"msg_seq": getNextMsgSeq(),
			}
			if caption != "" {
				body["content"] = caption
			}

			bodyBytes, _ := json.Marshal(body)
			hb, _ := json.Marshal(map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "QQBot " + accessToken,
			})
			headers := string(hb)

			httpRequestAsync("POST", msgURL, string(bodyBytes), headers, func(msgResp string) {
				if !strings.Contains(msgResp, `"id"`) {
					logMsg("WARN: QQ群文件消息发送失败: " + msgResp[:min(len(msgResp), 100)])
				} else {
					logMsg("✅ QQ群文件消息发送成功")
				}
			})
		}
	}
}
