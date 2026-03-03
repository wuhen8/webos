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
	token       string
	chatID      int // 从配置读取，所有 AI 回复都发到这个 chat
	initialized bool
	replyBuf    strings.Builder
	deltaCount  int  // 用于节流 typing 状态，每 N 次 delta 发一次
	inCodeBlock bool // 跟踪是否在 ``` 代码块内
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
	if s := configGet("telegram_chat_id"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			chatID = v
		}
	}
	if chatID == 0 {
		logMsg("WARN: telegram_chat_id 未配置，进入 discovery 模式，收到消息后会广播 chat_id")
	} else {
		logMsg(fmt.Sprintf("Telegram AI Bot 初始化完成 (token=...%s, chatID=%d)", token[len(token)-4:], chatID))
	}

	// 注册客户端上下文，让 AI 知道回复目标是 Telegram
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

	// 从 backend 获取命令列表，注册到 Telegram Bot Commands
	if chatID != 0 {
		registerBotCommands()
	}
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
	if chatID == 0 {
		return
	}
	var d struct {
		Content string `json:"content"`
	}
	json.Unmarshal(data, &d)
	replyBuf.WriteString(d.Content)

	// 每 20 次 delta 刷新一次 typing 状态
	deltaCount++
	if deltaCount%20 == 0 {
		sendTypingAction(chatID)
	}

	// 每次 delta 都尝试切割
	flushReplyBuf(false)
}

func onChatDone() {
	if chatID == 0 {
		return
	}
	// 强制刷出所有剩余内容
	flushReplyBuf(true)
	inCodeBlock = false
}

func onChatError(data json.RawMessage) {
	if chatID == 0 {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	flushReplyBuf(true)
	inCodeBlock = false
	sendTelegramAsync(chatID, "AI 错误: "+d.Error, nil)
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
			sendTelegramAsync(chatID, s, nil)
			return
		}

		cutPos := findCutPoint(s)
		if cutPos <= 0 {
			// 没有安全切点，但如果 buffer 太大就强制切（防止无限积压）
			if len(s) > 3500 {
				replyBuf.Reset()
				sendTelegramAsync(chatID, s, nil)
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
		sendTelegramAsync(chatID, segment, nil)
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
	if chatID == 0 {
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
		sendTelegramAsync(chatID, prefix+d.Text, nil)
	}
}

func onSystemNotify(data json.RawMessage) {
	if chatID == 0 {
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
	sendTelegramAsync(chatID, text, nil)
}

func pollOnce() {
	if token == "" {
		return
	}
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

			// Discovery 模式：chat_id 未配置，广播提示
			if chatID == 0 {
				userName := ""
				if msg.From != nil {
					userName = msg.From.FirstName
				}
				cidStr := strconv.Itoa(msg.Chat.ID)
				logMsg(fmt.Sprintf("[discovery] 收到来自 %s 的消息, chat_id=%s", userName, cidStr))

				// 广播系统通知给所有客户端
				request("broadcast_notify", map[string]interface{}{
					"level":   "info",
					"title":   "Telegram Chat ID",
					"message": fmt.Sprintf("用户 [%s] 发来消息，Chat ID: %s，请在 Telegram Bot 设置中填入", userName, cidStr),
					"source":  "telegram-ai-bot",
				})

				// 回复用户提示
				sendTelegramAsync(msg.Chat.ID, fmt.Sprintf(
					"⚙️ Bot 尚未配置 chat_id。\n\n你的 Chat ID 是: %s\n\n请在 WebOS 设置中将此 ID 填入 Telegram Bot 的 chat_id 配置项。",
					cidStr,
				), nil)
				continue
			}

			userText := msg.Text
			logMsg(fmt.Sprintf("[chat:%d] %s: %s", msg.Chat.ID, msg.From.FirstName, userText))
			if userText == "/start" {
				sendTelegramAsync(msg.Chat.ID, "你好！我是 WebOS AI 助手。直接发消息给我就可以对话。", nil)
				continue
			}
			// 发送"正在输入"状态，然后转发给 AI
			sendTypingAction(msg.Chat.ID)
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
	if chatID == 0 {
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

	// 根据 MIME 类型选择 Telegram API 和字段名
	var apiMethod, fileField string
	if strings.HasPrefix(a.MimeType, "image/") {
		apiMethod = "sendPhoto"
		fileField = "photo"
	} else {
		apiMethod = "sendDocument"
		fileField = "document"
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", token, apiMethod)

	fields := map[string]string{
		"chat_id": strconv.Itoa(chatID),
	}
	if a.Caption != "" {
		fields["caption"] = a.Caption
	}

	// 通过 file_proxy_post 让后端直接读文件并 multipart 上传给 Telegram
	resp := request("file_proxy_post", map[string]interface{}{
		"url":       url,
		"fileField": fileField,
		"nodeId":    a.NodeID,
		"path":      a.Path,
		"fileName":  a.FileName,
		"fields":    fields,
		"appId":     "telegram-ai-bot",
	})

	var result struct {
		RequestID string `json:"requestId"`
		Error     string `json:"error"`
	}
	json.Unmarshal([]byte(resp), &result)
	if result.Error != "" {
		logMsg("ERROR: file_proxy_post failed: " + result.Error)
		sendTelegramAsync(chatID, fmt.Sprintf("📎 %s (发送失败: %s)", a.FileName, result.Error), nil)
		return
	}
	// 注册回调，处理异步上传结果
	if result.RequestID != "" {
		httpCallbacks[result.RequestID] = func(resp string) {
			// 检测两种错误格式：Telegram API 的 "ok":false 和 host 端的 "error":"..."
			if strings.Contains(resp, `"ok":false`) || strings.Contains(resp, `"error"`) {
				logMsg("ERROR: file upload failed: " + resp)
				sendTelegramAsync(chatID, fmt.Sprintf("📎 %s (上传失败)", a.FileName), nil)
			}
		}
	}
}
