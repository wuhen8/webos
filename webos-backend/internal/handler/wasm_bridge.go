package handler

import (
	"encoding/json"

	"webos-backend/internal/ai"
	"webos-backend/internal/wasm"
)

// InitWasmBridge connects wasm to shared event sinks and unified capability deps.
// Must be called after InitAI().
func InitWasmBridge() {
	wasm.ConfigureCapabilityDeps(
		func() interface{} { return chatSvc.Commands() },
		func(conversationID, messageContent, clientID string) interface{} {
			return chatSvc.SendMessage(conversationID, messageContent, clientID)
		},
		func() (interface{}, error) { return chatSvc.ListConversations() },
		func(conversationID string) (interface{}, error) { return chatSvc.GetMessages(conversationID) },
		func(conversationID string) interface{} { return chatSvc.GetStatus(conversationID) },
		func() interface{} { return chatSvc.ExecutorStatus() },
		func(conversationID string) error { return chatSvc.DeleteConversation(conversationID) },
		func() { chatSvc.Cleanup() },
		func(payload json.RawMessage) (interface{}, error) {
			var cc ai.ClientContext
			if err := json.Unmarshal(payload, &cc); err != nil {
				return nil, err
			}
			if cc.ID == "" {
				return nil, errClientContextIDRequired
			}
			ai.RegisterClientContext(&cc)
			return map[string]string{"ok": "registered", "id": cc.ID}, nil
		},
		doBroadcastNotify,
		func(command string) (string, string, int, error) { return systemSvc.Exec(command) },
	)

	rt := wasm.GetRuntime()
	rt.OnProcStart = RegisterWasmSink
	rt.OnProcStop = UnregisterWasmSink
}

var errClientContextIDRequired = &wasmBridgeError{"client context id is required"}

type wasmBridgeError struct{ msg string }

func (e *wasmBridgeError) Error() string { return e.msg }

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
type wasmEventSink struct {
	appID  string
	ch     chan []byte
	filter map[string]bool
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
	if s.filter != nil && !s.filter[msgType] {
		return
	}
	b, _ := json.Marshal(wsServerMsg{Type: msgType, Data: data})
	select {
	case s.ch <- b:
	default:
	}
}

func (s *wasmEventSink) OnDelta(convID, text string) {
	s.push("chat.delta", map[string]string{"conversationId": convID, "content": text})
}
func (s *wasmEventSink) OnThinking(convID, text string) {
	s.push("chat.thinking", map[string]string{"conversationId": convID, "content": text})
}
func (s *wasmEventSink) OnToolCallPending(convID string, pending ai.ToolCallPending) {
	s.push("chat.tool_call_pending", map[string]interface{}{"conversationId": convID, "pending": pending})
}
func (s *wasmEventSink) OnToolCall(convID string, call ai.ToolCall) {
	s.push("chat.tool_call", map[string]interface{}{"conversationId": convID, "toolCall": call})
}
func (s *wasmEventSink) OnToolResult(convID string, result ai.ToolResult) {
	s.push("chat.tool_result", map[string]interface{}{"conversationId": convID, "result": result})
}
func (s *wasmEventSink) OnShellOutput(convID, toolCallID string, output ai.ShellOutput) {
	s.push("chat.shell_output", map[string]interface{}{"conversationId": convID, "toolCallId": toolCallID, "output": output})
}
func (s *wasmEventSink) OnUIAction(convID string, action ai.UIAction) {
	s.push("chat.ui_action", map[string]interface{}{"conversationId": convID, "action": action})
}
func (s *wasmEventSink) OnMediaAttachment(convID string, attachment ai.MediaAttachment) {
	s.push("chat.media", map[string]interface{}{"conversationId": convID, "attachment": attachment})
}
func (s *wasmEventSink) OnDone(convID, fullText string, usage ai.TokenUsage) {
	s.push("chat.done", map[string]interface{}{"conversationId": convID, "fullText": fullText, "usage": usage})
}
func (s *wasmEventSink) OnError(convID string, err error) {
	s.push("chat.error", map[string]interface{}{"conversationId": convID, "error": err.Error()})
}
func (s *wasmEventSink) OnSystemEvent(msgType string, data interface{}) {
	s.push(msgType, data)
}
