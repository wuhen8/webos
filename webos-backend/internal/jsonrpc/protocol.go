// Package jsonrpc implements JSON-RPC 2.0 protocol types and routing.
// This is the single source of truth for all three transports:
// WebSocket, HTTP, and WASM host calls.
package jsonrpc

import (
	"encoding/json"
	"fmt"
	"sync"
)

const Version = "2.0"

// ==================== Protocol types ====================

// Request is a JSON-RPC 2.0 request.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      interface{}     `json:"id,omitempty"` // string | number | null (notification if absent)
}

// Response is a JSON-RPC 2.0 response.
type Response struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *Error      `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// Notification is a JSON-RPC 2.0 notification (no id, server→client push).
type Notification struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// Error is a JSON-RPC 2.0 error object.
type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *Error) Error() string { return fmt.Sprintf("jsonrpc error %d: %s", e.Code, e.Message) }

// ==================== Standard error codes ====================

const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
	// Application-defined errors: -32000 to -32099
	CodeAppError       = -32000
	CodeUnauthorized   = -32001
	CodePermDenied     = -32002
)

// ==================== Error constructors ====================

func ErrParseError(data interface{}) *Error {
	return &Error{Code: CodeParseError, Message: "Parse error", Data: data}
}

func ErrInvalidRequest(data interface{}) *Error {
	return &Error{Code: CodeInvalidRequest, Message: "Invalid Request", Data: data}
}

func ErrMethodNotFound(method string) *Error {
	return &Error{Code: CodeMethodNotFound, Message: "Method not found: " + method}
}

func ErrInvalidParams(msg string) *Error {
	return &Error{Code: CodeInvalidParams, Message: msg}
}

func ErrInternal(msg string) *Error {
	return &Error{Code: CodeInternalError, Message: msg}
}

func ErrApp(msg string) *Error {
	return &Error{Code: CodeAppError, Message: msg}
}

func ErrFromError(err error) *Error {
	if err == nil {
		return nil
	}
	if e, ok := err.(*Error); ok {
		return e
	}
	return ErrApp(err.Error())
}

// ==================== Builder helpers ====================

func NewRequest(method string, params interface{}, id interface{}) (*Request, error) {
	var raw json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	return &Request{JSONRPC: Version, Method: method, Params: raw, ID: id}, nil
}

func NewResponse(id interface{}, result interface{}) *Response {
	return &Response{JSONRPC: Version, Result: result, ID: id}
}

func NewErrorResponse(id interface{}, err *Error) *Response {
	return &Response{JSONRPC: Version, Error: err, ID: id}
}

func NewNotification(method string, params interface{}) *Notification {
	return &Notification{JSONRPC: Version, Method: method, Params: params}
}

// ==================== Conn: transport-agnostic connection ====================

// Conn abstracts a bidirectional JSON-RPC connection.
// Implemented by WebSocket, HTTP (single request-response), and WASM bridge.
type Conn interface {
	// Send sends a JSON-RPC response or notification.
	Send(v interface{}) error
	// ConnID returns a unique identifier for this connection.
	ConnID() string
	// Context returns transport-specific state (e.g. WSConn for subscriptions).
	Context() interface{}
}

// ==================== Handler & Router ====================

// Handler processes a JSON-RPC request and returns (result, error).
// If both are nil, the handler sent the response itself (streaming, etc).
type Handler func(conn Conn, method string, params json.RawMessage) (interface{}, *Error)

// Router maps method names to handlers.
type Router struct {
	mu       sync.RWMutex
	handlers map[string]Handler
}

func NewRouter() *Router {
	return &Router{handlers: make(map[string]Handler)}
}

// Register registers a handler for a method.
func (r *Router) Register(method string, h Handler) {
	r.mu.Lock()
	r.handlers[method] = h
	r.mu.Unlock()
}

// RegisterMap registers multiple handlers at once.
func (r *Router) RegisterMap(m map[string]Handler) {
	r.mu.Lock()
	for k, v := range m {
		r.handlers[k] = v
	}
	r.mu.Unlock()
}

// Lookup returns the handler for a method, or nil.
func (r *Router) Lookup(method string) Handler {
	r.mu.RLock()
	h := r.handlers[method]
	r.mu.RUnlock()
	return h
}

// Dispatch parses a raw JSON message, routes it, and sends the response.
func (r *Router) Dispatch(conn Conn, raw json.RawMessage) {
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		conn.Send(NewErrorResponse(nil, ErrParseError(err.Error())))
		return
	}
	if req.JSONRPC != Version || req.Method == "" {
		conn.Send(NewErrorResponse(req.ID, ErrInvalidRequest("missing jsonrpc version or method")))
		return
	}

	h := r.Lookup(req.Method)
	if h == nil {
		if req.ID != nil {
			conn.Send(NewErrorResponse(req.ID, ErrMethodNotFound(req.Method)))
		}
		return
	}

	result, rpcErr := h(conn, req.Method, req.Params)
	// If both nil, handler already sent the response (async/streaming)
	if result == nil && rpcErr == nil {
		return
	}
	if req.ID != nil {
		if rpcErr != nil {
			conn.Send(NewErrorResponse(req.ID, rpcErr))
		} else {
			conn.Send(NewResponse(req.ID, result))
		}
	}
}

// ==================== Global router ====================

var globalRouter = NewRouter()

// Register registers a handler on the global router.
func Register(method string, h Handler) {
	globalRouter.Register(method, h)
}

// RegisterMap registers multiple handlers on the global router.
func RegisterMap(m map[string]Handler) {
	globalRouter.RegisterMap(m)
}

// Global returns the global router.
func Global() *Router {
	return globalRouter
}
