// Telegram AI Bot — WebOS Wasm App (Reactor 模式)
//
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
	token          string
	allowedChatIDs map[int]bool // 授权的 chat_id 集合
	activeChatID   int          // 当前活跃的 chat_id（AI 回复发到这里）
	initialized    bool
	polling        bool // 防止重复轮询
	replyBuf       strings.Builder
	deltaCount     int
	inCodeBlock    bool
)

func main() {}

func ensureInit() {
	if initialized {
		return
	}
	initialized = true
	token = configGet("telegram_token")
	if token == "" {
		logMsg("ERROR: telegram_token not configured")
		return
	}

	// 加载授权 chat_id 列表（支持逗号分隔多个）
	allowedChatIDs = make(map[int]bool)
	loadAllowedChatIDs()

	if len(allowedChatIDs) == 0 {
		logMsg("Telegram AI Bot 初始化完成 (token=...%s, 自动注册模式：首个发消息的用户将被自动授权)" + token[len(token)-4:])
	} else {
		logMsg(fmt.Sprintf("Telegram AI Bot 初始化完成 (token=...%s, 授权用户=%d个)", token[len(token)-4:], len(allowedChatIDs)))
	}

	request("register_client_context", map[string]interface{}{
		"id":          "telegram-ai-bot",
		"platform":    "telegram",
		"displayName": "Telegram Bot",
		"capabilities": []string{"markdown_basic", "code_blocks", "bold", "italic", "links"},
		"constraints":  []string{"max_message_4096", "no_tables", "no_html", "no_latex", "no_images_inline"},
		"systemHint": "当前用户通过 Telegram 客户端与你对话。请遵守以下格式规则：\n" +
			"1. 使用简洁的文本回复，避免过长的段落\n" +
			"2. 代码块使用 ``` 包裹（Telegram 支持）\n" +
			"3. 支持 *粗体*、_斜体_、`行内代码`\n" +
			"4. 不要使用 HTML 表格、LaTeX 公式、图片嵌入等 Telegram 不支持的格式\n" +
			"5. 列表使用简单的 - 或数字编号，不要嵌套太深\n" +
			"6. 回复尽量精炼，移动端阅读体验优先",
	})

	if len(allowedChatIDs) > 0 {
		registerBotCommands()
	}
}

// loadAllowedChatIDs 从配置和 KV 加载授权 chat_id
func loadAllowedChatIDs() {
	// 从配置读取（用户手动设置的 + 自动注册的，都在同一个 config 字段）
	if s := configGet("telegram_chat_id"); s != "" {
		for _, part := range strings.Split(s, ",") {
			part = strings.TrimSpace(part)
			if v, err := strconv.Atoi(part); err == nil && v != 0 {
				allowedChatIDs[v] = true
			}
		}
	}
}

// saveAutoChatID 自动注册新的 chat_id
func saveAutoChatID(cid int) {
	allowedChatIDs[cid] = true
	// 保存到 config（和 token、代理等配置在同一个地方，设置页面可见可编辑）
	var ids []string
	for id := range allowedChatIDs {
		ids = append(ids, strconv.Itoa(id))
	}
	configSet("telegram_chat_id", strings.Join(ids, ","))
}

// isChatAllowed 检查 chat_id 是否已授权
func isChatAllowed(cid int) bool {
	return allowedChatIDs[cid]
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
	case "tick":
		ensureInit()
		pollOnce()
	}
	return 0
}

func onChatDelta(data json.RawMessage) {
	if activeChatID == 0 {
		return
	}
	var d struct {
		Content string `json:"content"`
	}
	json.Unmarshal(data, &d)
	replyBuf.WriteString(d.Content)

	deltaCount++
	if deltaCount%20 == 0 {
		sendTypingAction(activeChatID)
	}

	flushReplyBuf(false)
}

func onChatDone() {
	if activeChatID == 0 {
		return
	}
	flushReplyBuf(true)
	inCodeBlock = false
}

func onChatError(data json.RawMessage) {
	if activeChatID == 0 {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	flushReplyBuf(true)
	inCodeBlock = false
	sendTelegramAsync(activeChatID, "AI 错误: "+d.Error, nil)
}

// flushReplyBuf 从 buffer 中切出可安全发送的段落。
// force=true 时无条件发送所有剩余内容（用于 done/error）。
func flushReplyBuf(force bool) {
	for {
		s := replyBuf.String()
		if strings.TrimSpace(s) == "" {
			replyBuf.Reset()
			return
		}
		if force {
			replyBuf.Reset()
			sendTelegramAsync(activeChatID, s, nil)
			return
		}

		cutPos := findCutPoint(s)
		if cutPos <= 0 {
			// 没有安全切点，但如果 buffer 太大就强制切（防止无限积压）
			if len(s) > 3500 {
				replyBuf.Reset()
				sendTelegramAsync(activeChatID, s, nil)
			}
			return
		}

		segment := s[:cutPos]
		replyBuf.Reset()
		replyBuf.WriteString(s[cutPos:])

		// 同步 inCodeBlock 状态
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
		sendTelegramAsync(activeChatID, segment, nil)
	}
}

// findCutPoint 在 buffer 中找到一个安全的切割位置。
// 返回 0 表示当前不应切割。
//
// 规则：
//   - ``` 代码块未闭合 → 不切
//   - 闭合后在空行或句末标点处切割
//   - 兜底：buffer 超过 3000 强制切（在 flushReplyBuf 中处理）
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
			// 在代码块内，只有单独的 ``` 才是闭合
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
// isCodeFenceClose 判断一行是否是代码块的闭合行。
// 已在代码块内时，只有 trim 后恰好是 ``` 才算闭合，```python 这种不算。
func isCodeFenceClose(trimmed string) bool {
	return trimmed == "```"
}

// isCodeFenceOpen 判断一行是否是代码块的开启行。
// ``` 或 ```language 都算开启。
func isCodeFenceOpen(trimmed string) bool {
	return strings.HasPrefix(trimmed, "```")
}


// endsWithSentence 检测行尾是否是句末标点
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
	if activeChatID == 0 {
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
		sendTelegramAsync(activeChatID, prefix+d.Text, nil)
	}
}

func onSystemNotify(data json.RawMessage) {
	// 广播给所有已授权的 chat_id
	if len(allowedChatIDs) == 0 {
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
	// 发送给所有已授权的用户
	for cid := range allowedChatIDs {
		sendTelegramAsync(cid, text, nil)
	}
}

func pollOnce() {
	if token == "" || polling {
		return
	}
	polling = true
	lastUpdateID := 0
	if s := kvGet("last_update_id"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			lastUpdateID = v
		}
	}
	offset := lastUpdateID + 1
	url := fmt.Sprintf(
		"https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=0&limit=10",
		token, offset,
	)
	httpRequestAsync("GET", url, "", "", func(resp string) {
		polling = false
		if resp == "" || resp[0] != '{' {
			if resp != "" {
				logMsg("WARN: getUpdates non-JSON response: " + resp[:min(len(resp), 100)])
			}
			return
		}
		var tgResp TelegramResponse
		if err := json.Unmarshal([]byte(resp), &tgResp); err != nil {
			logMsg("ERROR: parse Telegram response: " + err.Error())
			return
		}
		if !tgResp.OK || len(tgResp.Result) == 0 {
			return
		}
		for _, update := range tgResp.Result {
			kvSet("last_update_id", strconv.Itoa(update.UpdateID))
			if update.Message == nil || update.Message.Text == "" {
				continue
			}
			msg := update.Message

			incomingCID := msg.Chat.ID
			userName := ""
			if msg.From != nil {
				userName = msg.From.FirstName
			}

			// 自动注册模式：没有任何授权用户时，第一个发消息的自动授权
			if len(allowedChatIDs) == 0 {
				saveAutoChatID(incomingCID)
				logMsg(fmt.Sprintf("自动授权首个用户: %s (chat_id=%d)", userName, incomingCID))
				sendTelegramAsync(incomingCID, fmt.Sprintf(
					"✅ 你已被自动授权为 Bot 用户。\n\n你的 Chat ID: %d\n\n直接发消息即可开始对话。",
					incomingCID,
				), nil)
				registerBotCommands()
				continue
			}

			// 未授权用户：返回提示
			if !isChatAllowed(incomingCID) {
				cidStr := strconv.Itoa(incomingCID)
				logMsg(fmt.Sprintf("[未授权] %s (chat_id=%s)", userName, cidStr))
				sendTelegramAsync(incomingCID, fmt.Sprintf(
					"🚫 未授权访问。\n\n你的 Chat ID: %s\n\n请联系管理员将此 ID 添加到 Bot 配置中。",
					cidStr,
				), nil)
				continue
			}

			userText := msg.Text
			logMsg(fmt.Sprintf("[chat:%d] %s: %s", incomingCID, userName, userText))
			if userText == "/start" {
				sendTelegramAsync(incomingCID, "你好！我是 WebOS AI 助手。直接发消息给我就可以对话。", nil)
				continue
			}
			// 设置活跃 chat_id，AI 回复会发到这里
			activeChatID = incomingCID
			sendTypingAction(incomingCID)
			deltaCount = 0
			request("chat_send", map[string]interface{}{
				"messageContent": userText,
				"clientId":       "telegram-ai-bot",
			})
		}
	})
}

// onMediaAttachment 处理 AI 发送的文件/图片附件
func onMediaAttachment(data json.RawMessage) {
	if activeChatID == 0 {
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

	var apiMethod, fileField string
	if strings.HasPrefix(a.MimeType, "image/") {
		apiMethod = "sendPhoto"
		fileField = "photo"
	} else {
		apiMethod = "sendDocument"
		fileField = "document"
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", token, apiMethod)

	body := map[string]interface{}{
		fileField: "[file:" + a.NodeID + ":" + a.Path + "]",
		"chat_id": strconv.Itoa(activeChatID),
	}
	if a.Caption != "" {
		body["caption"] = a.Caption
	}

	resp := request("http_request", map[string]interface{}{
		"appId":     "telegram-ai-bot",
		"method":    "POST",
		"url":       url,
		"format":    "multipart",
		"fileField": fileField,
		"body":      body,
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)
	if result.Error != "" {
		logMsg("ERROR: http_request failed: " + result.Error)
		sendTelegramAsync(activeChatID, fmt.Sprintf("📎 %s (发送失败: %s)", a.FileName, result.Error), nil)
		return
	}
	if result.RequestID != "" {
		cid := activeChatID
		httpCallbacks[result.RequestID] = func(resp string) {
			if strings.Contains(resp, `"ok":false`) || strings.Contains(resp, `"error"`) {
				logMsg("ERROR: file upload failed: " + resp)
				sendTelegramAsync(cid, fmt.Sprintf("📎 %s (上传失败)", a.FileName), nil)
			}
		}
	}
}
