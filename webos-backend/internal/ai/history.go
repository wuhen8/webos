package ai

import (
	"encoding/json"

	"webos-backend/internal/database"
)

// HistoryManager handles loading and saving conversation history.
type HistoryManager struct{}

// NewHistoryManager creates a new HistoryManager.
func NewHistoryManager() *HistoryManager {
	return &HistoryManager{}
}

// LoadMessages loads all messages for a conversation and converts them to ChatMessages.
func (h *HistoryManager) LoadMessages(convID string) ([]ChatMessage, error) {
	rows, err := database.ListMessages(convID)
	if err != nil {
		return nil, err
	}

	var msgs []ChatMessage
	for _, r := range rows {
		msg := ChatMessage{
			Role:    r.Role,
			Content: r.Content,
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
	return msgs, nil
}

// SaveUserMessage saves a user message to the database.
func (h *HistoryManager) SaveUserMessage(convID, content string) error {
	return database.InsertMessage(convID, "user", content, nil, nil, "")
}

// SaveAssistantMessage saves an assistant message (with optional tool calls and thinking) to the database.
// Returns the set of tool call IDs that were actually saved (those with valid JSON arguments).
func (h *HistoryManager) SaveAssistantMessage(convID, content string, toolCalls []ToolCall, thinking string) (map[string]bool, error) {
	savedIDs := make(map[string]bool)
	var tcJSON *string
	if len(toolCalls) > 0 {
		// Filter out tool calls with invalid/incomplete arguments JSON
		valid := make([]ToolCall, 0, len(toolCalls))
		for _, tc := range toolCalls {
			if json.Valid([]byte(tc.Function.Arguments)) {
				valid = append(valid, tc)
				savedIDs[tc.ID] = true
			}
		}
		if len(valid) > 0 {
			b, err := json.Marshal(valid)
			if err == nil {
				s := string(b)
				tcJSON = &s
			}
		}
	}
	return savedIDs, database.InsertMessage(convID, "assistant", content, tcJSON, nil, thinking)
}

// SaveToolMessage saves a tool result message to the database.
func (h *HistoryManager) SaveToolMessage(convID, toolCallID, content string) error {
	return database.InsertMessage(convID, "tool", content, nil, &toolCallID, "")
}


