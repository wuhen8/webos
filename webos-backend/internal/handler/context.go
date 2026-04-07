package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"time"

	"webos-backend/internal/ai"
	"webos-backend/internal/jsonrpc"
	"webos-backend/internal/pubsub"
	"webos-backend/internal/service"
)

// ==================== Service singletons ====================

var systemSvc = service.NewSystemService()
var dockerSvc = service.GetDockerService()

// ==================== WSConn: per-connection shared state ====================

// WSConn holds all state associated with a single WebSocket connection.
type WSConn struct {
	ConnID    string
	Username  string
	Done      chan struct{}
	WriteJSON func(v interface{}) error

	// Terminal sessions
	Sessions map[string]*TerminalSession

	// File system watcher
	FileWatcher *service.FileWatcher
	FsWatches   map[string]string // "nodeId:path" -> absPath

	// Docker log subscription (one active at a time per connection)
	LogSubMu   sync.Mutex
	LogSubDone chan struct{}

	// Cancellable long-running operations, keyed by "type:key" (e.g. "fs.stat:nodeId:path")
	CancelMu sync.Mutex
	Cancels  map[string]context.CancelFunc
}

// TerminalSession holds a single pty session.
type TerminalSession struct {
	Sid  string
	Cmd  *exec.Cmd
	Ptmx *os.File
	Done chan struct{}
	Once sync.Once
}

func (s *TerminalSession) Cleanup() {
	s.Once.Do(func() {
		close(s.Done)
		s.Ptmx.Close()
		s.Cmd.Process.Kill()
		s.Cmd.Wait()
	})
}

// ==================== Handler registry ====================

// Handler is the signature for a domain-specific message handler.
// Protocol-agnostic — used by WebSocket, wasm, and any future protocol adapter.
type Handler func(c *WSConn, raw json.RawMessage)

var (
	handlersMu sync.Mutex
	handlers   = map[string]Handler{}
)

// RegisterHandlers registers one or more message-type → handler mappings.
func RegisterHandlers(m map[string]Handler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	for k, v := range m {
		handlers[k] = v
	}
}

// LookupHandler returns the handler for a given message type, or nil.
func LookupHandler(msgType string) Handler {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	return handlers[msgType]
}

// ==================== JSON-RPC 2.0 response types ====================

// jsonrpcResponse is a JSON-RPC 2.0 response.
// NOTE: result uses a custom pointer so that a nil/null result is still
// serialised (JSON-RPC 2.0 requires exactly one of result/error).
type jsonrpcResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result"`
	Error   *jsonrpcErr `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

type jsonrpcErr struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// jsonrpcNotification is a JSON-RPC 2.0 notification (server push).
type jsonrpcNotification struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// ==================== Application error codes ====================
// JSON-RPC 2.0 reserves -32000 to -32099 for server errors.
// Application-specific codes use positive numbers to avoid conflicts.

// Application error codes — re-exported from jsonrpc package for convenience.
const (
	ErrCodeServer            = jsonrpc.CodeAppError
	ErrCodeUnauthorized      = jsonrpc.CodeUnauthorized
	ErrCodePermDenied        = jsonrpc.CodePermDenied
	ErrCodePasswordRequired  = jsonrpc.CodePasswordRequired
	ErrCodePasswordIncorrect = jsonrpc.CodePasswordIncorrect
)

// ==================== Reply helpers ====================

// Reply sends a success response (JSON-RPC 2.0).
func (c *WSConn) Reply(msgType, reqID string, data interface{}) {
	c.WriteJSON(jsonrpcResponse{
		JSONRPC: "2.0",
		Result:  data,
		ID:      reqID,
	})
}

// replyError is the internal helper that sends a JSON-RPC 2.0 error response.
// Uses a dedicated struct so that "result" is omitted entirely.
func (c *WSConn) replyError(reqID string, code int, message string, data interface{}) {
	c.WriteJSON(struct {
		JSONRPC string      `json:"jsonrpc"`
		Error   *jsonrpcErr `json:"error"`
		ID      interface{} `json:"id"`
	}{
		JSONRPC: "2.0",
		Error:   &jsonrpcErr{Code: code, Message: message, Data: data},
		ID:      reqID,
	})
}

// ReplyErr sends a generic server error response (code -32000).
func (c *WSConn) ReplyErr(msgType, reqID string, err error) {
	c.replyError(reqID, ErrCodeServer, err.Error(), nil)
}

// ReplyCodeErr sends an error response with a specific application error code.
func (c *WSConn) ReplyCodeErr(msgType, reqID string, code int, message string, data interface{}) {
	c.replyError(reqID, code, message, data)
}

// ReplyResult sends data on success or error message on failure.
func (c *WSConn) ReplyResult(msgType, reqID string, data interface{}, err error) {
	if err != nil {
		c.ReplyErr(msgType, reqID, err)
	} else {
		c.Reply(msgType, reqID, data)
	}
}

// Notify sends a JSON-RPC 2.0 notification (server push, no id).
func (c *WSConn) Notify(method string, params interface{}) {
	c.WriteJSON(jsonrpcNotification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	})
}

// ==================== Generic async handler ====================

// wsReq is the interface for all WS request params that carry a ReqID.
type wsReq interface {
	GetReqID() string
}

// baseReq can be embedded in request structs to satisfy wsReq.
type baseReq struct {
	ReqID      string `json:"reqId"`      // JSON-RPC protocol id (for Reply/ReplyErr)
	ProgressID string `json:"progressId"` // Business id for progress notifications (optional)
}

func (b baseReq) GetReqID() string { return b.ReqID }

// GetProgressID returns the business progress id if set, otherwise falls back to ReqID.
func (b baseReq) GetProgressID() string {
	if b.ProgressID != "" {
		return b.ProgressID
	}
	return b.ReqID
}

// asyncHandler creates a Handler that unmarshals P, runs fn in a goroutine,
// and sends the result back with the given msgType.
func asyncHandler[P wsReq](msgType string, fn func(c *WSConn, p P) (interface{}, error)) Handler {
	return func(c *WSConn, raw json.RawMessage) {
		var p P
		json.Unmarshal(raw, &p)
		go func() {
			data, err := fn(c, p)
			c.ReplyResult(msgType, p.GetReqID(), data, err)
		}()
	}
}

// errRequired returns a standard "field is required" error.
func errRequired(field string) error {
	return fmt.Errorf("%s is required", field)
}

// ==================== Shared helpers ====================

// clampInterval normalises a client-requested interval to a safe range.
func clampInterval(ms int) time.Duration {
	switch {
	case ms <= 1000:
		return 1000 * time.Millisecond
	case ms <= 3000:
		return 3000 * time.Millisecond
	case ms <= 5000:
		return 5000 * time.Millisecond
	default:
		return 10000 * time.Millisecond
	}
}

// ==================== AI service singleton ====================

var aiService *ai.Service
var aiExecutor *ai.AIExecutor
var chatSvc *ai.ChatService

// InitAI initializes the AI service and executor.
// Must be called from main() after database.Init() and storage.ReloadDrivers().
func InitAI() {
	aiService = ai.NewService(fileSvc)
	aiExecutor = ai.NewAIExecutor(aiService)
	aiService.Executor = aiExecutor
	aiService.SetSystemContext(ai.NewSystemContext(aiExecutor.Status, aiExecutor.GetBroadcastSink()))
	aiExecutor.Start()
	chatSvc = ai.NewChatService(aiExecutor, aiService)

	// Inject rate limit notification callback for 429 events
	sink := aiExecutor.GetBroadcastSink()
	ai.SetNotifyRateLimitCallback(func(level, title, message string) {
		sink.OnSystemEvent("system.notify", map[string]string{
			"level":   level,
			"title":   title,
			"message": message,
			"source":  "ai",
		})
	})

	// Wire up command executor with AI callbacks and system dependencies
	ai.InitCommandCallbacks(aiService)
	ce := service.GetCommandExecutor()
	ce.NotifySink = aiExecutor.GetBroadcastSink()
	ce.OnStop = func(convID string) {
		if convID == "" {
			return
		}
		if _, err := chatSvc.StopConversation(convID); err != nil {
			fmt.Printf("[ai] stop conversation failed conv=%s err=%v\n", convID, err)
		}
	}
	ce.OnAISend = func(convID, message, clientID string) (bool, string) {
		if clientID == "" {
			clientID = "system"
		}
		r := aiExecutor.Enqueue(convID, message, clientID, "", "")
		return r.Accepted, r.Reason
	}
}

// ==================== Subscribe / Unsubscribe handlers ====================

func init() {
	RegisterHandlers(map[string]Handler{
		"sub.subscribe":   handleSubscribe,
		"sub.unsubscribe": handleUnsubscribe,
		"task.cancel":     handleTaskCancel,
		"task.retry":      handleTaskRetry,
		"task.list":       handleTaskList,
	})
}

func handleSubscribe(c *WSConn, raw json.RawMessage) {
	var p struct {
		Channel  string `json:"channel"`
		Interval int    `json:"interval"`
	}
	json.Unmarshal(raw, &p)

	var interval time.Duration
	if p.Interval > 0 {
		interval = clampInterval(p.Interval)
	}
	if err := pubsub.Default.Subscribe(c.ConnID, p.Channel, interval); err != nil {
		c.Notify("error", map[string]string{"message": err.Error()})
	}
}

func handleUnsubscribe(c *WSConn, raw json.RawMessage) {
	var p struct {
		Channel string `json:"channel"`
	}
	json.Unmarshal(raw, &p)

	if p.Channel == "" {
		pubsub.Default.UnsubscribeAll(c.ConnID)
	} else {
		pubsub.Default.Unsubscribe(c.ConnID, p.Channel)
	}
}

// ==================== Task handlers ====================

func handleTaskCancel(c *WSConn, raw json.RawMessage) {
	var p struct {
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data != "" {
		service.GetTaskManager().Cancel(p.Data)
	}
}

func handleTaskRetry(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data != "" {
		newID := service.GetTaskManager().Retry(p.Data)
		c.Reply("task.retry", p.ReqID, map[string]string{"newTaskId": newID})
	}
}

func handleTaskList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	c.Reply("task.list", p.ReqID, service.GetTaskManager().GetAll())
}
