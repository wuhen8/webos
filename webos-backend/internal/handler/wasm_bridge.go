package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"time"

	"webos-backend/internal/ai"
	"webos-backend/internal/auth"
	"webos-backend/internal/storage"
	"webos-backend/internal/wasm"
)

// InitWasmBridge connects wasm to the handler registry and event system.
// Must be called after InitAI().
func InitWasmBridge() {
	wasm.SetRequestBridge(WasmRequest)

	// Register sync handlers — protocol-agnostic, any WASM app can call these directly.
	// These bypass the WebSocket layer entirely, calling service/executor directly.
	wasm.RegisterSyncHandler("ai_commands", func(_ json.RawMessage) ([]byte, error) {
		return json.Marshal(chatSvc.Commands())
	})
	wasm.RegisterSyncHandler("chat_send", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			ConversationID string `json:"conversationId"`
			MessageContent string `json:"messageContent"`
			ClientID       string `json:"clientId"`
		}
		json.Unmarshal(payload, &p)
		return json.Marshal(chatSvc.SendMessage(p.ConversationID, p.MessageContent, p.ClientID))
	})
	wasm.RegisterSyncHandler("chat_history", func(_ json.RawMessage) ([]byte, error) {
		convs, err := chatSvc.ListConversations()
		if err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		return json.Marshal(convs)
	})
	wasm.RegisterSyncHandler("chat_messages", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			ConversationID string `json:"conversationId"`
		}
		json.Unmarshal(payload, &p)
		msgs, err := chatSvc.GetMessages(p.ConversationID)
		if err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		return json.Marshal(msgs)
	})
	wasm.RegisterSyncHandler("chat_status", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			ConversationID string `json:"conversationId"`
		}
		json.Unmarshal(payload, &p)
		return json.Marshal(chatSvc.GetStatus(p.ConversationID))
	})
	wasm.RegisterSyncHandler("chat_executor_status", func(_ json.RawMessage) ([]byte, error) {
		return json.Marshal(chatSvc.ExecutorStatus())
	})
	wasm.RegisterSyncHandler("chat_delete", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			ConversationID string `json:"conversationId"`
		}
		json.Unmarshal(payload, &p)
		err := chatSvc.DeleteConversation(p.ConversationID)
		if err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		return json.Marshal(map[string]string{"ok": "deleted"})
	})
	wasm.RegisterSyncHandler("chat_cleanup", func(_ json.RawMessage) ([]byte, error) {
		go chatSvc.Cleanup()
		return json.Marshal(map[string]string{"ok": "started"})
	})

	// Client context registration — WASM apps declare their identity and formatting preferences
	wasm.RegisterSyncHandler("register_client_context", func(payload json.RawMessage) ([]byte, error) {
		var cc ai.ClientContext
		if err := json.Unmarshal(payload, &cc); err != nil {
			return json.Marshal(map[string]string{"error": "invalid client context: " + err.Error()})
		}
		if cc.ID == "" {
			return json.Marshal(map[string]string{"error": "client context id is required"})
		}
		ai.RegisterClientContext(&cc)
		return json.Marshal(map[string]string{"ok": "registered", "id": cc.ID})
	})

	// File download URL signing — WASM apps can get signed download URLs for files
	wasm.RegisterSyncHandler("file_download_sign", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			NodeID string `json:"nodeId"`
			Path   string `json:"path"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		if p.NodeID == "" || p.Path == "" {
			return json.Marshal(map[string]string{"error": "nodeId and path are required"})
		}
		exp, sign := auth.GenerateDownloadSign(p.NodeID, p.Path, 6*60*60)
		return json.Marshal(map[string]interface{}{
			"nodeId": p.NodeID,
			"path":   p.Path,
			"exp":    exp,
			"sign":   sign,
		})
	})

	// File proxy POST — WASM apps can upload files from storage to external APIs
	// via multipart/form-data without loading file content into WASM memory.
	// Returns {"requestId":"req_xxx"} immediately; result arrives as http_response event.
	wasm.RegisterSyncHandler("file_proxy_post", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			URL       string            `json:"url"`
			FileField string            `json:"fileField"`
			NodeID    string            `json:"nodeId"`
			Path      string            `json:"path"`
			FileName  string            `json:"fileName"`
			Fields    map[string]string `json:"fields"`
			Headers   map[string]string `json:"headers"`
			AppID     string            `json:"appId"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		if p.URL == "" || p.FileField == "" || p.NodeID == "" || p.Path == "" {
			return json.Marshal(map[string]string{"error": "url, fileField, nodeId, path are required"})
		}
		if p.FileName == "" {
			p.FileName = filepath.Base(p.Path)
		}

		reqID := fmt.Sprintf("fpp_%d", time.Now().UnixNano())

		go fileProxyPost(p.AppID, reqID, p.URL, p.FileField, p.NodeID, p.Path, p.FileName, p.Fields, p.Headers)

		return json.Marshal(map[string]string{"requestId": reqID})
	})

	// Config hint broadcast — WASM apps can notify all clients about discovered config values.
	// Used when a bot receives a message but has no chat_id configured yet.
	wasm.RegisterSyncHandler("notify_config_hint", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			AppID    string `json:"appId"`
			AppName  string `json:"appName"`
			Key      string `json:"key"`
			Value    string `json:"value"`
			UserName string `json:"userName"`
			Message  string `json:"message"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		if p.AppID == "" || p.Key == "" || p.Value == "" {
			return json.Marshal(map[string]string{"error": "appId, key, value are required"})
		}
		// Broadcast to all connected clients (Web UI, other bots, etc.)
		chatSvc.GetBroadcastSink().OnSystemEvent("config_hint", map[string]string{
			"appId":    p.AppID,
			"appName":  p.AppName,
			"key":      p.Key,
			"value":    p.Value,
			"userName": p.UserName,
			"message":  p.Message,
		})
		log.Printf("[config_hint] %s: %s=%s (from user: %s)", p.AppID, p.Key, p.Value, p.UserName)
		return json.Marshal(map[string]string{"ok": "broadcast"})
	})

	rt := wasm.GetRuntime()
	rt.OnProcStart = RegisterWasmSink
	rt.OnProcStop = UnregisterWasmSink
}

// WasmRequest calls a registered handler asynchronously (fire-and-forget).
func WasmRequest(msgType string, payload json.RawMessage) ([]byte, error) {
	h := LookupHandler(msgType)
	if h == nil {
		return json.Marshal(map[string]string{"error": "unknown handler: " + msgType})
	}

	conn := &WSConn{
		ConnID:    "wasm",
		Done:      make(chan struct{}),
		Subs:      make(map[string]*Subscription),
		TickCh:    make(chan string, 8),
		Pushing:   make(map[string]bool),
		Sessions:  make(map[string]*TerminalSession),
		FsWatches: make(map[string]string),
		Cancels:   make(map[string]context.CancelFunc),
		WriteJSON: func(v interface{}) error { return nil },
	}

	go h(conn, payload)
	return json.Marshal(map[string]string{"ok": "queued"})
}

// RegisterWasmSink registers an async wasmEventSink for a wasm app.
func RegisterWasmSink(appID string) {
	sink := newWasmEventSink(appID, nil)
	sysCtx := chatSvc.GetSystemContext()
	sysCtx.Subscribe("wasm_"+appID, sink)
}

// UnregisterWasmSink removes the event sink for a wasm app.
func UnregisterWasmSink(appID string) {
	sysCtx := chatSvc.GetSystemContext()
	sysCtx.Unsubscribe("wasm_" + appID)
}

// wasmEventSink implements ai.ChatSink via async channel.
// push() 丢 channel 瞬间返回，不阻塞 BroadcastSink。
// If filter is non-nil, only event types in the filter set are forwarded.
type wasmEventSink struct {
	appID  string
	ch     chan []byte
	filter map[string]bool // nil = forward all
}

func newWasmEventSink(appID string, filter map[string]bool) *wasmEventSink {
	s := &wasmEventSink{appID: appID, ch: make(chan []byte, 256), filter: filter}
	go s.drainLoop()
	return s
}

func (s *wasmEventSink) drainLoop() {
	rt := wasm.GetRuntime()
	for data := range s.ch {
		rt.PushEvent(s.appID, data)
	}
}

func (s *wasmEventSink) push(msgType string, data interface{}) {
	// If filter is set, only forward subscribed event types
	if s.filter != nil && !s.filter[msgType] {
		return
	}
	b, _ := json.Marshal(wsServerMsg{Type: msgType, Data: data})
	select {
	case s.ch <- b:
	default: // channel 满则丢弃，不阻塞
	}
}

func (s *wasmEventSink) OnDelta(convID, text string) {
	s.push("chat_delta", map[string]string{"conversationId": convID, "content": text})
}
func (s *wasmEventSink) OnThinking(convID, text string) {
	s.push("chat_thinking", map[string]string{"conversationId": convID, "content": text})
}
func (s *wasmEventSink) OnToolCallPending(convID string, pending ai.ToolCallPending) {
	s.push("chat_tool_call_pending", map[string]interface{}{"conversationId": convID, "pending": pending})
}
func (s *wasmEventSink) OnToolCall(convID string, call ai.ToolCall) {
	s.push("chat_tool_call", map[string]interface{}{"conversationId": convID, "toolCall": call})
}
func (s *wasmEventSink) OnToolResult(convID string, result ai.ToolResult) {
	s.push("chat_tool_result", map[string]interface{}{"conversationId": convID, "result": result})
}
func (s *wasmEventSink) OnShellOutput(convID, toolCallID string, output ai.ShellOutput) {
	s.push("chat_shell_output", map[string]interface{}{"conversationId": convID, "toolCallId": toolCallID, "output": output})
}
func (s *wasmEventSink) OnUIAction(convID string, action ai.UIAction) {
	s.push("chat_ui_action", map[string]interface{}{"conversationId": convID, "action": action})
}
func (s *wasmEventSink) OnMediaAttachment(convID string, attachment ai.MediaAttachment) {
	s.push("chat_media", map[string]interface{}{"conversationId": convID, "attachment": attachment})
}
func (s *wasmEventSink) OnDone(convID, fullText string, usage ai.TokenUsage) {
	s.push("chat_done", map[string]interface{}{"conversationId": convID, "fullText": fullText, "usage": usage})
}
func (s *wasmEventSink) OnError(convID string, err error) {
	s.push("chat_error", map[string]interface{}{"conversationId": convID, "error": err.Error()})
}
func (s *wasmEventSink) OnSystemEvent(msgType string, data interface{}) {
	s.push(msgType, data)
}

// fileProxyPost reads a file from storage and uploads it via multipart POST.
// Runs in a goroutine; pushes result back as http_response event.
func fileProxyPost(appID, reqID, targetURL, fileField, nodeID, path, fileName string, fields map[string]string, headers map[string]string) {
	pushErr := func(msg string) {
		log.Printf("[file_proxy_post:%s] ERROR: %s", appID, msg)
		errJSON, _ := json.Marshal(map[string]string{"error": msg})
		evt, _ := json.Marshal(map[string]interface{}{
			"type": "http_response",
			"data": map[string]string{"requestId": reqID, "body": string(errJSON)},
		})
		wasm.GetRuntime().PushEvent(appID, evt)
	}

	// Read file from storage
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		pushErr("storage node not found: " + err.Error())
		return
	}
	fileData, err := driver.Read(path)
	if err != nil {
		pushErr("read file failed: " + err.Error())
		return
	}

	// Build multipart body
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Add text fields first
	for k, v := range fields {
		writer.WriteField(k, v)
	}

	// Add file field
	part, err := writer.CreateFormFile(fileField, fileName)
	if err != nil {
		pushErr("create form file failed: " + err.Error())
		return
	}
	if _, err := part.Write(fileData); err != nil {
		pushErr("write file data failed: " + err.Error())
		return
	}
	writer.Close()

	// Create HTTP request
	req, err := http.NewRequest("POST", targetURL, &buf)
	if err != nil {
		pushErr("create request failed: " + err.Error())
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// Use proxy if configured for this app
	client := &http.Client{Timeout: 300 * time.Second}
	if appID != "" {
		if proxyStr, cfgErr := wasm.GetAppConfig(appID, "proxy"); cfgErr == nil && proxyStr != "" {
			if u, parseErr := url.Parse(proxyStr); parseErr == nil {
				client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
			}
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		pushErr("http request failed: " + err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))

	log.Printf("[file_proxy_post:%s] upload done, status=%d, file=%s (%d bytes)", appID, resp.StatusCode, fileName, len(fileData))

	// Push response back to WASM
	evt, _ := json.Marshal(map[string]interface{}{
		"type": "http_response",
		"data": map[string]string{"requestId": reqID, "body": string(respBody)},
	})
	wasm.GetRuntime().PushEvent(appID, evt)
}
