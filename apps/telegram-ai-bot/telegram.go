package main

import (
	"encoding/json"
	"fmt"
	"strings"
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
	MessageID int    `json:"message_id"`
	From      *User  `json:"from"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
}

type User struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
}

type Chat struct {
	ID int `json:"id"`
}

// ==================== 顺序发送队列 ====================

type sendItem struct {
	chatID int
	text   string
}

var (
	sendQueue []sendItem
	sending   bool // 是否有正在发送的请求
)

const tgMaxMessageLen = 4096

// sendTelegramAsync 入队一条消息，保证按顺序发送。
// 超过 Telegram 4096 字符限制时自动拆分。
func sendTelegramAsync(chatID int, text string, _ func(string)) {
	for len(text) > tgMaxMessageLen {
		// 尽量在换行处切，避免把一行切成两半
		cut := tgMaxMessageLen
		if idx := strings.LastIndex(text[:cut], "\n"); idx > cut/2 {
			cut = idx + 1
		}
		sendQueue = append(sendQueue, sendItem{chatID: chatID, text: text[:cut]})
		text = text[cut:]
	}
	if text != "" {
		sendQueue = append(sendQueue, sendItem{chatID: chatID, text: text})
	}
	drainSendQueue()
}

// drainSendQueue 如果当前没有在发送，取队首发送
func drainSendQueue() {
	if sending || len(sendQueue) == 0 {
		return
	}
	sending = true
	item := sendQueue[0]
	sendQueue = sendQueue[1:]

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	escaped, ok := escapeMarkdownV2(item.text)

	var body string
	if ok {
		textJSON, _ := json.Marshal(escaped)
		body = fmt.Sprintf(`{"chat_id":%d,"text":%s,"parse_mode":"MarkdownV2"}`, item.chatID, string(textJSON))
	} else {
		// MarkdownV2 转义失败（未闭合的代码块等），降级为纯文本发送
		textJSON, _ := json.Marshal(item.text)
		body = fmt.Sprintf(`{"chat_id":%d,"text":%s}`, item.chatID, string(textJSON))
	}

	httpRequestAsync("POST", url, body, "{\"Content-Type\":\"application/json\"}", func(resp string) {
		if strings.Contains(resp, `"ok":false`) {
			logMsg("ERROR: sendMessage failed: " + resp)
		}
		sending = false
		drainSendQueue()
	})
}
// escapeMarkdownV2 对文本做 Telegram MarkdownV2 转义。
// 代码块（``` ... ```）和行内代码（` ... `）内部不转义。
// escapeMarkdownV2 对文本做 Telegram MarkdownV2 转义。
// 代码块（``` ... ```）和行内代码（` ... `）内部不转义。
// Markdown 标题（# ## ###）转换为粗体（Telegram 不支持标题语法）。
// escapeMarkdownV2 对文本做 Telegram MarkdownV2 转义。
// 返回 (转义后文本, 是否成功)。代码块未闭合时返回 false，调用方应降级为纯文本。
// escapeMarkdownV2 对文本做 Telegram MarkdownV2 转义。
// 代码块内不转义，代码块外转义特殊字符。
// 返回 (转义后文本, 是否成功)。代码块未闭合时返回 false，调用方应降级为纯文本。
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

// escapeLine 对单行文本做 MarkdownV2 特殊字符转义，行内代码内不转义。
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

// sendTypingAction 发送"正在输入"状态到指定 chat
func sendTypingAction(chatID int) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendChatAction", token)
	body := fmt.Sprintf(`{"chat_id":%d,"action":"typing"}`, chatID)
	httpRequestAsync("POST", url, body, "{\"Content-Type\":\"application/json\"}", func(resp string) {
		// fire-and-forget，不需要处理结果
	})
}
// registerBotCommands 从 backend 获取命令列表，调用 Telegram setMyCommands 注册
func registerBotCommands() {
	resp := request("ai_commands", nil)
	if resp == "" || resp[0] != '[' {
		logMsg("WARN: ai_commands returned: " + resp)
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

	// 构建 Telegram BotCommand 数组，加上 /start
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
			// 子命令截成根命令时，用 category 作描述，提示 /help 查看详情
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


