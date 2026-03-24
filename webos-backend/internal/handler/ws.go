package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"webos-backend/internal/ai"
	"webos-backend/internal/auth"
	"webos-backend/internal/pubsub"
	"webos-backend/internal/service"

	"github.com/gorilla/websocket"
)

// ==================== WebSocket upgrader ====================

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser clients (curl, etc.)
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		// Compare hostname only (ignore port) to support dev proxy and Capacitor app
		return parsed.Hostname() == hostOnly(r.Host) || parsed.Hostname() == "localhost"
	},
}

// hostOnly extracts the hostname part, stripping any :port suffix.
func hostOnly(h string) string {
	if u, err := url.Parse("http://" + h); err == nil {
		return u.Hostname()
	}
	return h
}

// ==================== Unified WebSocket entry point ====================

// HandleUnifiedWS is the single WebSocket entry point.
// It authenticates, creates a WSConn, runs the read-loop dispatch, and cleans up on exit.
func HandleUnifiedWS(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("WS upgrade error: %v\n", err)
		return
	}
	defer conn.Close()
	conn.SetReadLimit(16 << 20) // 16MB max message size

	// ── First-message authentication (JSON-RPC 2.0) ──
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		conn.WriteJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "auth", Params: map[string]string{"status": "error", "message": "auth timeout"}})
		return
	}
	var authMsg struct {
		Method string `json:"method"`
		Params struct {
			Token string `json:"token"`
		} `json:"params"`
	}
	if json.Unmarshal(raw, &authMsg) != nil || authMsg.Method != "auth" || authMsg.Params.Token == "" {
		conn.WriteJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "auth", Params: map[string]string{"status": "error", "message": "first message must be {\"jsonrpc\":\"2.0\",\"method\":\"auth\",\"params\":{\"token\":\"...\"}}"}})
		return
	}
	claims, err := auth.ValidateToken(authMsg.Params.Token)
	if err != nil {
		conn.WriteJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "auth", Params: map[string]string{"status": "error", "message": "invalid or expired token"}})
		return
	}
	conn.SetReadDeadline(time.Time{}) // clear deadline

	// Generate connID early so we can include it in the auth response
	connID := genSid()

	conn.WriteJSON(jsonrpcNotification{
		JSONRPC: "2.0",
		Method:  "auth",
		Params: map[string]interface{}{
			"status": "ok",
			"data": map[string]interface{}{
				"username": claims.Username,
				"avatar":   "",
				"homePath": "~",
				"connId":   connID,
			},
		},
	})

	// ── Build WSConn ──
	var writeMu sync.Mutex
	done := make(chan struct{})

	wc := &WSConn{
		ConnID:   connID,
		Username: claims.Username,
		Done:     done,
		WriteJSON: func(v interface{}) error {
			writeMu.Lock()
			defer writeMu.Unlock()
			return conn.WriteJSON(v)
		},
		Sessions:    make(map[string]*TerminalSession),
		FileWatcher: service.GetFileWatcher(),
		FsWatches:   make(map[string]string),
		Cancels:     make(map[string]context.CancelFunc),
	}

	// Register as a pubsub sink so subscribe/publish can push data to this connection.
	pubsub.Default.RegisterSink(connID, &wsPubsubSink{conn: wc})

	// Subscribe to background task updates
	taskUnsub := service.GetTaskManager().Subscribe(connID, func(task service.BackgroundTask) {
		wc.Notify("task.update", task)
	})

	// Subscribe to scheduler job status changes
	schedConnID := "ws_sched_" + connID
	service.GetScheduler().Subscribe(schedConnID, func(status service.JobStatus) {
		wc.Notify("scheduled_job.changed", status)
	})

	// Register per-connection ClientContext (inherits web capabilities) and sink.
	// Each tab/refresh gets its own identity so sink routing and SystemHint both work.
	ai.RegisterClientContext(&ai.ClientContext{
		ID:           connID,
		Platform:     "web",
		DisplayName:  "Web UI",
		Capabilities: []string{"markdown", "code_blocks", "images", "html", "tables", "latex"},
		SystemHint:   ai.GetClientContext("web").SystemHint,
	})
	aiSink := &wsSink{writeJSON: wc.WriteJSON}
	sysCtx := chatSvc.GetSystemContext()
	aiSinkID := connID
	sysCtx.Subscribe(aiSinkID, aiSink)
	userSinkID := ""
	if claims.Username != "" {
		userSinkID = "user:" + claims.Username + "#" + connID
		sysCtx.Subscribe(userSinkID, aiSink)
	}
	// Send current executor status immediately
	wc.Notify("chat.status_update", sysCtx.Snapshot().Executor)

	// ── Read goroutine ──
	type rawMsg struct {
		Method string          `json:"method"`
		ID     interface{}     `json:"id"`
		Params json.RawMessage `json:"params"`
		Raw    json.RawMessage
	}
	msgCh := make(chan rawMsg, 64)

	go func() {
		defer close(done)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var envelope rawMsg
			if json.Unmarshal(data, &envelope) == nil && envelope.Method != "" {
				envelope.Raw = json.RawMessage(data)
				select {
				case msgCh <- envelope:
				default:
					fmt.Printf("WS[%s] message dropped (channel full): %s\n", connID, envelope.Method)
				}
			}
		}
	}()

	// ── Cleanup on exit ──
	defer func() {
		chatSvc.GetSystemContext().Unsubscribe(aiSinkID)
		if userSinkID != "" {
			chatSvc.GetSystemContext().Unsubscribe(userSinkID)
		}
		ai.UnregisterClientContext(connID)
		taskUnsub()
		service.GetScheduler().Unsubscribe(schedConnID)
		pubsub.Default.UnregisterSink(connID)
		for _, sess := range wc.Sessions {
			sess.Cleanup()
		}
		wc.LogSubMu.Lock()
		if wc.LogSubDone != nil {
			close(wc.LogSubDone)
		}
		wc.LogSubMu.Unlock()
		wc.FileWatcher.UnsubscribeAll(connID)
		// Cancel all pending long-running operations
		wc.CancelMu.Lock()
		for k, cancel := range wc.Cancels {
			cancel()
			delete(wc.Cancels, k)
		}
		wc.CancelMu.Unlock()
	}()

	// ── Main dispatch loop ──
	for {
		select {
		case <-done:
			return

		case msg := <-msgCh:
			if handler := LookupHandler(msg.Method); handler != nil {
				params := msg.Params
				if len(params) == 0 || string(params) == "null" {
					params = json.RawMessage(`{}`)
				}

				protoID := ""
				if msg.ID != nil {
					switch v := msg.ID.(type) {
					case string:
						protoID = v
					case float64:
						protoID = fmt.Sprintf("%.0f", v)
					}
				}

				if protoID != "" {
					var paramsMap map[string]json.RawMessage
					if json.Unmarshal(params, &paramsMap) == nil {
						if bizReqID, exists := paramsMap["reqId"]; exists {
							paramsMap["progressId"] = bizReqID
						}
						quotedID, _ := json.Marshal(protoID)
						paramsMap["reqId"] = quotedID
						params, _ = json.Marshal(paramsMap)
					}
				}

				handler(wc, params)
			} else if msg.ID != nil {
				reqID := ""
				switch v := msg.ID.(type) {
				case string:
					reqID = v
				case float64:
					reqID = fmt.Sprintf("%.0f", v)
				}
				wc.ReplyErr(msg.Method, reqID, fmt.Errorf("unknown method: %s", msg.Method))
			}
		}
	}
}

// wsPubsubSink adapts a WSConn to the pubsub.Sink interface.
type wsPubsubSink struct {
	conn *WSConn
}

func (s *wsPubsubSink) Push(channel string, data interface{}) {
	s.conn.Notify(channel, data)
}
