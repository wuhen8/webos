package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// AIConversationRow represents a row in ai_conversations.
type AIConversationRow struct {
	ID        string
	Title     string
	CreatedAt int64
	UpdatedAt int64
}

// AIMessageRow represents a row in ai_messages.
type AIMessageRow struct {
	ID             int64
	ConversationID string
	Role           string
	Content        string
	ToolCalls      sql.NullString
	ToolCallID     sql.NullString
	TokenUsage     sql.NullString
	Thinking       string
	CreatedAt      int64
}

// MarshalJSON serializes AIMessageRow with proper handling of NullString fields.
func (r AIMessageRow) MarshalJSON() ([]byte, error) {
	m := map[string]interface{}{
		"ID":             r.ID,
		"ConversationID": r.ConversationID,
		"Role":           r.Role,
		"Content":        r.Content,
		"CreatedAt":      r.CreatedAt,
	}
	if r.ToolCalls.Valid && r.ToolCalls.String != "" {
		// Store as raw JSON so it arrives as an array, not a string
		m["ToolCalls"] = json.RawMessage(r.ToolCalls.String)
	}
	if r.ToolCallID.Valid && r.ToolCallID.String != "" {
		m["ToolCallID"] = r.ToolCallID.String
	}
	if r.TokenUsage.Valid && r.TokenUsage.String != "" {
		m["TokenUsage"] = json.RawMessage(r.TokenUsage.String)
	}
	if r.Thinking != "" {
		m["Thinking"] = r.Thinking
	}
	return json.Marshal(m)
}

// CreateConversation inserts a new conversation.
func CreateConversation(id, title string) error {
	now := time.Now().Unix()
	_, err := db.Exec(
		"INSERT INTO ai_conversations(id, title, created_at, updated_at) VALUES(?, ?, ?, ?)",
		id, title, now, now,
	)
	return err
}

// UpdateConversationTitle updates the title and updated_at of a conversation.
func UpdateConversationTitle(id, title string) error {
	_, err := db.Exec(
		"UPDATE ai_conversations SET title=?, updated_at=? WHERE id=?",
		title, time.Now().Unix(), id,
	)
	return err
}

// TouchConversation updates the updated_at timestamp.
func TouchConversation(id string) error {
	_, err := db.Exec(
		"UPDATE ai_conversations SET updated_at=? WHERE id=?",
		time.Now().Unix(), id,
	)
	return err
}

// ListConversations returns all conversations ordered by updated_at desc.
func ListConversations() ([]AIConversationRow, error) {
	rows, err := db.Query("SELECT id, title, created_at, updated_at FROM ai_conversations ORDER BY updated_at DESC")
	if err != nil {
		return nil, fmt.Errorf("list conversations: %w", err)
	}
	defer rows.Close()

	var result []AIConversationRow
	for rows.Next() {
		var r AIConversationRow
		if err := rows.Scan(&r.ID, &r.Title, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan conversation: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// DeleteConversation deletes a conversation and its messages and summaries.
func DeleteConversation(id string) error {
	// SQLite foreign key cascade requires PRAGMA foreign_keys=ON which may not be set.
	// Manually delete messages and summaries first.
	if _, err := db.Exec("DELETE FROM ai_messages WHERE conversation_id=?", id); err != nil {
		return err
	}
	if err := DeleteSummariesByConversation(id); err != nil {
		return err
	}
	_, err := db.Exec("DELETE FROM ai_conversations WHERE id=?", id)
	return err
}

// InsertMessage inserts a chat message into ai_messages.
func InsertMessage(convID, role, content string, toolCalls, toolCallID *string, thinking string) error {
	now := time.Now().Unix()
	_, err := db.Exec(
		"INSERT INTO ai_messages(conversation_id, role, content, tool_calls, tool_call_id, thinking, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
		convID, role, content, toolCalls, toolCallID, thinking, now,
	)
	return err
}

// ListMessages returns all messages for a conversation ordered by id.
func ListMessages(convID string) ([]AIMessageRow, error) {
	rows, err := db.Query(
		"SELECT id, conversation_id, role, content, tool_calls, tool_call_id, token_usage, thinking, created_at FROM ai_messages WHERE conversation_id=? ORDER BY id",
		convID,
	)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	var result []AIMessageRow
	for rows.Next() {
		var r AIMessageRow
		if err := rows.Scan(&r.ID, &r.ConversationID, &r.Role, &r.Content, &r.ToolCalls, &r.ToolCallID, &r.TokenUsage, &r.Thinking, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
// MessageCount returns the number of messages in a conversation.
func MessageCount(convID string) (int, error) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM ai_messages WHERE conversation_id=?", convID).Scan(&count)
	return count, err
}



// AISummaryRow represents a row in ai_summaries.
type AISummaryRow struct {
	ID             int64
	ConversationID string
	Content        string
	UpToMsgID      int64
	CreatedAt      int64
}

// InsertSummary inserts a conversation summary.
func InsertSummary(convID, content string, upToMsgID int64) error {
	now := time.Now().Unix()
	_, err := db.Exec(
		"INSERT INTO ai_summaries(conversation_id, content, up_to_msg_id, created_at) VALUES(?, ?, ?, ?)",
		convID, content, upToMsgID, now,
	)
	return err
}

// GetLatestSummary returns the most recent summary for a conversation, or nil if none.
func GetLatestSummary(convID string) (*AISummaryRow, error) {
	var r AISummaryRow
	err := db.QueryRow(
		"SELECT id, conversation_id, content, up_to_msg_id, created_at FROM ai_summaries WHERE conversation_id=? ORDER BY id DESC LIMIT 1",
		convID,
	).Scan(&r.ID, &r.ConversationID, &r.Content, &r.UpToMsgID, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get latest summary: %w", err)
	}
	return &r, nil
}

// DeleteSummariesByConversation deletes all summaries for a conversation.
func DeleteSummariesByConversation(convID string) error {
	_, err := db.Exec("DELETE FROM ai_summaries WHERE conversation_id=?", convID)
	return err
}

// UpdateLastAssistantTokenUsage updates the token_usage of the last assistant message in a conversation.
func UpdateLastAssistantTokenUsage(convID, tokenUsageJSON string) error {
	_, err := db.Exec(
		"UPDATE ai_messages SET token_usage=? WHERE id=(SELECT id FROM ai_messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1)",
		tokenUsageJSON, convID,
	)
	return err
}
