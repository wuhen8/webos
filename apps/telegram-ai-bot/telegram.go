package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

type TelegramResponse struct {
	OK     bool     `json:"ok"`
	Result []Update `json:"result"`
}

type Update struct {
	UpdateID int      `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	MessageID int         `json:"message_id"`
	From      *User       `json:"from"`
	Chat      Chat        `json:"chat"`
	Text      string      `json:"text"`
	Caption   string      `json:"caption"`
	Photo     []PhotoSize `json:"photo"`
	Document  *Document   `json:"document"`
}

type PhotoSize struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	FileSize     int    `json:"file_size"`
}

type Document struct {
	FileID   string `json:"file_id"`
	FileName string `json:"file_name"`
	MimeType string `json:"mime_type"`
	FileSize int    `json:"file_size"`
}

type User struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
}

type Chat struct {
	ID int `json:"id"`
}

type telegramQueueItem struct {
	kind           string // "send", "draft", "edit"
	chatID         int
	messageID      int
	draftID        int
	text           string
	enableMarkdown bool
	callback       func(success bool, resp string)
}

var (
	sendQueue []telegramQueueItem
	sending   bool
)

const tgMaxMessageLen = 4096

func splitTelegramText(text string, limit int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	var out []string
	for len(text) > limit {
		cut := limit
		prefix := text[:cut]
		if idx := strings.LastIndex(prefix, "\n\n"); idx >= limit/2 {
			cut = idx + 2
		} else if idx := strings.LastIndex(prefix, "\n"); idx >= limit/2 {
			cut = idx + 1
		} else if idx := strings.LastIndexAny(prefix, "。！？；：.!?;:"); idx >= limit/2 {
			_, size := utf8.DecodeRuneInString(prefix[idx:])
			if size > 0 {
				cut = idx + size
			} else {
				cut = idx + 1
			}
		} else if idx := strings.LastIndexAny(prefix, " \t"); idx >= limit/2 {
			cut = idx + 1
		}
		out = append(out, text[:cut])
		text = strings.TrimLeft(text[cut:], "\n")
	}
	if text != "" {
		out = append(out, text)
	}
	return out
}

// sendTelegramAsync 发送普通消息（用于非流式场景）
func sendTelegramAsync(chatID int, text string, cb func(string)) {
	chunks := splitTelegramText(text, tgMaxMessageLen)
	if len(chunks) == 0 {
		return
	}
	for i, chunk := range chunks {
		isLast := i == len(chunks)-1
		queueTelegramItem(telegramQueueItem{
			kind:           "send",
			chatID:         chatID,
			text:           chunk,
			enableMarkdown: true,
			callback: func(success bool, resp string) {
				if isLast && cb != nil {
					cb(resp)
				}
			},
		})
	}
}

// sendTelegramDraftAsync 发送草稿（流式输出，不排队直接发）
func sendTelegramDraftAsync(chatID, draftID int, text string, cb func(success bool)) {
	// 不走队列，直接发送
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessageDraft", token)

	var escapedText string
	var parseMode interface{} = nil
	if escaped, ok := escapeMarkdownV2(text); ok {
		escapedText = escaped
		parseMode = "MarkdownV2"
	} else {
		escapedText = text
	}

	payload := map[string]interface{}{
		"chat_id":  chatID,
		"draft_id": draftID,
		"text":     escapedText,
	}
	if parseMode != nil {
		payload["parse_mode"] = parseMode
	}

	body, _ := json.Marshal(payload)
	httpRequestAsync("POST", url, string(body), "{\"Content-Type\":\"application/json\"}", func(resp string) {
		success := isTelegramResponseOK(resp)
		if !success {
			logMsg(fmt.Sprintf("ERROR: sendMessageDraft failed: %s", parseTelegramAPIError(resp)))
		}
		if cb != nil {
			cb(success)
		}
	})
}

func queueTelegramItem(item telegramQueueItem) {
	sendQueue = append(sendQueue, item)
	drainSendQueue()
}

func drainSendQueue() {
	if sending || len(sendQueue) == 0 {
		return
	}
	sending = true
	item := sendQueue[0]
	sendQueue = sendQueue[1:]
	executeTelegramItem(item)
}

func executeTelegramItem(item telegramQueueItem) {
	var apiMethod string
	switch item.kind {
	case "send":
		apiMethod = "sendMessage"
	case "draft":
		apiMethod = "sendMessageDraft"
	case "edit":
		apiMethod = "editMessageText"
	default:
		apiMethod = "sendMessage"
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", token, apiMethod)
	body := buildTelegramTextBody(item)

	httpRequestAsync("POST", url, body, "{\"Content-Type\":\"application/json\"}", func(resp string) {
		success := isTelegramResponseOK(resp)
		if item.kind == "edit" && isTelegramMessageNotModified(resp) {
			success = true
		}
		if !success {
			logMsg(fmt.Sprintf("ERROR: %s failed: %s", apiMethod, parseTelegramAPIError(resp)))
		}
		if item.callback != nil {
			item.callback(success, resp)
		}
		sending = false
		drainSendQueue()
	})
}

func buildTelegramTextBody(item telegramQueueItem) string {
	payload := map[string]interface{}{
		"chat_id": item.chatID,
		"text":    item.text,
	}

	switch item.kind {
	case "draft":
		payload["draft_id"] = item.draftID
	case "edit":
		payload["message_id"] = item.messageID
	}

	if item.enableMarkdown {
		if escaped, ok := escapeMarkdownV2(item.text); ok {
			payload["text"] = escaped
			payload["parse_mode"] = "MarkdownV2"
		}
	}

	raw, _ := json.Marshal(payload)
	return string(raw)
}

func isTelegramResponseOK(resp string) bool {
	var envelope struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if json.Unmarshal([]byte(resp), &envelope) != nil {
		return false
	}
	if envelope.Error != "" {
		return false
	}
	return envelope.OK
}

func isTelegramMessageNotModified(resp string) bool {
	errText := strings.ToLower(parseTelegramAPIError(resp))
	return strings.Contains(errText, "message is not modified")
}

func parseTelegramMessageID(resp string) int {
	var envelope struct {
		Result struct {
			MessageID int `json:"message_id"`
		} `json:"result"`
	}
	if json.Unmarshal([]byte(resp), &envelope) != nil {
		return 0
	}
	return envelope.Result.MessageID
}

func parseTelegramAPIError(resp string) string {
	var envelope struct {
		Description string `json:"description"`
		Error       string `json:"error"`
	}
	if json.Unmarshal([]byte(resp), &envelope) == nil {
		if envelope.Description != "" {
			return envelope.Description
		}
		if envelope.Error != "" {
			return envelope.Error
		}
	}
	return truncateTelegramResp(resp)
}

func parseTelegramRetryAfter(resp string) int {
	var envelope struct {
		ErrorCode  int `json:"error_code"`
		Parameters struct {
			RetryAfter int `json:"retry_after"`
		} `json:"parameters"`
	}
	if json.Unmarshal([]byte(resp), &envelope) != nil {
		return 0
	}
	if envelope.ErrorCode == 429 && envelope.Parameters.RetryAfter > 0 {
		return envelope.Parameters.RetryAfter
	}
	return 0
}

func isTelegramTooManyRequests(resp string) bool {
	return parseTelegramRetryAfter(resp) > 0
}

func truncateTelegramResp(resp string) string {
	resp = strings.TrimSpace(resp)
	if len(resp) <= 400 {
		return resp
	}
	return resp[:400] + "..."
}

func escapeMarkdownV2(text string) (string, bool) {
	var result strings.Builder
	lines := strings.SplitAfter(text, "\n")
	inCB := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if inCB {
			if trimmed == "```" {
				inCB = false
			}
			result.WriteString(line)
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			inCB = true
			result.WriteString(line)
			continue
		}

		result.WriteString(escapeLine(line))
	}

	if inCB {
		return "", false
	}
	return result.String(), true
}

func escapeLine(line string) string {
	var b strings.Builder
	inInlineCode := false
	for i := 0; i < len(line); i++ {
		ch := line[i]
		if ch == '`' {
			inInlineCode = !inInlineCode
			b.WriteByte(ch)
			continue
		}
		if inInlineCode {
			b.WriteByte(ch)
			continue
		}
		if strings.ContainsRune("[]()~>#+-=|{}.!", rune(ch)) {
			b.WriteByte('\\')
		}
		b.WriteByte(ch)
	}
	return b.String()
}

func sendTypingAction(chatID int) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendChatAction", token)
	body := fmt.Sprintf(`{"chat_id":%d,"action":"typing"}`, chatID)
	httpRequestAsync("POST", url, body, "{\"Content-Type\":\"application/json\"}", func(resp string) {
		// fire-and-forget
	})
}

func registerBotCommands() {
	resp := request("chat.commands", nil)
	if resp == "" || resp[0] != '[' {
		logMsg("WARN: chat.commands returned: " + resp)
		return
	}

	var cmds []struct {
		Name        string `json:"Name"`
		Description string `json:"Description"`
		Category    string `json:"Category"`
	}
	if json.Unmarshal([]byte(resp), &cmds) != nil {
		return
	}

	type botCmd struct {
		Command     string `json:"command"`
		Description string `json:"description"`
	}

	tgCmds := []botCmd{{Command: "start", Description: "开始对话"}}
	seen := map[string]bool{"start": true}
	for _, c := range cmds {
		root := c.Name
		isSub := false
		if idx := strings.Index(root, " "); idx > 0 {
			root = root[:idx]
			isSub = true
		}
		if seen[root] {
			continue
		}
		seen[root] = true
		desc := c.Description
		if isSub {
			desc = c.Category + "（/help 查看子命令）"
		}
		tgCmds = append(tgCmds, botCmd{Command: root, Description: desc})
	}

	body, _ := json.Marshal(map[string]interface{}{"commands": tgCmds})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setMyCommands", token)
	httpRequestAsync("POST", url, string(body), "{\"Content-Type\":\"application/json\"}", func(resp string) {
		if strings.Contains(resp, `"ok":true`) {
			logMsg(fmt.Sprintf("Telegram Bot Commands 注册成功 (%d 个命令)", len(tgCmds)))
		} else {
			logMsg("WARN: setMyCommands failed: " + resp)
		}
	})
}
