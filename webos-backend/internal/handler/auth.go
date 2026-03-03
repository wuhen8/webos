package handler

import (
	"fmt"
	"net/http"
	"strings"

	"webos-backend/internal/auth"
	"webos-backend/internal/response"

	"github.com/gin-gonic/gin"
)

// AuthStatusHandler returns whether the system needs initial password setup.
func AuthStatusHandler(c *gin.Context) {
	hash := auth.GetPasswordHash()
	response.Success(c, gin.H{"needSetup": hash == ""})
}

// SetupPasswordHandler sets the initial password (only works when no password is set).
func SetupPasswordHandler(c *gin.Context) {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}
	if req.Password == "" {
		response.Error(c, http.StatusBadRequest, 400, "password is required")
		return
	}
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		response.Error(c, http.StatusBadRequest, 400, err.Error())
		return
	}

	if err := auth.SetPassword(req.Password, false); err != nil {
		response.InternalError(c, err.Error(), err)
		return
	}

	token, err := auth.GenerateToken("admin")
	if err != nil {
		response.InternalError(c, "生成令牌失败", err)
		return
	}
	response.Success(c, gin.H{"token": token})
}

// LoginHandler handles login requests.
func LoginHandler(c *gin.Context) {
	ip := c.ClientIP()

	if locked, remaining := auth.IsIPLocked(ip); locked {
		response.Error(c, http.StatusTooManyRequests, 429,
			fmt.Sprintf("登录失败次数过多，请 %d 分钟后再试", int(remaining.Minutes())+1))
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}

	if err := auth.CheckLogin(req.Password); err != nil {
		auth.RecordLoginFailure(ip)
		response.Error(c, http.StatusUnauthorized, 401, err.Error())
		return
	}

	auth.ResetLoginFailures(ip)

	token, err := auth.GenerateToken("admin")
	if err != nil {
		response.InternalError(c, "生成令牌失败", err)
		return
	}
	response.Success(c, gin.H{"token": token})
}

// UserInfoHandler returns current user info.
func UserInfoHandler(c *gin.Context) {
	username, _ := c.Get("username")
	response.Success(c, gin.H{
		"username": username,
		"avatar":   "",
		"homePath": "~",
	})
}

// UpdatePasswordHandler updates the password.
func UpdatePasswordHandler(c *gin.Context) {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}
	if req.Password == "" {
		response.Error(c, http.StatusBadRequest, 400, "password is required")
		return
	}
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		response.Error(c, http.StatusBadRequest, 400, err.Error())
		return
	}

	if err := auth.SetPassword(req.Password, true); err != nil {
		response.InternalError(c, err.Error(), err)
		return
	}
	response.SuccessMsg(c, nil, "Password updated")
}

// JWTAuthMiddleware JWT auth middleware.
func JWTAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		skipPaths := []string{"/api/login", "/api/lock/state", "/api/unlock", "/api/auth/status", "/api/setup-password"}
		for _, p := range skipPaths {
			if path == p {
				c.Next()
				return
			}
		}

		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Error(c, http.StatusUnauthorized, 401, "Authorization header required")
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			response.Error(c, http.StatusUnauthorized, 401, "Invalid authorization format")
			c.Abort()
			return
		}

		claims, err := auth.ValidateToken(tokenString)
		if err != nil {
			response.Error(c, http.StatusUnauthorized, 401, "Invalid or expired token")
			c.Abort()
			return
		}

		c.Set("username", claims.Username)
		c.Next()
	}
}
