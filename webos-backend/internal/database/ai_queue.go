package database

import "time"

// AIQueueRow represents a row in ai_queue.
type AIQueueRow struct {
	ID        int64  `json:"id"`
	ConvID    string `json:"convId"`
	Content   string `json:"content"`
	ClientID  string `json:"clientId"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"createdAt"`
}

// EnqueueAIMessage inserts a pending message into the queue and returns its ID.
func EnqueueAIMessage(convID, content, clientID string) (int64, error) {
	if clientID == "" {
		clientID = "web"
	}
	res, err := db.Exec(
		"INSERT INTO ai_queue(conv_id, content, client_id, status, created_at) VALUES(?, ?, ?, 'pending', ?)",
		convID, content, clientID, time.Now().Unix(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// DequeueAIMessage returns the oldest pending message and marks it as 'processing'.
// Returns nil if the queue is empty.
func DequeueAIMessage() (*AIQueueRow, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	var r AIQueueRow
	err = tx.QueryRow(
		"SELECT id, conv_id, content, COALESCE(client_id, 'web'), status, created_at FROM ai_queue WHERE status='pending' ORDER BY id LIMIT 1",
	).Scan(&r.ID, &r.ConvID, &r.Content, &r.ClientID, &r.Status, &r.CreatedAt)
	if err != nil {
		tx.Rollback()
		if err.Error() == "sql: no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	if _, err := tx.Exec("UPDATE ai_queue SET status='processing' WHERE id=?", r.ID); err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	r.Status = "processing"
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

// DeleteAIQueueByConversation removes all pending queue items for a conversation.
func DeleteAIQueueByConversation(convID string) error {
	_, err := db.Exec("DELETE FROM ai_queue WHERE conv_id=? AND status='pending'", convID)
	return err
}

// ListPendingAIQueue returns all pending items in the queue.
func ListPendingAIQueue() ([]AIQueueRow, error) {
	rows, err := db.Query("SELECT id, conv_id, content, COALESCE(client_id, 'web'), status, created_at FROM ai_queue WHERE status='pending' ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []AIQueueRow
	for rows.Next() {
		var r AIQueueRow
		if err := rows.Scan(&r.ID, &r.ConvID, &r.Content, &r.ClientID, &r.Status, &r.CreatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, nil
}
