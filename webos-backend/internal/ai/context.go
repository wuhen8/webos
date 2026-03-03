package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"unicode"

	"webos-backend/internal/database"
)

const (
	defaultMaxInputTokens = 128000
	defaultRecentMessages = 5
	summaryMaxWords       = 500
	toolResultTruncate    = 500
)

// EstimateTokens estimates the token count of a string.
// ASCII characters count as ~0.25 tokens each, CJK characters as ~1.5 tokens each.
func EstimateTokens(s string) int {
	tokens := 0
	for _, r := range s {
		if r <= 127 {
			// ASCII: roughly 4 chars per token
			tokens += 1 // we'll divide at the end
		} else if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hangul, r) || unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hiragana, r) {
			tokens += 6 // CJK: ~1.5 tokens, scaled by 4
		} else {
			tokens += 3 // other unicode: ~0.75 tokens, scaled by 4
		}
	}
	return tokens / 4
}

// EstimateMessageTokens estimates the token count of a single ChatMessage.
func EstimateMessageTokens(msg ChatMessage) int {
	tokens := 4 // message overhead (role, separators)

	// Content
	switch v := msg.Content.(type) {
	case string:
		tokens += EstimateTokens(v)
	case []ContentPart:
		for _, p := range v {
			if p.Text != "" {
				tokens += EstimateTokens(p.Text)
			}
			if p.ImageURL != nil {
				tokens += 85 // rough estimate for image token overhead
			}
		}
	}

	// Tool calls
	for _, tc := range msg.ToolCalls {
		tokens += EstimateTokens(tc.Function.Name) + EstimateTokens(tc.Function.Arguments) + 10
	}

	// Tool call ID
	if msg.ToolCallID != "" {
		tokens += 10
	}

	return tokens
}

// GenerateSummary uses the LLM to generate a summary of the given messages.
func GenerateSummary(ctx context.Context, cfg AIConfig, messages []ChatMessage) (string, error) {
	// Format messages into text for summarization
	var sb strings.Builder
	for _, msg := range messages {
		role := msg.Role
		switch v := msg.Content.(type) {
		case string:
			content := v
			if role == "tool" && len(content) > toolResultTruncate {
				content = content[:toolResultTruncate] + "...(截断)"
			}
			if content != "" {
				fmt.Fprintf(&sb, "[%s]: %s\n", role, content)
			}
		}
		if len(msg.ToolCalls) > 0 {
			for _, tc := range msg.ToolCalls {
				args := tc.Function.Arguments
				if len(args) > toolResultTruncate {
					args = args[:toolResultTruncate] + "..."
				}
				fmt.Fprintf(&sb, "[%s 调用工具 %s]: %s\n", role, tc.Function.Name, args)
			}
		}
	}

	summaryMessages := []ChatMessage{
		{
			Role:    "system",
			Content: fmt.Sprintf("你是一个对话摘要助手。请将以下对话内容压缩为不超过%d字的中文摘要。保留关键信息：用户的主要需求、重要的操作结果、关键决策和结论。不要遗漏重要的文件路径、命令或错误信息。", summaryMaxWords),
		},
		{
			Role:    "user",
			Content: "请总结以下对话：\n\n" + sb.String(),
		},
	}

	var result strings.Builder
	_, err := ChatStream(ctx, cfg, summaryMessages, nil, func(delta StreamDelta) {
		if delta.Content != "" {
			result.WriteString(delta.Content)
		}
	})
	if err != nil {
		return "", fmt.Errorf("生成摘要失败: %w", err)
	}

	return result.String(), nil
}

// findSafeSplitPoint finds a split index in messages such that:
// - at least recentN messages are kept after the split
// - tool_call/tool_result pairs are not broken apart
// Returns the index where "recent" messages start (messages[splitPoint:] are kept intact).
func findSafeSplitPoint(messages []ChatMessage, recentN int) int {
	if len(messages) <= recentN {
		return 0
	}

	splitPoint := len(messages) - recentN

	// Walk backward from splitPoint to ensure we don't split a tool_call/tool pair.
	// If messages[splitPoint] is a "tool" message, we need to include the preceding
	// assistant message with tool_calls too.
	for splitPoint > 0 && messages[splitPoint].Role == "tool" {
		splitPoint--
	}

	return splitPoint
}

// BuildContext constructs the message array for the LLM.
// If a summary exists (from /compress), messages covered by the summary are replaced with it.
// If tokens still exceed the context window, simple truncation is applied.
func BuildContext(ctx context.Context, cfg AIConfig, convID, systemPrompt string, history []ChatMessage, historyRows []database.AIMessageRow) ([]ChatMessage, bool, error) {
	contextWindow := cfg.MaxInputTokens
	if contextWindow <= 0 {
		contextWindow = defaultMaxInputTokens
	}
	recentN := cfg.RecentMessages
	if recentN <= 0 {
		recentN = defaultRecentMessages
	}

	systemMsg := ChatMessage{Role: "system", Content: systemPrompt}
	compressed := false

	// Step 1: If a summary exists, replace early messages with it
	effectiveHistory := history
	existingSummary, err := database.GetLatestSummary(convID)
	if err != nil {
		log.Printf("[ai] 查询摘要失败: %v", err)
	}
	if existingSummary != nil && len(historyRows) > 0 {
		// Find the index in history where messages after the summary start
		summaryEndIdx := 0
		for i, row := range historyRows {
			if row.ID > existingSummary.UpToMsgID {
				summaryEndIdx = i
				break
			}
			// If all rows are covered by summary, point past the end
			if i == len(historyRows)-1 {
				summaryEndIdx = len(historyRows)
			}
		}
		if summaryEndIdx > 0 {
			// Replace early messages with summary pair
			afterSummary := sanitizeMessages(history[summaryEndIdx:])
			result := make([]ChatMessage, 0, len(afterSummary)+3)
			result = append(result, systemMsg)
			result = append(result, ChatMessage{
				Role:    "user",
				Content: "以下是之前对话的摘要：\n\n" + existingSummary.Content,
			})
			result = append(result, ChatMessage{
				Role:    "assistant",
				Content: "好的，我已了解之前的对话内容。请继续。",
			})
			result = append(result, afterSummary...)
			log.Printf("[ai] 使用摘要替换前 %d 条消息, 保留 %d 条后续消息", summaryEndIdx, len(afterSummary))
			// Check if this is within budget
			total := 0
			for _, m := range result {
				total += EstimateMessageTokens(m)
			}
			threshold := int(float64(contextWindow) * 0.85)
			if total <= threshold {
				return result, true, nil
			}
			// Still over budget — continue to truncation with the summary-replaced history
			effectiveHistory = result[1:] // exclude system msg, will re-add below
			compressed = true
			log.Printf("[ai] 摘要替换后仍超阈值 (%d > %d)，继续截断", total, threshold)
		}
	}

	// Step 2: Check if within budget
	totalTokens := EstimateMessageTokens(systemMsg)
	for _, msg := range effectiveHistory {
		totalTokens += EstimateMessageTokens(msg)
	}
	threshold := int(float64(contextWindow) * 0.85)
	if totalTokens <= threshold {
		result := make([]ChatMessage, 0, len(effectiveHistory)+1)
		result = append(result, systemMsg)
		result = append(result, sanitizeMessages(effectiveHistory)...)
		return result, compressed, nil
	}

	// Step 3: Over budget — simple truncation (keep recent messages)
	log.Printf("[ai] 对话 %s token 估算 %d 超过阈值 %d，执行截断", convID, totalTokens, threshold)
	splitPoint := findSafeSplitPoint(effectiveHistory, recentN)
	if splitPoint == 0 {
		result := make([]ChatMessage, 0, len(effectiveHistory)+1)
		result = append(result, systemMsg)
		result = append(result, sanitizeMessages(effectiveHistory)...)
		return result, compressed, nil
	}

	recentMessages := effectiveHistory[splitPoint:]
	log.Printf("[ai] 截断: 丢弃 %d 条早期消息, 保留 %d 条最近消息 (可使用 /compress 手动压缩)", splitPoint, len(recentMessages))
	result := make([]ChatMessage, 0, len(recentMessages)+1)
	result = append(result, systemMsg)
	result = append(result, sanitizeMessages(recentMessages)...)
	return result, true, nil
}

// sanitizeMessages removes orphaned tool messages from the history.
// A tool message is orphaned if there is no preceding assistant message
// with a matching tool_call ID. This prevents 400 errors from providers
// that strictly validate message sequences.
func sanitizeMessages(messages []ChatMessage) []ChatMessage {
	// Collect all tool_call IDs from assistant messages
	validToolCallIDs := make(map[string]bool)
	for _, msg := range messages {
		if msg.Role == "assistant" {
			for _, tc := range msg.ToolCalls {
				if tc.ID != "" {
					validToolCallIDs[tc.ID] = true
				}
			}
		}
	}

	result := make([]ChatMessage, 0, len(messages))
	for _, msg := range messages {
		if msg.Role == "tool" {
			if msg.ToolCallID == "" || !validToolCallIDs[msg.ToolCallID] {
				log.Printf("[ai] sanitize: 移除孤立的 tool 消息 (tool_call_id=%s)", msg.ToolCallID)
				continue
			}
		}
		result = append(result, msg)
	}
	return result
}

// rowsToMessages converts database rows to ChatMessages (same logic as HistoryManager.LoadMessages).
func rowsToMessages(rows []database.AIMessageRow) []ChatMessage {
	var msgs []ChatMessage
	for _, r := range rows {
		content := r.Content
		// Strip leaked <think>/<\/think> tags from content to prevent context pollution
		if r.Role == "assistant" {
			content = stripThinkTags(content)
		}
		msg := ChatMessage{
			Role:    r.Role,
			Content: content,
		}
		if r.ToolCalls.Valid && r.ToolCalls.String != "" {
			var calls []ToolCall
			if err := json.Unmarshal([]byte(r.ToolCalls.String), &calls); err == nil {
				msg.ToolCalls = calls
			}
		}
		if r.ToolCallID.Valid {
			msg.ToolCallID = r.ToolCallID.String
		}
		msgs = append(msgs, msg)
	}
	return msgs
}

// stripThinkTags removes <think>...</think> blocks and stray tags from content.
func stripThinkTags(s string) string {
	for {
		start := strings.Index(s, "<think>")
		if start == -1 {
			break
		}
		end := strings.Index(s[start:], "</think>")
		if end == -1 {
			// Unclosed <think> — remove from tag to end
			s = s[:start]
		} else {
			s = s[:start] + s[start+end+len("</think>"):]
		}
	}
	s = strings.ReplaceAll(s, "</think>", "")
	return strings.TrimSpace(s)
}
