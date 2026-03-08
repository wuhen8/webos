package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"webos-backend/internal/database"

	"github.com/gin-gonic/gin"
)

// WS handler: notify.broadcast
func init() {
	RegisterHandlers(map[string]Handler{
		"notify.broadcast": handleBroadcastNotify,
	})
}

func handleBroadcastNotify(c *WSConn, raw json.RawMessage) {
	var p struct {
		ReqID   string `json:"reqId"`
		Level   string `json:"level"`
		Title   string `json:"title"`
		Message string `json:"message"`
		Source  string `json:"source"`
		Target  string `json:"target"`
	}
	if json.Unmarshal(raw, &p) != nil || p.Message == "" {
		c.ReplyErr("notify.broadcast", p.ReqID, fmt.Errorf("message is required"))
		return
	}
	if p.Level == "" {
		p.Level = "info"
	}
	doBroadcastNotify(p.Level, p.Title, p.Message, p.Source, p.Target)
	c.Reply("notify.broadcast", p.ReqID, map[string]string{"ok": "broadcast"})
}

// doBroadcastNotify is the shared implementation for all entry points.
// If target is non-empty, sends only to that sink ID; otherwise broadcasts to all.
func doBroadcastNotify(level, title, message, source, target string) {
	data := map[string]string{
		"level":   level,
		"title":   title,
		"message": message,
		"source":  source,
	}
	sink := chatSvc.GetBroadcastSink()
	if target != "" {
		if !sink.SendToSystemEvent(target, "system.notify", data) {
			log.Printf("[notify] target sink %q not found, dropping", target)
		}
	} else {
		sink.OnSystemEvent("system.notify", data)
	}
	log.Printf("[notify] [%s] %s: %s (from: %s, target: %s)", level, title, message, source, target)
}

// ExternalNotifyHandler handles POST /api/notify — external API with token auth.
func ExternalNotifyHandler(c *gin.Context) {
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
		Level   string `json:"level"`
		Title   string `json:"title"`
		Message string `json:"message"`
		Source  string `json:"source"`
		Target  string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if req.Level == "" {
		req.Level = "info"
	}
	doBroadcastNotify(req.Level, req.Title, req.Message, req.Source, req.Target)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
