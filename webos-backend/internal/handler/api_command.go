package handler

import (
	"net/http"
	"net/url"

	"webos-backend/internal/service"

	"github.com/gin-gonic/gin"
)

// CommandHandler handles POST /api/command — 执行斜杠命令，仅允许 localhost 访问。
func CommandHandler(c *gin.Context) {
	// 仅允许 localhost
	host := c.Request.Host
	if u, err := url.Parse("http://" + host); err == nil {
		host = u.Hostname()
	}
	remoteIP := c.ClientIP()
	if !isLocalhost(remoteIP) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only localhost access allowed"})
		return
	}

	var req struct {
		Command string `json:"command"` // 命令名，如 "notify", "status", "ai"
		Args    string `json:"args"`    // 命令参数
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Command == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "command is required"})
		return
	}

	ce := service.GetCommandExecutor()
	result := ce.ExecuteCommand("", req.Command, req.Args)

	c.JSON(http.StatusOK, gin.H{
		"text":    result.Text,
		"error":   result.IsError,
	})
}

func isLocalhost(ip string) bool {
	return ip == "127.0.0.1" || ip == "::1" || ip == "localhost"
}
