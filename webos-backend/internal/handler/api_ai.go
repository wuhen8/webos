package handler

import (
	"net/http"
	"strings"

	"webos-backend/internal/database"

	"github.com/gin-gonic/gin"
)

// ExternalAISendHandler handles POST /api/ai/send — external API with token auth.
func ExternalAISendHandler(c *gin.Context) {
	// Extract Bearer token
	auth := c.GetHeader("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid Authorization header"})
		return
	}
	token := strings.TrimPrefix(auth, "Bearer ")

	if !database.ValidateAPIToken(token) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	var req struct {
		ConversationID string `json:"conversationId"`
		Message        string `json:"message"`
		ClientID       string `json:"clientId"`
		ProviderID     string `json:"providerId"`
		Model          string `json:"model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}

	// Default to "api" for REST API clients
	clientID := req.ClientID
	if clientID == "" {
		clientID = "api"
	}

	// All messages (including commands) go through ChatService
	result := chatSvc.SendMessage(req.ConversationID, req.Message, clientID, req.ProviderID, req.Model)
	if !result.Accepted {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "enqueue failed"})
		return
	}

	conversationID := result.ConversationID
	c.JSON(http.StatusOK, gin.H{"ok": true, "conversationId": conversationID})
}
