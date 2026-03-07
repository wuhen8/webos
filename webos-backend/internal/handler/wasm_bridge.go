package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
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

	// HTTP request with file support — WASM apps can make HTTP requests with automatic file handling.
// Body can contain "[file:nodeId:path]" markers which are replaced based on format:
// - Default (JSON): replaced with base64-encoded file content
// - Multipart: replaced with binary file data in multipart/form-data
// Returns {"requestId":"req_xxx"} immediately; result arrives as http_response event.
wasm.RegisterSyncHandler("http_request", func(payload json.RawMessage) ([]byte, error) {
	var p struct {
		AppID     string                 `json:"appId"`
		Method    string                 `json:"method"`
		URL       string                 `json:"url"`
		Headers   map[string]string      `json:"headers"`
		Body      map[string]interface{} `json:"body"`
		Format    string                 `json:"format"`    // "json" (default) or "multipart"
		FileField string                 `json:"fileField"` // for multipart: the field name for file
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return json.Marshal(map[string]string{"error": err.Error()})
	}
	if p.URL == "" {
		return json.Marshal(map[string]string{"error": "url is required"})
	}
	if p.Method == "" {
		p.Method = "POST"
	}
	if p.Format == "" {
		p.Format = "json"
	}

	reqID := fmt.Sprintf("hr_%d", time.Now().UnixNano())

	go httpRequestWithFiles(p.AppID, reqID, p.Method, p.URL, p.Headers, p.Body, p.Format, p.FileField)

	return json.Marshal(map[string]string{"requestId": reqID})
})

	// System notification broadcast — any WASM app can send notifications to all clients.
	wasm.RegisterSyncHandler("broadcast_notify", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			Level   string `json:"level"`   // info / warning / error / success
			Title   string `json:"title"`
			Message string `json:"message"`
			Source  string `json:"source"`  // who sent it, e.g. "telegram-ai-bot"
			Target  string `json:"target"`  // optional: specific sink ID, empty = broadcast all
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		if p.Message == "" {
			return json.Marshal(map[string]string{"error": "message is required"})
		}
		if p.Level == "" {
			p.Level = "info"
		}
		doBroadcastNotify(p.Level, p.Title, p.Message, p.Source, p.Target)
		return json.Marshal(map[string]string{"ok": "broadcast"})
	})

	// Shell execution — WASM apps can run shell commands on the host.
	wasm.RegisterSyncHandler("shell_exec", func(payload json.RawMessage) ([]byte, error) {
		var p struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return json.Marshal(map[string]string{"error": err.Error()})
		}
		if p.Command == "" {
			return json.Marshal(map[string]string{"error": "command is required"})
		}
		stdout, stderr, exitCode, err := systemSvc.Exec(p.Command)
		if err != nil {
			return json.Marshal(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
				"stdout":  stdout,
				"stderr":  stderr,
				"exitCode": exitCode,
			})
		}
		return json.Marshal(map[string]interface{}{
			"success":  exitCode == 0,
			"stdout":   stdout,
			"stderr":   stderr,
			"exitCode": exitCode,
		})
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
	sysCtx.Subscribe(appID, sink)
}

// UnregisterWasmSink removes the event sink for a wasm app.
func UnregisterWasmSink(appID string) {
	sysCtx := chatSvc.GetSystemContext()
	sysCtx.Unsubscribe(appID)
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

// httpRequestWithFiles makes HTTP requests with automatic file handling.
// Body values matching "[file:nodeId:path]" are replaced based on format:
// - JSON (default): replaced with base64-encoded file content
// - Multipart: replaced with binary file data in multipart/form-data
func httpRequestWithFiles(appID, reqID, method, targetURL string, headers map[string]string, body map[string]interface{}, format, fileField string) {
	pushErr := func(msg string) {
		log.Printf("[http_request:%s] ERROR: %s", appID, msg)
		errJSON, _ := json.Marshal(map[string]string{"error": msg})
		evt, _ := json.Marshal(map[string]interface{}{
			"type": "http_response",
			"data": map[string]string{"requestId": reqID, "body": string(errJSON)},
		})
		wasm.GetRuntime().PushEvent(appID, evt)
	}

	// 收集需要处理的文件标记
	type fileMarker struct {
		key      string
		nodeID   string
		filePath string
	}
	var fileMarkers []fileMarker

	if body != nil {
		for key, value := range body {
			if str, ok := value.(string); ok {
				// 检测 [file:nodeId:path] 标记
				if strings.HasPrefix(str, "[file:") && strings.HasSuffix(str, "]") {
					inner := str[6 : len(str)-1] // 去掉 "[file:" 和 "]"
					fileParts := strings.SplitN(inner, ":", 2)
					if len(fileParts) == 2 {
						fileMarkers = append(fileMarkers, fileMarker{key, fileParts[0], fileParts[1]})
					}
				}
			}
		}
	}

	var reqBody []byte
	var contentType string

	if format == "multipart" {
		// === Multipart 模式 ===
		if len(fileMarkers) == 0 {
			pushErr("multipart format requires at least one [file:nodeId:path] marker")
			return
		}

		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)

		// 先添加普通字段
		for key, value := range body {
			if str, ok := value.(string); ok {
				// 跳过文件标记
				if strings.HasPrefix(str, "[file:") {
					continue
				}
				writer.WriteField(key, str)
			} else if num, ok := value.(float64); ok {
				writer.WriteField(key, fmt.Sprintf("%.0f", num))
			} else if bl, ok := value.(bool); ok {
				writer.WriteField(key, fmt.Sprintf("%v", bl))
			}
		}

		// 添加文件字段
		for _, marker := range fileMarkers {
			driver, err := storage.GetDriver(marker.nodeID)
			if err != nil {
				pushErr("storage node not found: " + err.Error())
				return
			}
			fileData, err := driver.Read(marker.filePath)
			if err != nil {
				pushErr("read file failed: " + err.Error())
				return
			}

			// 从路径提取文件名
			fileName := filepath.Base(marker.filePath)
			fieldName := fileField
			if fieldName == "" {
				fieldName = marker.key
			}

			part, err := writer.CreateFormFile(fieldName, fileName)
			if err != nil {
				pushErr("create form file failed: " + err.Error())
				return
			}
			if _, err := part.Write(fileData); err != nil {
				pushErr("write file data failed: " + err.Error())
				return
			}
			log.Printf("[http_request:%s] multipart file: field=%s, name=%s, size=%d", appID, fieldName, fileName, len(fileData))
		}

		writer.Close()
		reqBody = buf.Bytes()
		contentType = writer.FormDataContentType()

	} else {
		// === JSON 模式（默认）===
		// 处理 body 中的文件标记，替换为 base64
		for _, marker := range fileMarkers {
			driver, err := storage.GetDriver(marker.nodeID)
			if err != nil {
				pushErr("storage node not found: " + err.Error())
				return
			}
			fileData, err := driver.Read(marker.filePath)
			if err != nil {
				pushErr("read file failed: " + err.Error())
				return
			}

			body[marker.key] = base64.StdEncoding.EncodeToString(fileData)
			log.Printf("[http_request:%s] json base64 file: key=%s, size=%d", appID, marker.key, len(fileData))
		}

		// 序列化 body
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			pushErr("marshal body failed: " + err.Error())
			return
		}
		contentType = "application/json"
	}

	// 创建请求
	req, err := http.NewRequest(method, targetURL, bytes.NewReader(reqBody))
	if err != nil {
		pushErr("create request failed: " + err.Error())
		return
	}

	// 设置 headers
	req.Header.Set("Content-Type", contentType)
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// 使用代理（如果配置了）
	client := &http.Client{Timeout: 300 * time.Second}
	if appID != "" {
		if proxyStr, cfgErr := wasm.GetAppConfig(appID, "proxy"); cfgErr == nil && proxyStr != "" {
			if u, parseErr := url.Parse(proxyStr); parseErr == nil {
				client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
			}
		}
	}

	// 发送请求
	resp, err := client.Do(req)
	if err != nil {
		pushErr("http request failed: " + err.Error())
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	log.Printf("[http_request:%s] %s %s -> status=%d, body_len=%d", appID, method, targetURL, resp.StatusCode, len(respBody))

	// 推送响应
	evt, _ := json.Marshal(map[string]interface{}{
		"type": "http_response",
		"data": map[string]string{"requestId": reqID, "body": string(respBody)},
	})
	wasm.GetRuntime().PushEvent(appID, evt)
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
