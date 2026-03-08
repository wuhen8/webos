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

	// ── First-message authentication ──
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		conn.WriteJSON(map[string]string{"type": "auth", "message": "auth timeout"})
		return
	}
	var authMsg struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}
	if json.Unmarshal(raw, &authMsg) != nil || authMsg.Type != "auth" || authMsg.Token == "" {
		conn.WriteJSON(map[string]string{"type": "auth", "message": "first message must be {\"type\":\"auth\",\"token\":\"...\"}"})
		return
	}
	claims, err := auth.ValidateToken(authMsg.Token)
	if err != nil {
		conn.WriteJSON(map[string]string{"type": "auth", "message": "invalid or expired token"})
		return
	}
	conn.SetReadDeadline(time.Time{}) // clear deadline

	// Generate connID early so we can include it in the auth response
	connID := genSid()

	conn.WriteJSON(map[string]interface{}{
		"type":    "auth",
		"message": "ok",
		"data": map[string]interface{}{
			"username": claims.Username,
			"avatar":   "",
			"homePath": "~",
			"connId":   connID,
		},
	})

	// ── Build WSConn ──
	var writeMu sync.Mutex
	done := make(chan struct{})

	wc := &WSConn{
		ConnID: connID,
		Done:   done,
		WriteJSON: func(v interface{}) error {
			writeMu.Lock()
			defer writeMu.Unlock()
			return conn.WriteJSON(v)
		},
		Subs:         make(map[string]*Subscription),
		TickCh:       make(chan string, 16),
		Pushing:      make(map[string]bool),
		Sessions:     make(map[string]*TerminalSession),
		FileWatcher:  service.GetFileWatcher(),
		FsWatches:    make(map[string]string),
		MountWatcher: service.GetMountWatcher(),
		Cancels:      make(map[string]context.CancelFunc),
	}

	// Subscribe to background task updates
	taskUnsub := service.GetTaskManager().Subscribe(connID, func(task service.BackgroundTask) {
		wc.WriteJSON(wsServerMsg{Type: "task.update", Data: task})
	})

	// Subscribe to scheduler job status changes
	schedConnID := "ws_sched_" + connID
	service.GetScheduler().Subscribe(schedConnID, func(status service.JobStatus) {
		wc.WriteJSON(wsServerMsg{Type: "scheduled_job.changed", Data: status})
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
	// Send current executor status immediately
	wc.WriteJSON(wsServerMsg{Type: "chat.status_update", Data: sysCtx.Snapshot().Executor})

	// ── Read goroutine ──
	type rawMsg struct {
		Type string          `json:"type"`
		Raw  json.RawMessage // the full message
	}
	msgCh := make(chan rawMsg, 64)

	go func() {
		defer close(done)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var envelope struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(data, &envelope) == nil && envelope.Type != "" {
				select {
				case msgCh <- rawMsg{Type: envelope.Type, Raw: json.RawMessage(data)}:
				default:
					fmt.Printf("WS[%s] message dropped (channel full): type=%s\n", connID, envelope.Type)
				}
			}
		}
	}()

	// ── Cleanup on exit ──
	defer func() {
		chatSvc.GetSystemContext().Unsubscribe(aiSinkID)
		ai.UnregisterClientContext(connID)
		taskUnsub()
		service.GetScheduler().Unsubscribe(schedConnID)
		for k, sub := range wc.Subs {
			if k == "sub.docker_containers" {
				dockerSvc.StopStats()
			}
			sub.Ticker.Stop()
		}
		for _, sess := range wc.Sessions {
			sess.Cleanup()
		}
		wc.LogSubMu.Lock()
		if wc.LogSubDone != nil {
			close(wc.LogSubDone)
		}
		wc.LogSubMu.Unlock()
		wc.FileWatcher.UnsubscribeAll(connID)
		if wc.MountWatching {
			wc.MountWatcher.Unsubscribe(connID)
		}
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
			if handler := LookupHandler(msg.Type); handler != nil {
				handler(wc, msg.Raw)
			} else {
				var envelope struct {
					ReqID string `json:"reqId"`
				}
				json.Unmarshal(msg.Raw, &envelope)
				if envelope.ReqID != "" {
					wc.ReplyErr(msg.Type, envelope.ReqID, fmt.Errorf("unknown message type: %s", msg.Type))
				}
			}

		case ch := <-wc.TickCh:
			if _, ok := wc.Subs[ch]; ok {
				go wc.PushData(ch)
			}
		}
	}
}
