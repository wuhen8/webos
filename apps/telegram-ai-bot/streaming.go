package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	tgStreamTextLimit        = 4000
	tgStreamMinChars         = 96
	tgStreamMinInterval      = 2 * time.Second
	tgStreamFallbackTailKeep = 1200
)

// TelegramDraftStream 流式输出
// 使用 sendMessage + editMessageText 模式（更可靠）
type TelegramDraftStream struct {
	ChatID            int
	MessageID         int       // 已发送的消息 ID（0 表示还没发送）
	Text              string    // 累积的全部文本
	LastSentText      string    // 上次成功发送的文本
	LastSentAt        time.Time // 上次发送时间
	Finalized         bool
	Sending           bool
	EditBlockedUntil  time.Time
	FallbackSent      bool
	LastRateLimitText string
}

var (
	activeDraftStream *TelegramDraftStream
	draftIDCounter    int
	lastTypingAt      time.Time
)

func nextDraftID() int {
	draftIDCounter++
	return int(time.Now().Unix()<<16) | (draftIDCounter & 0xFFFF)
}

func beginReplyStream(chatID int) *TelegramDraftStream {
	activeChatID = chatID
	stream := &TelegramDraftStream{
		ChatID: chatID,
	}
	activeDraftStream = stream
	logMsg(fmt.Sprintf("[stream] 开始 chat=%d", chatID))
	return stream
}

func getReplyStream(chatID int) *TelegramDraftStream {
	if activeDraftStream == nil {
		return nil
	}
	if chatID != 0 && activeDraftStream.ChatID != chatID {
		return nil
	}
	return activeDraftStream
}

func ensureReplyStream(chatID int) *TelegramDraftStream {
	if stream := getReplyStream(chatID); stream != nil {
		return stream
	}
	return beginReplyStream(chatID)
}

func noteReplyStreamDelta(chatID int, text string) {
	if chatID == 0 || text == "" {
		return
	}
	stream := ensureReplyStream(chatID)
	stream.Text += text

	// 发送 typing 动作（节流）
	if time.Since(lastTypingAt) >= 5*time.Second {
		lastTypingAt = time.Now()
		sendTypingAction(stream.ChatID)
	}

	// 触发发送
	trySendDraft(stream, false)
}

func finishReplyStream(chatID int) {
	stream := getReplyStream(chatID)
	if stream == nil {
		return
	}
	stream.Finalized = true
	logMsg(fmt.Sprintf("[stream] 完成，总长度=%d", len(stream.Text)))
	trySendDraft(stream, true)
}

// trySendDraft 尝试发送或编辑
func trySendDraft(stream *TelegramDraftStream, force bool) {
	if stream == nil || stream.Text == "" {
		return
	}

	now := time.Now()

	// 有请求在飞？跳过
	if stream.Sending {
		return
	}

	// 文本没变化
	if stream.Text == stream.LastSentText {
		if stream.Finalized {
			cleanupDraftStream(stream)
		}
		return
	}

	// Telegram 明确限流时，不再继续撞 edit 接口
	if !stream.EditBlockedUntil.IsZero() && now.Before(stream.EditBlockedUntil) {
		if stream.Finalized {
			sendStreamFallback(stream)
		}
		return
	}

	// 节流：非强制时检查
	if !force && !stream.Finalized {
		grown := len(stream.Text) - len(stream.LastSentText)
		elapsed := time.Since(stream.LastSentAt)
		if grown < tgStreamMinChars && elapsed < tgStreamMinInterval {
			return
		}
	}

	// 发送或编辑
	stream.Sending = true
	stream.LastSentAt = now
	text := stream.Text
	if len(text) > tgStreamTextLimit {
		text = text[:tgStreamTextLimit]
	}

	if stream.MessageID == 0 {
		// 首次发送
		sendStreamFirstMessage(stream.ChatID, text, func(success bool, messageID int) {
			stream.Sending = false
			if success && messageID > 0 {
				stream.MessageID = messageID
				stream.LastSentText = text
			}
			if stream.Finalized && stream.Text == stream.LastSentText {
				cleanupDraftStream(stream)
				return
			}
			trySendDraft(stream, stream.Finalized)
		})
	} else {
		// 编辑已有消息
		editStreamMessage(stream.ChatID, stream.MessageID, text, func(success bool, retryAfter int) {
			stream.Sending = false
			if success {
				stream.LastSentText = text
			} else if retryAfter > 0 {
				stream.EditBlockedUntil = time.Now().Add(time.Duration(retryAfter) * time.Second)
				stream.LastRateLimitText = text
				logMsg(fmt.Sprintf("[stream] edit 限流 chat=%d message=%d retry_after=%ds", stream.ChatID, stream.MessageID, retryAfter))
			}
			if stream.Finalized {
				if stream.Text == stream.LastSentText {
					cleanupDraftStream(stream)
					return
				}
				if retryAfter > 0 {
					sendStreamFallback(stream)
					return
				}
			}
			trySendDraft(stream, stream.Finalized)
		})
	}
}

func cleanupDraftStream(stream *TelegramDraftStream) {
	if stream == nil || !stream.Finalized {
		return
	}
	if activeDraftStream == stream {
		activeDraftStream = nil
	}
}

func sendStreamFallback(stream *TelegramDraftStream) {
	if stream == nil || !stream.Finalized || stream.FallbackSent {
		return
	}

	finalText := strings.TrimSpace(stream.Text)
	if finalText == "" {
		cleanupDraftStream(stream)
		return
	}

	if stream.LastSentText != "" && strings.HasPrefix(finalText, stream.LastSentText) {
		tail := strings.TrimSpace(finalText[len(stream.LastSentText):])
		if tail == "" {
			cleanupDraftStream(stream)
			return
		}
		if len(tail) > tgStreamFallbackTailKeep {
			tail = tail[len(tail)-tgStreamFallbackTailKeep:]
			tail = "…" + strings.TrimLeft(tail, "\n")
		}
		finalText = "⚠️ Telegram 当前对消息编辑限流，以下补发剩余内容：\n\n" + tail
	} else {
		if len(finalText) > tgMaxMessageLen {
			finalText = finalText[len(finalText)-tgMaxMessageLen:]
			finalText = "…" + strings.TrimLeft(finalText, "\n")
		}
		finalText = "⚠️ Telegram 当前对消息编辑限流，以下发送最终内容：\n\n" + finalText
	}

	stream.FallbackSent = true
	sendTelegramAsync(stream.ChatID, finalText, nil)
	cleanupDraftStream(stream)
}

// sendStreamFirstMessage 发送第一条消息
func sendStreamFirstMessage(chatID int, text string, cb func(success bool, messageID int)) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)

	var escapedText string
	var parseMode interface{} = nil
	if escaped, ok := escapeMarkdownV2(text); ok {
		escapedText = escaped
		parseMode = "MarkdownV2"
	} else {
		escapedText = text
	}

	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    escapedText,
	}
	if parseMode != nil {
		payload["parse_mode"] = parseMode
	}

	body, _ := json.Marshal(payload)
	httpRequestAsync("POST", url, string(body), "{\"Content-Type\":\"application/json\"}", func(resp string) {
		success := isTelegramResponseOK(resp)
		var messageID int
		if success {
			messageID = parseTelegramMessageID(resp)
		} else {
			logMsg(fmt.Sprintf("ERROR: sendMessage failed: %s", parseTelegramAPIError(resp)))
		}
		if cb != nil {
			cb(success, messageID)
		}
	})
}

// editStreamMessage 编辑消息
func editStreamMessage(chatID, messageID int, text string, cb func(success bool, retryAfter int)) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/editMessageText", token)

	var escapedText string
	var parseMode interface{} = nil
	if escaped, ok := escapeMarkdownV2(text); ok {
		escapedText = escaped
		parseMode = "MarkdownV2"
	} else {
		escapedText = text
	}

	payload := map[string]interface{}{
		"chat_id":    chatID,
		"message_id": messageID,
		"text":       escapedText,
	}
	if parseMode != nil {
		payload["parse_mode"] = parseMode
	}

	body, _ := json.Marshal(payload)
	httpRequestAsync("POST", url, string(body), "{\"Content-Type\":\"application/json\"}", func(resp string) {
		success := isTelegramResponseOK(resp)
		retryAfter := 0
		if !success {
			if isTelegramMessageNotModified(resp) {
				success = true
			} else {
				errText := parseTelegramAPIError(resp)
				retryAfter = parseTelegramRetryAfter(resp)
				if retryAfter > 0 {
					logMsg(fmt.Sprintf("WARN: editMessageText rate limited: retry_after=%ds err=%s", retryAfter, errText))
				} else {
					logMsg(fmt.Sprintf("ERROR: editMessageText failed: %s", errText))
				}
			}
		}
		if cb != nil {
			cb(success, retryAfter)
		}
	})
}
