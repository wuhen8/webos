// 飞书 AI Bot — WebOS Wasm App (Reactor 模式)
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
	appID       string
	appSecret   string
	chatID      string // 飞书 chat_id（群组或单聊）
	initialized bool
	replyBuf    strings.Builder
	deltaCount  int
	inCodeBlock bool
)

func main() {}

func ensureInit() {
	if initialized {
		return
	}
	initialized = true

	appID = configGet("feishu_app_id")
	appSecret = configGet("feishu_app_secret")
	chatID = configGet("feishu_chat_id")

	if appID == "" || appSecret == "" {
		logMsg("ERROR: feishu_app_id 或 feishu_app_secret 未配置")
		return
	}
	if chatID == "" {
		logMsg("WARN: feishu_chat_id 未配置，飞书 Bot 需要 chat_id 才能拉取消息，请在飞书群设置中获取群 ID 并填入配置")
		return
	}

	logMsg(fmt.Sprintf("飞书 AI Bot 初始化完成 (appID=%s..., chatID=%s)", appID[:min(6, len(appID))], chatID))

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

	// 获取 bot 自身信息（用于过滤自己发的消息）
	fetchBotInfo()
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
	if chatID == "" {
		return
	}
	var d struct {
		Content string `json:"content"`
	}
	json.Unmarshal(data, &d)
	replyBuf.WriteString(d.Content)

	deltaCount++
	// 飞书没有 typing 状态 API，跳过

	flushReplyBuf(false)
}

func onChatDone() {
	if chatID == "" {
		return
	}
	flushReplyBuf(true)
	inCodeBlock = false
}

func onChatError(data json.RawMessage) {
	if chatID == "" {
		return
	}
	var d struct {
		Error string `json:"error"`
	}
	json.Unmarshal(data, &d)
	flushReplyBuf(true)
	inCodeBlock = false
	sendFeishuAsync(chatID, "AI 错误: "+d.Error)
}

// flushReplyBuf 从 buffer 中切出可安全发送的段落
func flushReplyBuf(force bool) {
	for {
		s := replyBuf.String()
		if strings.TrimSpace(s) == "" {
			replyBuf.Reset()
			return
		}
		if force {
			replyBuf.Reset()
			sendFeishuAsync(chatID, s)
			return
		}

		cutPos := findCutPoint(s)
		if cutPos <= 0 {
			if len(s) > 3500 {
				replyBuf.Reset()
				sendFeishuAsync(chatID, s)
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
		sendFeishuAsync(chatID, segment)
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

func isCodeFenceClose(trimmed string) bool {
	return trimmed == "```"
}

func isCodeFenceOpen(trimmed string) bool {
	return strings.HasPrefix(trimmed, "```")
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
	if chatID == "" {
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
		sendFeishuAsync(chatID, prefix+d.Text)
	}
}
func onSystemNotify(data json.RawMessage) {
	if chatID == "" {
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
	sendFeishuAsync(chatID, text)
}

func pollOnce() {
	if appID == "" || chatID == "" {
		return
	}
	// 用上次拉取的时间戳作为起点
	lastTime := kvGet("feishu_last_msg_time")
	if lastTime == "" {
		// 首次启动，用当前时间（秒级时间戳，飞书 API 需要秒级字符串）
		// 由于 wasm 环境没有 time 包，我们用一个标记让第一次 poll 跳过历史消息
		lastTime = "0"
		kvSet("feishu_last_msg_time", lastTime)
	}

	pullMessages(chatID, lastTime, func(msgs []feishuMessage) {
		if len(msgs) == 0 {
			return
		}
		for _, msg := range msgs {
			// 跳过 bot 自己发的消息
			if msg.Sender.SenderType == "app" {
				updateLastTime(msg.CreateTime)
				continue
			}
			if botOpenID != "" && msg.Sender.SenderID.OpenID == botOpenID {
				updateLastTime(msg.CreateTime)
				continue
			}

			// 只处理文本消息
			if msg.MsgType != "text" {
				updateLastTime(msg.CreateTime)
				continue
			}

			// 解析消息内容
			var content struct {
				Text string `json:"text"`
			}
			if json.Unmarshal([]byte(msg.Body.Content), &content) != nil || content.Text == "" {
				updateLastTime(msg.CreateTime)
				continue
			}

			userText := strings.TrimSpace(content.Text)
			// 去掉 @bot 的 mention 标记
			userText = stripAtMention(userText)
			if userText == "" {
				updateLastTime(msg.CreateTime)
				continue
			}

			logMsg(fmt.Sprintf("[chat:%s] %s: %s", msg.ChatID, msg.Sender.SenderID.OpenID, userText))

			updateLastTime(msg.CreateTime)

			deltaCount = 0
			request("chat_send", map[string]interface{}{
				"messageContent": userText,
				"clientId":       "feishu-ai-bot",
			})
		}
	})
}

// updateLastTime 更新最后处理的消息时间戳
func updateLastTime(createTime string) {
	stored := kvGet("feishu_last_msg_time")
	if createTime > stored {
		kvSet("feishu_last_msg_time", createTime)
	}
}

// stripAtMention 去掉飞书消息中的 @bot mention
// 飞书文本消息中 @bot 会以 @_user_1 等形式出现
func stripAtMention(text string) string {
	// 飞书 @mention 格式: @_user_N 或 @_all
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

// onMediaAttachment 处理 AI 发送的文件/图片附件
func onMediaAttachment(data json.RawMessage) {
	if chatID == "" {
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

	// 飞书上传文件需要先上传到飞书服务器获取 file_key，再发送消息
	// 这里简化处理：发送文件名和说明文本
	text := fmt.Sprintf("📎 %s", a.FileName)
	if a.Caption != "" {
		text += "\n" + a.Caption
	}
	if a.Size > 0 {
		text += fmt.Sprintf(" (%s)", humanSize(a.Size))
	}
	sendFeishuAsync(chatID, text)

	// 尝试通过 file_proxy_post 上传到飞书
	// 飞书上传图片 API: POST /im/v1/images (form-data: image_type=message_type, image=file)
	if strings.HasPrefix(a.MimeType, "image/") {
		uploadImageToFeishu(a)
	} else {
		uploadFileToFeishu(a)
	}
}

func uploadImageToFeishu(a struct {
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
		fields := map[string]string{
			"image_type": "message",
		}
		resp := request("file_proxy_post", map[string]interface{}{
			"url":       url,
			"fileField": "image",
			"nodeId":    a.NodeID,
			"path":      a.Path,
			"fileName":  a.FileName,
			"fields":    fields,
			"appId":     "feishu-ai-bot",
			"headers":   map[string]string{"Authorization": "Bearer " + token},
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
					// 发送图片消息
					content := mustJSON(map[string]string{"image_key": imgResp.Data.ImageKey})
					bodyMap := map[string]string{
						"receive_id": chatID,
						"msg_type":   "image",
						"content":    content,
					}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					headers := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
					httpRequestAsync("POST", sendURL, string(bodyBytes), headers, func(resp string) {
						if !strings.Contains(resp, `"code":0`) {
							logMsg("WARN: 飞书图片消息发送失败: " + resp)
						}
					})
				} else {
					logMsg("WARN: 飞书图片上传响应异常: " + resp)
				}
			}
		}
	})
}

func uploadFileToFeishu(a struct {
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
		fields := map[string]string{
			"file_type": "stream",
			"file_name": a.FileName,
		}
		resp := request("file_proxy_post", map[string]interface{}{
			"url":       url,
			"fileField": "file",
			"nodeId":    a.NodeID,
			"path":      a.Path,
			"fileName":  a.FileName,
			"fields":    fields,
			"appId":     "feishu-ai-bot",
			"headers":   map[string]string{"Authorization": "Bearer " + token},
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
					bodyMap := map[string]string{
						"receive_id": chatID,
						"msg_type":   "file",
						"content":    content,
					}
					bodyBytes, _ := json.Marshal(bodyMap)
					sendURL := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"
					headers := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
					httpRequestAsync("POST", sendURL, string(bodyBytes), headers, func(resp string) {
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
