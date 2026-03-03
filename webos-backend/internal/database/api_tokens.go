package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

// APITokenRow represents a row in api_tokens.
type APITokenRow struct {
	ID        int64  `json:"id"`
	Token     string `json:"token"`
	Name      string `json:"name"`
	ExpiresAt int64  `json:"expiresAt"` // 0 = never expires
	CreatedAt int64  `json:"createdAt"`
}

// generateToken creates a cryptographically random 32-byte hex token.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CreateAPIToken creates a new API token with optional expiry.
// expiresIn is duration in seconds; 0 means never expires.
func CreateAPIToken(name string, expiresIn int64) (*APITokenRow, error) {
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	now := time.Now().Unix()
	var expiresAt int64
	if expiresIn > 0 {
		expiresAt = now + expiresIn
	}
	_, err = db.Exec(
		"INSERT INTO api_tokens(token, name, expires_at, created_at) VALUES(?, ?, ?, ?)",
		token, name, expiresAt, now,
	)
	if err != nil {
		return nil, err
	}
	return &APITokenRow{Token: token, Name: name, ExpiresAt: expiresAt, CreatedAt: now}, nil
}

// ValidateAPIToken checks if a token exists and is not expired.
func ValidateAPIToken(token string) bool {
	var expiresAt int64
	err := db.QueryRow("SELECT expires_at FROM api_tokens WHERE token=?", token).Scan(&expiresAt)
	if err != nil {
		return false
	}
	if expiresAt > 0 && time.Now().Unix() > expiresAt {
		return false
	}
	return true
}

// ListAPITokens returns all tokens.
func ListAPITokens() ([]APITokenRow, error) {
	rows, err := db.Query("SELECT id, token, name, expires_at, created_at FROM api_tokens ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []APITokenRow
	for rows.Next() {
		var r APITokenRow
		if err := rows.Scan(&r.ID, &r.Token, &r.Name, &r.ExpiresAt, &r.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// DeleteAPIToken deletes a token by ID.
func DeleteAPIToken(id int64) error {
	res, err := db.Exec("DELETE FROM api_tokens WHERE id=?", id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
