package jsonrpc

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HTTPTransport implements Conn for HTTP JSON-RPC requests.
// Supports both single requests and batch requests.
type HTTPTransport struct {
	GinCtx *gin.Context
	ID     string
}

func (h *HTTPTransport) Send(v interface{}) error {
	h.GinCtx.JSON(http.StatusOK, v)
	return nil
}

func (h *HTTPTransport) ConnID() string {
	return h.ID
}

func (h *HTTPTransport) Context() interface{} {
	return h.GinCtx
}

// HandleHTTP creates a Gin handler that dispatches JSON-RPC requests via the global router.
func HandleHTTP() gin.HandlerFunc {
	return HandleHTTPWithRouter(Global())
}

// HandleHTTPWithRouter creates a Gin handler that dispatches JSON-RPC requests via the given router.
func HandleHTTPWithRouter(router *Router) gin.HandlerFunc {
	return func(c *gin.Context) {
		var raw json.RawMessage
		if err := c.ShouldBindJSON(&raw); err != nil {
			c.JSON(http.StatusOK, NewErrorResponse(nil, ErrParseError(err.Error())))
			return
		}

		// Check if batch request
		if len(raw) > 0 && raw[0] == '[' {
			var reqs []json.RawMessage
			if err := json.Unmarshal(raw, &reqs); err != nil {
				c.JSON(http.StatusOK, NewErrorResponse(nil, ErrParseError(err.Error())))
				return
			}
			responses := make([]*Response, 0, len(reqs))
			for _, r := range reqs {
				conn := &batchCollector{}
				router.Dispatch(conn, r)
				if conn.resp != nil {
					responses = append(responses, conn.resp)
				}
			}
			c.JSON(http.StatusOK, responses)
			return
		}

		conn := &HTTPTransport{GinCtx: c, ID: c.GetHeader("X-Request-ID")}
		router.Dispatch(conn, raw)
	}
}

// batchCollector captures a single response for batch processing.
type batchCollector struct {
	resp *Response
}

func (b *batchCollector) Send(v interface{}) error {
	if r, ok := v.(*Response); ok {
		b.resp = r
	}
	return nil
}

func (b *batchCollector) ConnID() string { return "batch" }
func (b *batchCollector) Context() interface{} { return nil }
