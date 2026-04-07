// 飞书 AI Bot — WebOS Wasm App (长连接模式)
//
// 通过飞书 WebSocket 长连接接收事件（protobuf 二进制帧协议）。
// Build: GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unsafe"
)

const scheduledAIConversationID = "scheduled_ai"

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
	wsServiceID  int32
	tickCount    int

	// 多用户授权
	allowedChatIDs    map[string]bool // 授权的 chat_id 集合
	chatConversations map[string]string
	conversationChats map[string]string
	activeChatID      string // 当前活跃的 chat_id（AI 回复发到这里）
)

func feishuConversationKVKey(chatID string) string {
	return "feishu_conv:" + strings.TrimSpace(chatID)
}

func getCurrentConversationID(chatID string) string {
	chatID = strings.TrimSpace(chatID)
	if chatID == "" {
		return ""
	}
	if convID := strings.TrimSpace(chatConversations[chatID]); convID != "" {
		return convID
	}
	convID := strings.TrimSpace(kvGet(feishuConversationKVKey(chatID)))
	if convID != "" {
		chatConversations[chatID] = convID
		conversationChats[convID] = chatID
	}
	return convID
}

func setCurrentConversationID(chatID, convID string) {
	chatID = strings.TrimSpace(chatID)
	convID = strings.TrimSpace(convID)
	if chatID == "" || convID == "" {
		return
	}
	if prev := strings.TrimSpace(chatConversations[chatID]); prev != "" && prev != convID {
		delete(conversationChats, prev)
	}
	if chatConversations[chatID] == convID {
		conversationChats[convID] = chatID
		return
	}
	chatConversations[chatID] = convID
	conversationChats[convID] = chatID
	kvSet(feishuConversationKVKey(chatID), convID)
}

func bindActiveChat(chatID string) string {
	activeChatID = strings.TrimSpace(chatID)
	return getCurrentConversationID(activeChatID)
}

func ensureConversationID(chatID, userText string) string {
	convID := bindActiveChat(chatID)
	if convID != "" {
		return convID
	}
	placeholder := strings.TrimSpace(userText)
	if placeholder == "" {
		placeholder = "[飞书会话初始化]"
	}
	resp := request("chat.send", map[string]interface{}{
		"conversationId": "",
		"messageContent": placeholder,
		"clientId":       "feishu-ai-bot",
	})
	var result struct {
		Accepted       bool   `json:"accepted"`
		Reason         string `json:"reason"`
		ConversationID string `json:"conversationId"`
	}
	_ = json.Unmarshal([]byte(resp), &result)
	if !result.Accepted {
		if strings.TrimSpace(result.Reason) != "" {
			logMsg(fmt.Sprintf("ERROR: 创建飞书会话失败 chat=%s reason=%s", chatID, result.Reason))
		} else {
			logMsg(fmt.Sprintf("ERROR: 创建飞书会话失败 chat=%s", chatID))
		}
		return ""
	}
	convID = strings.TrimSpace(result.ConversationID)
	if convID != "" {
		setCurrentConversationID(chatID, convID)
		activeChatID = strings.TrimSpace(chatID)
		return convID
	}
	return bindActiveChat(chatID)
}

func main() {}

func ensureInit() {
	if initialized {
		return
	}
	initialized = true

	appID = configGet("feishu_app_id")
	appSecret = configGet("feishu_app_secret")

	if appID == "" || appSecret == "" {
		logMsg("ERROR: feishu_app_id 或 feishu_app_secret 未配置")
		return
	}

	logMsg(fmt.Sprintf("飞书 AI Bot 初始化完成 (appID=%s...)", appID[:min(6, len(appID))]))

	// 加载授权 chat_id 列表
	allowedChatIDs = make(map[string]bool)
	chatConversations = make(map[string]string)
	conversationChats = make(map[string]string)
	loadFeishuAllowedChatIDs()

	if len(allowedChatIDs) == 0 {
		logMsg("自动注册模式：首个发消息的用户将被自动授权")
	} else {
		logMsg(fmt.Sprintf("授权 chat_id: %d 个", len(allowedChatIDs)))
	}
	request("client_context.register", map[string]interface{}{
		"id":           "feishu-ai-bot",
		"platform":     "feishu",
		"displayName":  "飞书 Bot",
		"capabilities": []string{"markdown_basic", "code_blocks", "bold", "italic", "links"},
		"constraints":  []string{"no_latex", "no_images_inline"},
		"systemHint": "当前用户通过飞书客户端与你对话。请遵守以下格式规则：\n" +
			"1. 使用简洁的文本回复\n" +
			"2. 代码块使用 ``` 包裹\n" +
			"3. 支持 **粗体**、*斜体*、`行内代码`\n" +
			"4. 不要使用 LaTeX 公式\n" +
			"5. 列表使用 - 或数字编号\n" +
			"6. 回复尽量精炼",
	})

	fetchBotInfo()
	startWSConnection()
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
		onChatDone(ev.Params)
	case "chat.error":
		onChatError(ev.Params)
	case "chat.command_result":
		onCommandResult(ev.Params)
	case "chat.media":
		onMediaAttachment(ev.Params)
	case "system.notify":
		onSystemNotify(ev.Params)
	case "tick":
		ensureInit()
		onTick()
	default:

	}
	return 0
}

// ==================== 飞书长连接管理 ====================

func startWSConnection() {
	if wsConnecting || wsReady {
		return
	}
	wsConnecting = true
	logMsg("正在获取飞书长连接地址...")

	// 飞书 SDK 协议：直接用 AppID/AppSecret 请求，不需要 Bearer token
	// 注意：长连接 endpoint 不在 /open-apis 下，而是直接在 open.feishu.cn 根路径下
	url := "https://open.feishu.cn/callback/ws/endpoint"
	body := fmt.Sprintf(`{"AppID":"%s","AppSecret":"%s"}`, appID, appSecret)
	httpRequestAsync("POST", url, body, "{\"Content-Type\":\"application/json\",\"locale\":\"zh\"}", func(resp string) {
		wsConnecting = false
		var r struct {
			Code int    `json:"code"`
			Msg  string `json:"msg"`
			Data *struct {
				URL          string `json:"URL"`
				ClientConfig *struct {
					ReconnectCount    int `json:"ReconnectCount"`
					ReconnectInterval int `json:"ReconnectInterval"`
					PingInterval      int `json:"PingInterval"`
				} `json:"ClientConfig"`
			} `json:"data"`
		}
		if json.Unmarshal([]byte(resp), &r) != nil || r.Code != 0 {
			logMsg("ERROR: 获取飞书 WS URL 失败 (code=" + fmt.Sprint(r.Code) + "): " + r.Msg + " raw=" + resp[:min(len(resp), 300)])
			return
		}
		if r.Data == nil || r.Data.URL == "" {
			logMsg("ERROR: 飞书返回空 WS URL")
			return
		}

		wsURL := r.Data.URL
		logMsg("飞书 WS URL 获取成功，正在连接...")

		// 从 URL 中提取 service_id
		if idx := strings.Index(wsURL, "service_id="); idx >= 0 {
			s := wsURL[idx+11:]
			if end := strings.IndexAny(s, "&# "); end > 0 {
				s = s[:end]
			}
			if v, err := strconv.Atoi(s); err == nil {
				wsServiceID = int32(v)
			}
		}

		wsConnID = wsConnect(wsURL, map[string]string{})
		if wsConnID == "" {
			logMsg("ERROR: wsConnect 调用失败")
		}
	})
}

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
		wsReady = true
		wsConnecting = false
		logMsg("✅ 飞书 WebSocket 长连接已建立 (connID=" + wsConnID + ")")
	}
}

func onWSMessage(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
		Data   string `json:"data"`
		Binary bool   `json:"binary"`
	}
	if json.Unmarshal(data, &d) != nil || d.ConnID != wsConnID {
		return
	}

	logMsg(fmt.Sprintf("ws.message: binary=%v, len=%d", d.Binary, len(d.Data)))

	if d.Binary {
		// 二进制消息：base64 编码的 protobuf 帧
		raw, err := base64.StdEncoding.DecodeString(d.Data)
		if err != nil {
			logMsg("ERROR: base64 decode 失败: " + err.Error())
			return
		}
		handleBinaryFrame(raw)
	} else {
		// 文本消息（不太可能，但兜底）
		logMsg("收到文本 WS 消息: " + d.Data[:min(len(d.Data), 200)])
	}
}

func onWSClose(data json.RawMessage) {
	var d struct {
		ConnID string `json:"connId"`
	}
	json.Unmarshal(data, &d)
	if d.ConnID == wsConnID {
		wsReady = false
		wsConnID = ""
		logMsg("⚠️ 飞书 WebSocket 连接已断开，将在下次 tick 重连")
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
		logMsg("❌ 飞书 WebSocket 错误: " + d.Error)
	}
}

func onTick() {
	tickCount++
	if appID == "" || appSecret == "" {
		return
	}

	// 心跳：每 40 个 tick（约 2 分钟）发一次 ping
	if wsReady && wsConnID != "" && tickCount%40 == 0 {
		pingData := newPingFrame(wsServiceID)
		wsSend(wsConnID, pingData)
	}

	// 断线重连：每 10 个 tick（约 30 秒）检查一次
	if !wsReady && !wsConnecting && tickCount%10 == 0 {
		logMsg("尝试重新建立飞书长连接...")
		startWSConnection()
	}
}

// ==================== Protobuf 帧处理 ====================

func handleBinaryFrame(raw []byte) {
	frame, err := unmarshalFrame(raw)
	if err != nil {
		logMsg("ERROR: protobuf 帧解析失败: " + err.Error())
		return
	}

	frameType := frame.Method // 0=Control, 1=Data
	msgType := headersGet(frame.Headers, "type")

	switch frameType {
	case 0: // Control frame
		switch msgType {
		case "pong":
			// 心跳回复，忽略
		default:
			if msgType != "" {
				logMsg("收到控制帧: type=" + msgType)
			}
		}
	case 1: // Data frame
		handleDataFrame(frame)
	}
}

func handleDataFrame(frame pbFrame) {
	msgType := headersGet(frame.Headers, "type")
	msgID := headersGet(frame.Headers, "message_id")
	traceID := headersGet(frame.Headers, "trace_id")

	// 处理分包（sum > 1 时需要合包，暂时只处理单包）
	sumStr := headersGet(frame.Headers, "sum")
	sum := 1
	if sumStr != "" {
		if v, err := strconv.Atoi(sumStr); err == nil {
			sum = v
		}
	}
	if sum > 1 {
		logMsg(fmt.Sprintf("WARN: 收到分包消息 (sum=%d)，暂不支持合包，跳过 msgID=%s", sum, msgID))
		// 仍然回 ACK
		sendFrameACK(frame, 200)
		return
	}

	logMsg(fmt.Sprintf("收到数据帧: type=%s, msgID=%s, traceID=%s, payload=%d bytes", msgType, msgID, traceID, len(frame.Payload)))

	switch msgType {
	case "event":
		handleEventPayload(frame)
	case "card":
		// 卡片回调，暂不处理
		sendFrameACK(frame, 200)
	default:
		sendFrameACK(frame, 200)
	}
}

// sendFrameACK 回复飞书 ACK
func sendFrameACK(original pbFrame, statusCode int) {
	respJSON := fmt.Sprintf(`{"code":%d}`, statusCode)
	respFrame := pbFrame{
		SeqID:   original.SeqID,
		LogID:   original.LogID,
		Service: original.Service,
		Method:  original.Method,
		Headers: original.Headers,
		Payload: []byte(respJSON),
	}
	bs := respFrame.marshal()
	wsSend(wsConnID, bs)
}

// handleEventPayload 处理飞书事件 payload
func handleEventPayload(frame pbFrame) {
	// payload 是 JSON 格式的事件数据
	payload := frame.Payload
	if len(payload) == 0 {
		sendFrameACK(frame, 200)
		return
	}

	// 飞书事件结构
	var event struct {
		Schema string `json:"schema"`
		Header struct {
			EventID   string `json:"event_id"`
			EventType string `json:"event_type"`
			Token     string `json:"token"`
		} `json:"header"`
		Event json.RawMessage `json:"event"`
	}
	if json.Unmarshal(payload, &event) != nil {
		logMsg("WARN: 事件 JSON 解析失败: " + string(payload[:min(len(payload), 200)]))
		sendFrameACK(frame, 200)
		return
	}

	logMsg("飞书事件: " + event.Header.EventType + " (id=" + event.Header.EventID + ")")

	// 先回 ACK
	sendFrameACK(frame, 200)

	// 处理具体事件
	switch event.Header.EventType {
	case "im.message.receive_v1":
		handleIMMessage(event.Event)
	default:
		// 其他事件暂不处理
	}
}

// handleIMMessage 处理收到的即时消息事件
func handleIMMessage(eventData json.RawMessage) {
	logMsg("DEBUG: 原始事件数据: " + string(eventData[:min(len(eventData), 500)]))

	var ev struct {
		Sender struct {
			SenderID struct {
				OpenID string `json:"open_id"`
			} `json:"sender_id"`
			SenderType string `json:"sender_type"`
		} `json:"sender"`
		Message struct {
			MessageID   string `json:"message_id"`
			ChatID      string `json:"chat_id"`
			ChatType    string `json:"chat_type"`
			MessageType string `json:"message_type"`
			Content     string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(eventData, &ev); err != nil {
		logMsg("ERROR: 事件 JSON 解析失败: " + err.Error())
		return
	}

	logMsg("DEBUG: message_type=" + ev.Message.MessageType + ", chat_id=" + ev.Message.ChatID)

	if ev.Sender.SenderType == "app" {
		return
	}
	if botOpenID != "" && ev.Sender.SenderID.OpenID == botOpenID {
		return
	}

	incomingChatID := ev.Message.ChatID

	// 自动注册模式：没有任何授权用户时，第一个发消息的自动授权
	if len(allowedChatIDs) == 0 {
		saveFeishuAutoChatID(incomingChatID)
		logMsg(fmt.Sprintf("自动授权首个 chat_id: %s", incomingChatID))
		sendFeishuAsync(incomingChatID, fmt.Sprintf("✅ 已自动授权。\n\n你的 Chat ID: %s\n\n直接发消息即可开始对话。", incomingChatID))
	}

	// 未授权用户：返回提示
	if !isFeishuChatAllowed(incomingChatID) {
		logMsg(fmt.Sprintf("[未授权] chat_id=%s", incomingChatID))
		sendFeishuAsync(incomingChatID, fmt.Sprintf("🚫 未授权访问。\n\n你的 Chat ID: %s\n\n请联系管理员将此 ID 添加到飞书 Bot 配置中。", incomingChatID))
		return
	}

	// 处理不同消息类型
	switch ev.Message.MessageType {
	case "text":
		handleTextMessage(ev.Message, incomingChatID, ev.Sender.SenderID.OpenID)
	case "image":
		handleImageMessage(ev.Message, incomingChatID, ev.Sender.SenderID.OpenID)
	case "file", "audio", "video", "media":
		handleFileMessage(ev.Message, incomingChatID, ev.Sender.SenderID.OpenID)
	default:
		logMsg(fmt.Sprintf("暂不支持的消息类型: %s", ev.Message.MessageType))
	}
}

// handleTextMessage 处理文本消息
func handleTextMessage(msg struct {
	MessageID   string `json:"message_id"`
	ChatID      string `json:"chat_id"`
	ChatType    string `json:"chat_type"`
	MessageType string `json:"message_type"`
	Content     string `json:"content"`
}, chatID, senderOpenID string) {
	var content struct {
		Text string `json:"text"`
	}
	if json.Unmarshal([]byte(msg.Content), &content) != nil || content.Text == "" {
		return
	}

	userText := strings.TrimSpace(content.Text)
	userText = stripAtMention(userText)
	if userText == "" {
		return
	}

	convID := bindActiveChat(chatID)
	logMsg(fmt.Sprintf("[chat:%s] %s: %s", chatID, senderOpenID, userText))

	deltaCount = 0
	replyBuf.Reset()
	if convID == "" {
		convID = ensureConversationID(chatID, userText)
	}
	if convID == "" {
		return
	}
	request("chat.send", map[string]interface{}{
		"conversationId": convID,
		"messageContent": userText,
		"clientId":       "feishu-ai-bot",
	})
}

// handleImageMessage 处理图片消息
func handleImageMessage(msg struct {
	MessageID   string `json:"message_id"`
	ChatID      string `json:"chat_id"`
	ChatType    string `json:"chat_type"`
	MessageType string `json:"message_type"`
	Content     string `json:"content"`
}, chatID, senderOpenID string) {
	var content struct {
		ImageKey string `json:"image_key"`
	}
	if json.Unmarshal([]byte(msg.Content), &content) != nil || content.ImageKey == "" {
		return
	}

	logMsg(fmt.Sprintf("[chat:%s] %s 发送图片: image_key=%s", chatID, senderOpenID, content.ImageKey))

	convID := bindActiveChat(chatID)

	// 异步下载图片
	downloadFeishuMediaAsync(msg.MessageID, content.ImageKey, "image", chatID, senderOpenID, convID)
}

// handleFileMessage 处理文件消息
func handleFileMessage(msg struct {
	MessageID   string `json:"message_id"`
	ChatID      string `json:"chat_id"`
	ChatType    string `json:"chat_type"`
	MessageType string `json:"message_type"`
	Content     string `json:"content"`
}, chatID, senderOpenID string) {
	var content struct {
		FileKey  string `json:"file_key"`
		FileName string `json:"file_name"`
	}
	if json.Unmarshal([]byte(msg.Content), &content) != nil || content.FileKey == "" {
		return
	}

	fileName := content.FileName
	if fileName == "" {
		fileName = "file"
	}

	logMsg(fmt.Sprintf("[chat:%s] %s 发送文件: file_key=%s, name=%s", chatID, senderOpenID, content.FileKey, fileName))

	convID := bindActiveChat(chatID)

	// 异步下载文件
	reqID := sendDownloadRequest(msg.MessageID, content.FileKey, "file", chatID, senderOpenID, fileName, convID)
	if reqID == "" {
		logMsg("ERROR: 发起文件下载请求失败")
	}
}

// ==================== 多用户授权管理 ====================

func loadFeishuAllowedChatIDs() {
	// 从配置读取（用户手动设置的 + 自动注册的，都在同一个 config 字段）
	if s := configGet("feishu_chat_id"); s != "" {
		for _, part := range strings.Split(s, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				allowedChatIDs[part] = true
			}
		}
	}
}

func saveFeishuAutoChatID(cid string) {
	allowedChatIDs[cid] = true
	// 保存到 config（和 App ID、代理等配置在同一个地方，设置页面可见可编辑）
	var ids []string
	for id := range allowedChatIDs {
		ids = append(ids, id)
	}
	configSet("feishu_chat_id", strings.Join(ids, ","))
}

func isFeishuChatAllowed(cid string) bool {
	return allowedChatIDs[cid]
}

func stripAtMention(text string) string {
	for strings.Contains(text, "@_user_") {
		start := strings.Index(text, "@_user_")
		end := start + 7
		for end < len(text) && text[end] >= '0' && text[end] <= '9' {
			end++
		}
		text = text[:start] + text[end:]
	}
	return strings.TrimSpace(text)
}

func conversationChatID(convID string) string {
	convID = strings.TrimSpace(convID)
	if convID == "" {
		return strings.TrimSpace(activeChatID)
	}
	if chatID := lookupConversationChatID(convID); chatID != "" {
		return chatID
	}
	return strings.TrimSpace(activeChatID)
}

func lookupConversationChatID(convID string) string {
	convID = strings.TrimSpace(convID)
	if convID == "" {
		return ""
	}
	return strings.TrimSpace(conversationChats[convID])
}

func shouldBindConversation(convID string) bool {
	convID = strings.TrimSpace(convID)
	return convID != "" && convID != scheduledAIConversationID
}

// ==================== AI 回复处理 ====================

func onChatDelta(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
		Content        string `json:"content"`
	}
	json.Unmarshal(data, &d)
	chatID := conversationChatID(d.ConversationID)
	if chatID == "" {
		return
	}
	activeChatID = chatID
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(chatID, d.ConversationID)
	}
	replyBuf.WriteString(d.Content)
	deltaCount++
	flushReplyBuf(false)
}

func onChatDone(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(data, &d)
	chatID := conversationChatID(d.ConversationID)
	if chatID == "" {
		return
	}
	activeChatID = chatID
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(chatID, d.ConversationID)
	}
	flushReplyBuf(true)
	inCodeBlock = false
}

func onChatError(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
		Error          string `json:"error"`
	}
	json.Unmarshal(data, &d)
	chatID := conversationChatID(d.ConversationID)
	if chatID == "" {
		return
	}
	activeChatID = chatID
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(chatID, d.ConversationID)
	}
	flushReplyBuf(true)
	inCodeBlock = false
	sendFeishuAsync(chatID, "AI 错误: "+d.Error)
}

func flushReplyBuf(force bool) {
	cid := strings.TrimSpace(activeChatID)
	s := replyBuf.String()
	if strings.TrimSpace(s) == "" {
		replyBuf.Reset()
		return
	}
	if force {
		replyBuf.Reset()
		sendFeishuAsync(cid, s)
	}
}

func findCutPoint(s string) int {
	lastNL := strings.LastIndex(s, "\n")
	if lastNL < 0 {
		return 0
	}
	completed := s[:lastNL+1]
	lines := strings.SplitAfter(completed, "\n")
	localInCode := inCodeBlock
	pos := 0
	var codeCloses []int
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		pos += len(line)
		if localInCode {
			if trimmed == "```" {
				localInCode = false
				codeCloses = append(codeCloses, pos)
			}
		} else if strings.HasPrefix(trimmed, "```") {
			localInCode = true
		}
	}
	if localInCode {
		return 0
	}
	if len(codeCloses) > 0 && codeCloses[0] < len(completed) {
		return codeCloses[0]
	}
	pos = len(completed)
	for i := len(lines) - 1; i >= 0; i-- {
		pos -= len(lines[i])
		trimmed := strings.TrimSpace(lines[i])
		lineEnd := pos + len(lines[i])
		if trimmed == "" || endsWithSentence(trimmed) {
			if lineEnd < len(completed) {
				return lineEnd
			}
		}
	}
	return 0
}

func endsWithSentence(s string) bool {
	s = strings.TrimRight(s, " \t\n")
	if s == "" {
		return false
	}
	return strings.HasSuffix(s, ".") || strings.HasSuffix(s, "!") || strings.HasSuffix(s, "?") ||
		strings.HasSuffix(s, "。") || strings.HasSuffix(s, "！") || strings.HasSuffix(s, "？") ||
		strings.HasSuffix(s, "；") || strings.HasSuffix(s, "：")
}

func onCommandResult(data json.RawMessage) {
	var d struct {
		ConversationID       string `json:"conversationId"`
		Text                 string `json:"text"`
		IsError              bool   `json:"isError"`
		TargetConversationID string `json:"targetConversationId"`
		ConversationAction   string `json:"conversationAction"`
		SwitchConversation   bool   `json:"switchConversation"`
		RoutePolicy          string `json:"routePolicy"`
		OwnerClientID        string `json:"ownerClientId"`
	}
	json.Unmarshal(data, &d)
	chatID := lookupConversationChatID(d.ConversationID)
	if chatID == "" && strings.TrimSpace(d.TargetConversationID) != "" {
		chatID = lookupConversationChatID(d.TargetConversationID)
	}
	if chatID == "" && d.SwitchConversation && d.RoutePolicy == "directed" && d.OwnerClientID == currentAppID {
		chatID = strings.TrimSpace(activeChatID)
	}
	if chatID == "" {
		return
	}
	activeChatID = chatID
	if d.SwitchConversation && !d.IsError && strings.TrimSpace(d.TargetConversationID) != "" && d.RoutePolicy == "directed" && d.OwnerClientID == currentAppID {
		setCurrentConversationID(chatID, d.TargetConversationID)
	}
	if d.Text != "" {
		prefix := "📋 "
		if d.IsError {
			prefix = "❌ "
		}
		if d.ConversationAction != "" && strings.TrimSpace(d.TargetConversationID) != "" {
			d.Text += fmt.Sprintf("\n\n当前会话: `%s`", d.TargetConversationID)
		}
		sendFeishuAsync(chatID, prefix+d.Text)
	}
}

func onSystemNotify(data json.RawMessage) {
	if activeChatID == "" {
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
	sendFeishuAsync(activeChatID, text)
}

func onMediaAttachment(data json.RawMessage) {
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
	if json.Unmarshal(data, &d) != nil {
		return
	}
	chatID := conversationChatID(d.ConversationID)
	if chatID == "" {
		return
	}
	activeChatID = chatID
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(chatID, d.ConversationID)
	}
	a := d.Attachment
	text := fmt.Sprintf("📎 %s", a.FileName)
	if a.Caption != "" {
		text += "\n" + a.Caption
	}
	if a.Size > 0 {
		text += fmt.Sprintf(" (%s)", humanSize(a.Size))
	}
	sendFeishuAsync(chatID, text)

	if strings.HasPrefix(a.MimeType, "image/") {
		uploadImageToFeishu(chatID, a)
	} else {
		uploadFileToFeishu(chatID, a)
	}
}

func uploadImageToFeishu(chatID string, a struct {
	NodeID   string `json:"nodeId"`
	Path     string `json:"path"`
	FileName string `json:"fileName"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
	Caption  string `json:"caption"`
}) {
	withToken(func(token string) {
		if token == "" {
			return
		}
		url := feishuBaseURL + "/im/v1/images"
		resp := request("http.request", map[string]interface{}{
			"method":  "POST",
			"url":     url,
			"headers": map[string]string{"Authorization": "Bearer " + token},
			"body": map[string]interface{}{
				"kind":   "multipart",
				"fields": map[string]interface{}{"image_type": "message"},
				"files": []map[string]interface{}{
					{"field": "image", "nodeId": a.NodeID, "path": a.Path, "filename": a.FileName},
				},
			},
		})
		var result struct {
			RequestID string `json:"requestId"`
			Error     string `json:"error"`
		}
		json.Unmarshal([]byte(resp), &result)
		if result.Error != "" {
			logMsg("ERROR: 飞书图片上传失败: " + result.Error)
			return
		}
		if result.RequestID != "" {
			httpCallbacks[result.RequestID] = func(resp string) {
				var imgResp struct {
					Code int `json:"code"`
					Data struct {
						ImageKey string `json:"image_key"`
					} `json:"data"`
				}
				if json.Unmarshal([]byte(resp), &imgResp) == nil && imgResp.Code == 0 && imgResp.Data.ImageKey != "" {
					cb, _ := json.Marshal(map[string]string{"image_key": imgResp.Data.ImageKey})
					content := string(cb)
					bodyMap := map[string]string{"receive_id": chatID, "msg_type": "image", "content": content}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					hb, _ := json.Marshal(map[string]string{
						"Content-Type":  "application/json; charset=utf-8",
						"Authorization": "Bearer " + token,
					})
					hdrs := string(hb)
					httpRequestAsync("POST", sendURL, string(bodyBytes), hdrs, func(r string) {
						if !strings.Contains(r, `"code":0`) {
							logMsg("WARN: 飞书图片消息发送失败: " + r)
						}
					})
				}
			}
		}
	})
}

func uploadFileToFeishu(chatID string, a struct {
	NodeID   string `json:"nodeId"`
	Path     string `json:"path"`
	FileName string `json:"fileName"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
	Caption  string `json:"caption"`
}) {
	withToken(func(token string) {
		if token == "" {
			return
		}
		url := feishuBaseURL + "/im/v1/files"
		resp := request("http.request", map[string]interface{}{
			"method":  "POST",
			"url":     url,
			"headers": map[string]string{"Authorization": "Bearer " + token},
			"body": map[string]interface{}{
				"kind":   "multipart",
				"fields": map[string]interface{}{"file_type": "stream", "file_name": a.FileName},
				"files": []map[string]interface{}{
					{"field": "file", "nodeId": a.NodeID, "path": a.Path, "filename": a.FileName},
				},
			},
		})
		var result struct {
			RequestID string `json:"requestId"`
			Error     string `json:"error"`
		}
		json.Unmarshal([]byte(resp), &result)
		if result.Error != "" {
			logMsg("ERROR: 飞书文件上传失败: " + result.Error)
			return
		}
		if result.RequestID != "" {
			httpCallbacks[result.RequestID] = func(resp string) {
				var fileResp struct {
					Code int `json:"code"`
					Data struct {
						FileKey string `json:"file_key"`
					} `json:"data"`
				}
				if json.Unmarshal([]byte(resp), &fileResp) == nil && fileResp.Code == 0 && fileResp.Data.FileKey != "" {
					cb, _ := json.Marshal(map[string]string{"file_key": fileResp.Data.FileKey})
					content := string(cb)
					bodyMap := map[string]string{"receive_id": chatID, "msg_type": "file", "content": content}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					hb, _ := json.Marshal(map[string]string{
						"Content-Type":  "application/json; charset=utf-8",
						"Authorization": "Bearer " + token,
					})
					hdrs := string(hb)
					httpRequestAsync("POST", sendURL, string(bodyBytes), hdrs, func(r string) {
						if !strings.Contains(r, `"code":0`) {
							logMsg("WARN: 飞书文件消息发送失败: " + r)
						}
					})
				}
			}
		}
	})
}

func humanSize(b int64) string {
	const unit = 1024
	if b < unit {
		return strconv.FormatInt(b, 10) + " B"
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// ==================== 媒体下载 ====================

// 初始化下载回调
func init() {
	SetDownloadCallback(handleDownloadComplete)
}

// downloadFeishuMediaAsync 异步下载飞书媒体文件
// 下载完成后通过 handleDownloadComplete 处理
func downloadFeishuMediaAsync(messageID, fileKey, mediaType, chatID, senderOpenID, convID string) {
	fileName := fileKey
	if mediaType == "image" {
		fileName = fileKey + ".jpg"
	}
	sendDownloadRequest(messageID, fileKey, mediaType, chatID, senderOpenID, fileName, convID)
}

// sendDownloadRequest 发起下载请求
func sendDownloadRequest(messageID, fileKey, mediaType, chatID, senderOpenID, displayName, convID string) string {
	// 获取 token
	token := ""
	withToken(func(t string) {
		token = t
	})
	if token == "" {
		logMsg("ERROR: 获取飞书 token 失败")
		return ""
	}

	// 构建下载 URL
	downloadURL := fmt.Sprintf("%s/im/v1/messages/%s/resources/%s?type=%s",
		feishuBaseURL, messageID, fileKey, mediaType)

	// 生成保存路径
	fileName := fileKey
	if mediaType == "image" {
		fileName = fileKey + ".jpg"
	}
	savePath := fmt.Sprintf("${WEBOS_DATA_DIR}/uploads/feishu/%s/%s", chatID, fileName)

	// 使用 saveTo 参数让宿主机直接保存响应体到文件
	params := map[string]interface{}{
		"method":  "GET",
		"url":     downloadURL,
		"headers": map[string]string{"Authorization": "Bearer " + token},
		"saveTo":  savePath,
	}
	result, ok := requestJSON("http.request", params)
	if !ok {
		logMsg("ERROR: 发起下载请求失败")
		return ""
	}
	reqID, _ := result["requestId"].(string)
	if reqID == "" {
		logMsg("ERROR: 发起下载请求失败: 无 requestId")
		return ""
	}

	pendingDownloads[reqID] = &PendingDownload{
		ChatID:      chatID,
		SenderID:    senderOpenID,
		ConvID:      convID,
		FileName:    fileName,
		MediaType:   mediaType,
		DisplayName: displayName,
	}
	logMsg(fmt.Sprintf("开始下载飞书媒体: %s (reqID=%s)", displayName, reqID))
	return reqID
}

// handleDownloadComplete 处理下载完成事件
func handleDownloadComplete(pending *PendingDownload, respBody string) {
	if pending == nil {
		return
	}
	if respBody == "" {
		logMsg("ERROR: 下载飞书媒体失败: 空响应")
		return
	}

	// 解析响应（可能是 {"path":"...","size":...} 或 {"error":"..."}）
	var r struct {
		Path  string `json:"path"`
		Size  int    `json:"size"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(respBody), &r); err != nil {
		logMsg("ERROR: 解析下载响应失败: " + respBody[:min(len(respBody), 200)])
		return
	}
	if r.Error != "" {
		logMsg("ERROR: 下载飞书媒体失败: " + r.Error)
		return
	}

	// 返回相对路径
	relativePath := fmt.Sprintf("uploads/feishu/%s/%s", pending.ChatID, pending.FileName)
	logMsg(fmt.Sprintf("✅ 飞书媒体已保存: %s (%s)", relativePath, humanSize(int64(r.Size))))

	// 根据媒体类型构建不同的消息
	var userText string
	if pending.MediaType == "image" {
		userText = fmt.Sprintf("[用户发送了一张图片]\n图片: [文件: local_1:/opt/webos/%s]", relativePath)
	} else {
		userText = fmt.Sprintf("[用户发送了一个文件: %s]\n文件: [文件: local_1:/opt/webos/%s]", pending.DisplayName, relativePath)
	}

	convID := strings.TrimSpace(pending.ConvID)
	if convID == "" {
		convID = bindActiveChat(pending.ChatID)
	} else {
		activeChatID = strings.TrimSpace(pending.ChatID)
		setCurrentConversationID(activeChatID, convID)
	}
	if convID == "" {
		convID = ensureConversationID(pending.ChatID, userText)
	}
	if convID == "" {
		return
	}

	activeChatID = strings.TrimSpace(pending.ChatID)
	deltaCount = 0
	request("chat.send", map[string]interface{}{
		"conversationId": convID,
		"messageContent": userText,
		"clientId":       "feishu-ai-bot",
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
