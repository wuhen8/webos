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
		// 自动设置 activeChatID 为第一个授权用户
		for cid := range allowedChatIDs {
			activeChatID = cid
			logMsg(fmt.Sprintf("自动设置活跃 chat: %d", cid))
			break
		}
	}

	request("client_context.register", map[string]interface{}{
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
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return 1
	}
	switch ev.Method {
	case "host.response":
		handleHostResponse(ev.Params)
	case "chat.delta":
		onChatDelta(ev.Params)
	case "chat.done":
		onChatDone()
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
	if d.Content == "" {
		return
	}
	noteReplyStreamDelta(activeChatID, d.Content)
}

func onChatDone() {
	if activeChatID == 0 {
		return
	}
	finishReplyStream(activeChatID)
}

func onChatError(data json.RawMessage) {
	if activeChatID == 0 {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	finishReplyStream(activeChatID)
	sendTelegramAsync(activeChatID, "AI 错误: "+d.Error, nil)
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
	// 发送给所有已授权的用户
	for cid := range allowedChatIDs {
		sendTelegramAsync(cid, text, nil)
	}
}
// startTelegramDownload 第一步：调 getFile 获取文件路径，然后异步下载
func startTelegramDownload(fileID, fileName string, chatID int, userName, userText string) {
	getFileURL := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", token, fileID)
	httpRequestAsync("GET", getFileURL, "", "", func(resp string) {
		var r struct {
			OK     bool `json:"ok"`
			Result struct {
				FilePath string `json:"file_path"`
			} `json:"result"`
		}
		if json.Unmarshal([]byte(resp), &r) != nil || !r.OK || r.Result.FilePath == "" {
			logMsg("ERROR: getFile failed: " + resp[:min(len(resp), 200)])
			// 降级：只发文本
			if userText != "" {
				beginReplyStream(chatID)
				request("chat.send", map[string]interface{}{
					"messageContent": userText,
					"clientId":       "telegram-ai-bot",
				})
			}
			return
		}

		// 构建下载 URL 和保存路径
		downloadURL := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", token, r.Result.FilePath)
		savePath := fmt.Sprintf("${WEBOS_DATA_DIR}/uploads/telegram/%d/%s", chatID, fileName)

		reqID := downloadFileAsync(downloadURL, savePath)
		if reqID == "" {
			logMsg("ERROR: 发起下载失败: " + fileName)
			return
		}
		pendingDownloads[reqID] = &PendingDownload{
			ChatID:   chatID,
			UserName: userName,
			UserText: userText,
			FileName: fileName,
		}
		logMsg(fmt.Sprintf("开始下载 Telegram 文件: %s (reqID=%s)", fileName, reqID))
	})
}

// onDownloadComplete 文件下载完成后，拼接路径发给 AI
func onDownloadComplete(pd *PendingDownload, savedPath, errMsg string) {
	if errMsg != "" {
		logMsg(fmt.Sprintf("[chat:%d] 下载文件失败: %s", pd.ChatID, errMsg))
		// 降级：只发文本
		if pd.UserText != "" {
			beginReplyStream(pd.ChatID)
			request("chat.send", map[string]interface{}{
				"messageContent": pd.UserText,
				"clientId":       "telegram-ai-bot",
			})
		}
		return
	}

	// 从绝对路径提取相对路径
	relativePath := savedPath
	if idx := strings.Index(savedPath, "/uploads/"); idx >= 0 {
		relativePath = savedPath[idx+1:]
	}
	logMsg(fmt.Sprintf("✅ 文件已保存: %s", relativePath))

	// 拼接消息
	fileInfo := fmt.Sprintf("[文件: local_1:/opt/webos/%s]", relativePath)
	userText := pd.UserText
	if userText != "" {
		userText = userText + "\n" + fileInfo
	} else {
		userText = fileInfo
	}

	beginReplyStream(pd.ChatID)
	logMsg(fmt.Sprintf("[chat:%d] %s", pd.ChatID, userText[:min(len(userText), 100)]))
	request("chat.send", map[string]interface{}{
		"messageContent": userText,
		"clientId":       "telegram-ai-bot",
	})
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
			if update.Message == nil {
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

			// 判断消息类型：图片、文件、纯文本
			userText := msg.Text
			if userText == "" {
				userText = msg.Caption // 图片/文件可能带 caption
			}

			// 处理图片
			if len(msg.Photo) > 0 {
				// 取最大尺寸的图片
				best := msg.Photo[len(msg.Photo)-1]
				logMsg(fmt.Sprintf("[chat:%d] %s: [图片 %dx%d]", incomingCID, userName, best.Width, best.Height))
				sendTypingAction(incomingCID)
				startTelegramDownload(best.FileID, best.FileUniqueID+".jpg", incomingCID, userName, userText)
				continue
			}

			// 处理文件
			if msg.Document != nil {
				fileName := msg.Document.FileName
				if fileName == "" {
					fileName = msg.Document.FileID
				}
				logMsg(fmt.Sprintf("[chat:%d] %s: [文件 %s]", incomingCID, userName, fileName))
				sendTypingAction(incomingCID)
				startTelegramDownload(msg.Document.FileID, fileName, incomingCID, userName, userText)
				continue
			}

			// 纯文本
			if userText == "" {
				continue
			}
			logMsg(fmt.Sprintf("[chat:%d] %s: %s", incomingCID, userName, userText))
			if userText == "/start" {
				sendTelegramAsync(incomingCID, "你好！我是 WebOS AI 助手。直接发消息给我就可以对话。", nil)
				continue
			}
			beginReplyStream(incomingCID)
			sendTypingAction(incomingCID)
			request("chat.send", map[string]interface{}{
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

	resp := request("http.request", map[string]interface{}{
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
		logMsg("ERROR: http.request failed: " + result.Error)
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
