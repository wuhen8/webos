// 飞书 AI Bot — WebOS Wasm App (长连接模式)
//
// 通过飞书 WebSocket 长连接接收事件，不再轮询拉取消息。
// Build: GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
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
	wsConnID     string // 当前 WebSocket 连接 ID
	wsConnecting bool   // 是否正在连接中
	wsReady      bool   // 连接是否就绪
	tickCount    int    // tick 计数，用于重连间隔控制
)

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

	// 注册客户端上下文
	request("register_client_context", map[string]interface{}{
		"id":          "feishu-ai-bot",
		"platform":    "feishu",
		"displayName": "飞书 Bot",
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

	// 获取 bot 自身信息
	fetchBotInfo()

	// 启动长连接
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
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return 1
	}
	switch ev.Type {
	case "http_response":
		handleHTTPResponse(ev.Data)
	case "chat_delta":
		onChatDelta(ev.Data)
	case "chat_done":
		onChatDone()
	case "chat_error":
		onChatError(ev.Data)
	case "chat_command_result":
		onCommandResult(ev.Data)
	case "chat_media":
		onMediaAttachment(ev.Data)
	case "system_notify":
		onSystemNotify(ev.Data)

	// WebSocket 事件（宿主推送）
	case "ws_open":
		onWSOpen(ev.Data)
	case "ws_message":
		onWSMessage(ev.Data)
	case "ws_close":
		onWSClose(ev.Data)
	case "ws_error":
		onWSError(ev.Data)

	case "tick":
		ensureInit()
		onTick()
	}
	return 0
}

// ==================== 飞书长连接管理 ====================

// startWSConnection 获取飞书 WSS URL 并建立长连接
func startWSConnection() {
	if wsConnecting || wsReady {
		return
	}
	wsConnecting = true
	logMsg("正在获取飞书长连接地址...")

	refreshToken(func(token string) {
		if token == "" {
			wsConnecting = false
			logMsg("ERROR: 获取 token 失败，无法建立长连接")
			return
		}
		// 调用飞书长连接 endpoint
		url := feishuBaseURL + "/callback/ws/endpoint"
		headers := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
		httpRequestAsync("POST", url, "{}", headers, func(resp string) {
			wsConnecting = false
			var r struct {
				Code int `json:"code"`
				Msg  string `json:"msg"`
				Data struct {
					URL string `json:"URL"`
				} `json:"data"`
			}
			if json.Unmarshal([]byte(resp), &r) != nil || r.Code != 0 {
				logMsg("ERROR: 获取飞书 WS URL 失败: " + resp[:min(len(resp), 300)])
				return
			}
			if r.Data.URL == "" {
				logMsg("ERROR: 飞书返回空 WS URL")
				return
			}
			logMsg("飞书 WS URL 获取成功，正在连接...")
			wsConnID = wsConnect(r.Data.URL, "")
			if wsConnID == "" {
				logMsg("ERROR: wsConnect 调用失败")
			}
		})
	})
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
	handleFeishuWSMessage(d.Data)
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

// onTick 定时检查连接状态，断线重连
func onTick() {
	tickCount++
	if appID == "" || appSecret == "" {
		return
	}
	// 每 10 个 tick（约 30 秒）检查一次，避免频繁重连
	if !wsReady && !wsConnecting && tickCount%10 == 0 {
		logMsg("尝试重新建立飞书长连接...")
		startWSConnection()
	}
}

// ==================== 飞书 WS 消息解析 ====================

// handleFeishuWSMessage 解析飞书长连接推送的消息
func handleFeishuWSMessage(raw string) {
	// 飞书长连接消息格式：
	// {"headers":{"event_id":"...","event_type":"...","token":"...","message_id":"..."},"event":{...}}
	// 或 ping/pong 心跳
	var envelope struct {
		Type    string `json:"type"`
		Headers struct {
			EventID   string `json:"event_id"`
			EventType string `json:"event_type"`
			Token     string `json:"token"`
			MessageID string `json:"message_id"`
		} `json:"headers"`
		Event json.RawMessage `json:"event"`
	}
	if json.Unmarshal([]byte(raw), &envelope) != nil {
		return
	}

	// 心跳 pong：飞书会发 ping，我们需要回 pong
	if envelope.Type == "pong" {
		return
	}
	if envelope.Type == "ping" {
		pong := `{"type":"pong"}`
		wsSend(wsConnID, []byte(pong))
		return
	}

	// 回复 ACK（飞书要求收到事件后回复，否则会重推）
	if envelope.Headers.MessageID != "" {
		ack := fmt.Sprintf(`{"headers":{"message_id":"%s"},"type":"ack"}`, envelope.Headers.MessageID)
		wsSend(wsConnID, []byte(ack))
	}

	// 处理事件
	switch envelope.Headers.EventType {
	case "im.message.receive_v1":
		handleIMMessage(envelope.Event)
	default:
		// 其他事件类型暂不处理
		if envelope.Headers.EventType != "" {
			logMsg("收到飞书事件: " + envelope.Headers.EventType)
		}
	}
}

// handleIMMessage 处理收到的即时消息事件
func handleIMMessage(eventData json.RawMessage) {
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
	if json.Unmarshal(eventData, &ev) != nil {
		return
	}

	// 跳过 bot 自己发的消息
	if ev.Sender.SenderType == "app" {
		return
	}
	if botOpenID != "" && ev.Sender.SenderID.OpenID == botOpenID {
		return
	}

	// 只处理文本消息
	if ev.Message.MessageType != "text" {
		return
	}

	// 解析消息内容
	var content struct {
		Text string `json:"text"`
	}
	if json.Unmarshal([]byte(ev.Message.Content), &content) != nil || content.Text == "" {
		return
	}

	userText := strings.TrimSpace(content.Text)
	userText = stripAtMention(userText)
	if userText == "" {
		return
	}

	// 记住回复目标 chat_id
	currentChatID = ev.Message.ChatID

	logMsg(fmt.Sprintf("[chat:%s] %s: %s", ev.Message.ChatID, ev.Sender.SenderID.OpenID, userText))

	deltaCount = 0
	request("chat_send", map[string]interface{}{
		"messageContent": userText,
		"clientId":       "feishu-ai-bot",
	})
}

// currentChatID 当前正在对话的 chat_id（从最近收到的消息中获取）
var currentChatID string

// stripAtMention 去掉飞书消息中的 @bot mention
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

// ==================== AI 回复处理 ====================

func getChatID() string {
	// 优先用长连接收到的 chatID，兜底用配置的
	if currentChatID != "" {
		return currentChatID
	}
	return configGet("feishu_chat_id")
}

func onChatDelta(data json.RawMessage) {
	cid := getChatID()
	if cid == "" {
		return
	}
	var d struct {
		Content string `json:"content"`
	}
	json.Unmarshal(data, &d)
	replyBuf.WriteString(d.Content)
	deltaCount++
	flushReplyBuf(false)
}

func onChatDone() {
	cid := getChatID()
	if cid == "" {
		return
	}
	flushReplyBuf(true)
	inCodeBlock = false
}

func onChatError(data json.RawMessage) {
	cid := getChatID()
	if cid == "" {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	flushReplyBuf(true)
	inCodeBlock = false
	sendFeishuAsync(cid, "AI 错误: "+d.Error)
}

func flushReplyBuf(force bool) {
	cid := getChatID()
	for {
		s := replyBuf.String()
		if strings.TrimSpace(s) == "" {
			replyBuf.Reset()
			return
		}
		if force {
			replyBuf.Reset()
			sendFeishuAsync(cid, s)
			return
		}

		cutPos := findCutPoint(s)
		if cutPos <= 0 {
			if len(s) > 3500 {
				replyBuf.Reset()
				sendFeishuAsync(cid, s)
			}
			return
		}

		segment := s[:cutPos]
		replyBuf.Reset()
		replyBuf.WriteString(s[cutPos:])

		for _, line := range strings.SplitAfter(segment, "\n") {
			trimmed := strings.TrimSpace(line)
			if inCodeBlock {
				if isCodeFenceClose(trimmed) {
					inCodeBlock = false
				}
			} else {
				if isCodeFenceOpen(trimmed) {
					inCodeBlock = true
				}
			}
		}
		sendFeishuAsync(cid, segment)
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
			if isCodeFenceClose(trimmed) {
				localInCode = false
				codeCloses = append(codeCloses, pos)
			}
		} else {
			if isCodeFenceOpen(trimmed) {
				localInCode = true
			}
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

func isCodeFenceClose(trimmed string) bool { return trimmed == "```" }
func isCodeFenceOpen(trimmed string) bool  { return strings.HasPrefix(trimmed, "```") }

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
	cid := getChatID()
	if cid == "" {
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
		sendFeishuAsync(cid, prefix+d.Text)
	}
}

func onSystemNotify(data json.RawMessage) {
	cid := getChatID()
	if cid == "" {
		return
	}
	var d struct {
		Level   string `json:"level"`
		Title   string `json:"title"`
		Message string `json:"message"`
		Source  string `json:"source"`
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
	}
	text := icon + " "
	if d.Title != "" {
		text += d.Title + "\n"
	}
	text += d.Message
	sendFeishuAsync(cid, text)
}

// onMediaAttachment 处理 AI 发送的文件/图片附件
func onMediaAttachment(data json.RawMessage) {
	cid := getChatID()
	if cid == "" {
		return
	}
	var d struct {
		Attachment struct {
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
	a := d.Attachment

	text := fmt.Sprintf("📎 %s", a.FileName)
	if a.Caption != "" {
		text += "\n" + a.Caption
	}
	if a.Size > 0 {
		text += fmt.Sprintf(" (%s)", humanSize(a.Size))
	}
	sendFeishuAsync(cid, text)

	if strings.HasPrefix(a.MimeType, "image/") {
		uploadImageToFeishu(cid, a)
	} else {
		uploadFileToFeishu(cid, a)
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
		fields := map[string]string{"image_type": "message"}
		resp := request("file_proxy_post", map[string]interface{}{
			"url": url, "fileField": "image", "nodeId": a.NodeID,
			"path": a.Path, "fileName": a.FileName, "fields": fields,
			"appId": "feishu-ai-bot", "headers": map[string]string{"Authorization": "Bearer " + token},
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
					content := mustJSON(map[string]string{"image_key": imgResp.Data.ImageKey})
					bodyMap := map[string]string{"receive_id": chatID, "msg_type": "image", "content": content}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					hdrs := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
					httpRequestAsync("POST", sendURL, string(bodyBytes), hdrs, func(resp string) {
						if !strings.Contains(resp, `"code":0`) {
							logMsg("WARN: 飞书图片消息发送失败: " + resp)
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
		fields := map[string]string{"file_type": "stream", "file_name": a.FileName}
		resp := request("file_proxy_post", map[string]interface{}{
			"url": url, "fileField": "file", "nodeId": a.NodeID,
			"path": a.Path, "fileName": a.FileName, "fields": fields,
			"appId": "feishu-ai-bot", "headers": map[string]string{"Authorization": "Bearer " + token},
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
					content := mustJSON(map[string]string{"file_key": fileResp.Data.FileKey})
					bodyMap := map[string]string{"receive_id": chatID, "msg_type": "file", "content": content}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					hdrs := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
					httpRequestAsync("POST", sendURL, string(bodyBytes), hdrs, func(resp string) {
						if !strings.Contains(resp, `"code":0`) {
							logMsg("WARN: 飞书文件消息发送失败: " + resp)
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
