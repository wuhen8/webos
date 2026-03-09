package response

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response 统一响应结构 (legacy format, kept for backward compat)
type Response struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
	Message string      `json:"message"`
}

// JSONRPCResponse is a JSON-RPC 2.0 response for HTTP endpoints.
type JSONRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *JSONRPCErr `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

type JSONRPCErr struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Success 成功响应 (JSON-RPC 2.0)
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Data:    data,
		Message: "success",
	})
}

// SuccessMsg 成功响应带消息
func SuccessMsg(c *gin.Context, data interface{}, message string) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Data:    data,
		Message: message,
	})
}

// Error 错误响应
func Error(c *gin.Context, httpCode int, code int, message string) {
	c.JSON(httpCode, Response{
		Code:    code,
		Data:    nil,
		Message: message,
	})
}

// InternalError 内部错误响应 — 日志记录真实错误，客户端只看到通用消息
func InternalError(c *gin.Context, msg string, err error) {
	log.Printf("[ERROR] %s: %v", msg, err)
	c.JSON(http.StatusInternalServerError, Response{
		Code:    500,
		Data:    nil,
		Message: msg,
	})
}

// StringPtr 字符串指针辅助函数
func StringPtr(s string) *string {
	return &s
}
