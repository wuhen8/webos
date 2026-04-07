package database

import (
	"database/sql"
	"time"
)

// AIQueueRow represents a row in ai_queue.
type AIQueueRow struct {
	ID         int64  `json:"id"`
	ConvID     string `json:"convId"`
	Content    string `json:"content"`
	ClientID   string `json:"clientId"`
	ProviderID string `json:"providerId"`
	Model      string `json:"model"`
	Status     string `json:"status"`
	CreatedAt  int64  `json:"createdAt"`
}

// EnqueueAIMessage inserts a pending message into the queue and returns its ID.
func EnqueueAIMessage(convID, content, clientID, providerID, model string) (int64, error) {
	if clientID == "" {
		clientID = "web"
	}
	res, err := db.Exec(
		"INSERT INTO ai_queue(conv_id, content, client_id, provider_id, model, status, created_at) VALUES(?, ?, ?, ?, ?, 'pending', ?)",
		convID, content, clientID, providerID, model, time.Now().Unix(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// DequeueAIMessage returns the oldest pending message and marks it as 'processing'.
// Returns nil if the queue is empty.
func DequeueAIMessage() (*AIQueueRow, error) {
	var r AIQueueRow
	err := db.QueryRow(`
		UPDATE ai_queue
		SET status='processing'
		WHERE id = (
			SELECT id FROM ai_queue
			WHERE status='pending'
			ORDER BY id
			LIMIT 1
		)
		RETURNING id, conv_id, content, COALESCE(client_id, 'web'), COALESCE(provider_id, ''), COALESCE(model, ''), status, created_at
	`).Scan(&r.ID, &r.ConvID, &r.Content, &r.ClientID, &r.ProviderID, &r.Model, &r.Status, &r.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &r, nil
}

// CompleteAIQueueItem marks a queue item as done and deletes it.
func CompleteAIQueueItem(id int64) error {
	_, err := db.Exec("DELETE FROM ai_queue WHERE id=?", id)
	return err
}

// ResetProcessingAIQueue resets any 'processing' items back to 'pending'.
// Called on startup to recover from crashes.
func ResetProcessingAIQueue() error {
	_, err := db.Exec("UPDATE ai_queue SET status='pending' WHERE status='processing'")
	return err
}

// PendingAIQueueCount returns the number of pending items in the queue.
func PendingAIQueueCount() int {
	var count int
	db.QueryRow("SELECT COUNT(*) FROM ai_queue WHERE status='pending'").Scan(&count)
	return count
}

// DeletePendingAIQueueByConversation removes all pending queue items for a conversation and returns the number deleted.
func DeletePendingAIQueueByConversation(convID string) (int64, error) {
	res, err := db.Exec("DELETE FROM ai_queue WHERE conv_id=? AND status='pending'", convID)
	if err != nil {
		return 0, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return count, nil
}

// PendingAIQueueCountByConversation returns the number of pending items for a conversation.
func PendingAIQueueCountByConversation(convID string) (int, error) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM ai_queue WHERE conv_id=? AND status='pending'", convID).Scan(&count)
	return count, err
}

// ListPendingAIQueue returns all pending items in the queue.
func ListPendingAIQueue() ([]AIQueueRow, error) {
	rows, err := db.Query("SELECT id, conv_id, content, COALESCE(client_id, 'web'), COALESCE(provider_id, ''), COALESCE(model, ''), status, created_at FROM ai_queue WHERE status='pending' ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []AIQueueRow
	for rows.Next() {
		var r AIQueueRow
		if err := rows.Scan(&r.ID, &r.ConvID, &r.Content, &r.ClientID, &r.ProviderID, &r.Model, &r.Status, &r.CreatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, nil
}
