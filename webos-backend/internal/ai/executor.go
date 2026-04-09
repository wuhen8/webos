package ai

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// BroadcastSink implements ChatSink and forwards events to all registered sub-sinks.
type BroadcastSink struct {
	mu    sync.RWMutex
	sinks map[string]ChatSink
}

// NewBroadcastSink creates a new BroadcastSink.
func NewBroadcastSink() *BroadcastSink {
	return &BroadcastSink{
		sinks: make(map[string]ChatSink),
	}
}

// Add registers a sub-sink with the given ID.
func (b *BroadcastSink) Add(id string, sink ChatSink) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.sinks[id] = sink
}

// Remove unregisters the sub-sink with the given ID.
func (b *BroadcastSink) Remove(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.sinks, id)
}

// snapshot returns a copy of the current sinks map (caller must NOT hold lock).
func (b *BroadcastSink) snapshot() map[string]ChatSink {
	b.mu.RLock()
	cp := make(map[string]ChatSink, len(b.sinks))
	for k, v := range b.sinks {
		cp[k] = v
	}
	b.mu.RUnlock()
	return cp
}

// broadcast calls fn for each registered sink, recovering from panics and removing failed sinks.
func (b *BroadcastSink) broadcast(fn func(id string, sink ChatSink)) {
	for id, sink := range b.snapshot() {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[BroadcastSink] sink %s panicked: %v, removing", id, r)
					b.Remove(id)
				}
			}()
			fn(id, sink)
		}()
	}
}

func (b *BroadcastSink) sendTo(id string, fn func(ChatSink)) bool {
	b.mu.RLock()
	sink, ok := b.sinks[id]
	b.mu.RUnlock()
	if !ok {
		prefix := id + "#"
		matched := false
		for sinkID, sub := range b.snapshot() {
			if !strings.HasPrefix(sinkID, prefix) {
				continue
			}
			matched = true
			func(targetID string, target ChatSink) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[BroadcastSink] sink %s panicked: %v, removing", targetID, r)
						b.Remove(targetID)
					}
				}()
				fn(target)
			}(sinkID, sub)
		}
		return matched
	}
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[BroadcastSink] sink %s panicked: %v, removing", id, r)
			b.Remove(id)
		}
	}()
	fn(sink)
	return true
}

func (b *BroadcastSink) OnDelta(conversationID, text string) {
	b.broadcast(func(_ string, s ChatSink) { s.OnDelta(conversationID, text) })
}

func (b *BroadcastSink) OnThinking(conversationID, text string) {
	b.broadcast(func(_ string, s ChatSink) { s.OnThinking(conversationID, text) })
}

func (b *BroadcastSink) OnToolCallPending(conversationID string, pending ToolCallPending) {
	b.broadcast(func(_ string, s ChatSink) { s.OnToolCallPending(conversationID, pending) })
}

func (b *BroadcastSink) OnToolCall(conversationID string, call ToolCall) {
	b.broadcast(func(_ string, s ChatSink) { s.OnToolCall(conversationID, call) })
}

func (b *BroadcastSink) OnToolResult(conversationID string, result ToolResult) {
	b.broadcast(func(_ string, s ChatSink) { s.OnToolResult(conversationID, result) })
}

func (b *BroadcastSink) OnShellOutput(conversationID string, toolCallID string, output ShellOutput) {
	b.broadcast(func(_ string, s ChatSink) { s.OnShellOutput(conversationID, toolCallID, output) })
}

func (b *BroadcastSink) OnUIAction(conversationID string, action UIAction) {
	b.broadcast(func(_ string, s ChatSink) { s.OnUIAction(conversationID, action) })
}

func (b *BroadcastSink) OnMediaAttachment(conversationID string, attachment MediaAttachment) {
	b.broadcast(func(_ string, s ChatSink) { s.OnMediaAttachment(conversationID, attachment) })
}

func (b *BroadcastSink) OnDone(conversationID string, fullText string, usage TokenUsage) {
	b.broadcast(func(_ string, s ChatSink) { s.OnDone(conversationID, fullText, usage) })
}

func (b *BroadcastSink) OnError(conversationID string, err error) {
	b.broadcast(func(_ string, s ChatSink) { s.OnError(conversationID, err) })
}

func (b *BroadcastSink) OnSystemEvent(msgType string, data interface{}) {
	b.broadcast(func(_ string, s ChatSink) { s.OnSystemEvent(msgType, data) })
}

// SendToSystemEvent sends a system event to a specific sink by ID. Returns false if not found.
func (b *BroadcastSink) SendToSystemEvent(sinkID, msgType string, data interface{}) bool {
	return b.sendTo(sinkID, func(s ChatSink) { s.OnSystemEvent(msgType, data) })
}

// SinkIDs returns all registered sink IDs.
func (b *BroadcastSink) SinkIDs() []string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	ids := make([]string, 0, len(b.sinks))
	for id := range b.sinks {
		ids = append(ids, id)
	}
	return ids
}

// ---------------------------------------------------------------------------
// AIExecutor
// ---------------------------------------------------------------------------

// EnqueueResult represents the result of an enqueue operation.
type EnqueueResult struct {
	Accepted       bool   `json:"accepted"`
	Reason         string `json:"reason,omitempty"`
	ConversationID string `json:"conversationId,omitempty"`
}

// ExecutorStatus represents the current state of the executor.
type ExecutorStatus struct {
	State            string `json:"state"`            // "idle", "running", or "tool_executing"
	RunningConvID    string `json:"runningConvId"`    // only reliable when exactly one conversation is active
	RunningConvTitle string `json:"runningConvTitle"` // title of the running conversation
	QueueSize        int    `json:"queueSize"`        // number of queued messages
}

type conversationState struct {
	workerRunning bool
	running       bool
	streaming     bool
	cancelFn      context.CancelFunc
}

// AIExecutor manages the persisted queue and broadcast sink.
// Messages within a conversation are processed serially, while different
// conversations may run concurrently.
type AIExecutor struct {
	service       *Service
	notify        chan struct{}
	broadcastSink *BroadcastSink
	handleChatFn  func(context.Context, string, string, string, string, string, ChatSink)

	mu            sync.Mutex
	conversations map[string]*conversationState
}

// NewAIExecutor creates a new AIExecutor. Call Start() to begin consuming.
// Must be called after database.Init() — it reads persisted state from DB.
func NewAIExecutor(svc *Service) *AIExecutor {
	ex := &AIExecutor{
		service:       svc,
		notify:        make(chan struct{}, 1),
		broadcastSink: NewBroadcastSink(),
		handleChatFn:  svc.HandleChat,
		conversations: make(map[string]*conversationState),
	}
	if err := database.ResetProcessingAIQueue(); err != nil {
		log.Printf("[AIExecutor] failed to reset processing queue items: %v", err)
	}
	return ex
}

// Enqueue persists a message to the database queue and wakes scheduling.
// clientID identifies the caller — used for both ClientContext lookup (DB) and sink routing.
func (e *AIExecutor) Enqueue(convID, content, clientID, providerID, model string) EnqueueResult {
	if cmdName, cmdArgs, isCmd := ParseCommand(content); isCmd {
		go e.executeCommand(convID, cmdName, cmdArgs, clientID)
		return EnqueueResult{Accepted: true, ConversationID: convID}
	}

	if _, err := database.EnqueueAIMessage(convID, content, clientID, providerID, model); err != nil {
		log.Printf("[AIExecutor] failed to enqueue message: %v", err)
		return EnqueueResult{Accepted: false, Reason: "enqueue_failed", ConversationID: convID}
	}

	e.wakeScheduler()
	return EnqueueResult{Accepted: true, ConversationID: convID}
}

// IsStreaming returns true if any conversation is currently streaming an LLM response.
func (e *AIExecutor) IsStreaming() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, state := range e.conversations {
		if state.streaming {
			return true
		}
	}
	return false
}

// SetStreaming updates the streaming state for a specific conversation.
func (e *AIExecutor) SetStreaming(convID string, v bool) {
	if convID == "" {
		return
	}
	e.mu.Lock()
	state := e.ensureConversationStateLocked(convID)
	state.streaming = v
	e.mu.Unlock()
	e.broadcastStatus()
}

// Stop cancels all currently running conversations.
func (e *AIExecutor) Stop() {
	e.mu.Lock()
	cancels := make([]context.CancelFunc, 0, len(e.conversations))
	for _, state := range e.conversations {
		if state.cancelFn != nil {
			cancels = append(cancels, state.cancelFn)
			state.cancelFn = nil
			state.streaming = false
		}
	}
	e.mu.Unlock()

	for _, cancel := range cancels {
		cancel()
	}
	e.broadcastStatus()
}

// StopConversation cancels the currently running task only when it belongs to the target conversation.
func (e *AIExecutor) StopConversation(convID string) bool {
	if convID == "" {
		return false
	}
	e.mu.Lock()
	state, ok := e.conversations[convID]
	if !ok || state.cancelFn == nil {
		e.mu.Unlock()
		return false
	}
	fn := state.cancelFn
	state.cancelFn = nil
	state.streaming = false
	e.mu.Unlock()

	fn()
	e.broadcastStatus()
	return true
}

// IsConversationRunning reports whether the executor is currently executing the target conversation.
func (e *AIExecutor) IsConversationRunning(convID string) bool {
	if convID == "" {
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	state, ok := e.conversations[convID]
	return ok && state.running
}

// Status returns the current executor status summary.
func (e *AIExecutor) Status() ExecutorStatus {
	e.mu.Lock()
	defer e.mu.Unlock()

	activeCount := 0
	streamingCount := 0
	singleRunningConvID := ""
	for convID, state := range e.conversations {
		if !state.running {
			continue
		}
		activeCount++
		singleRunningConvID = convID
		if state.streaming {
			streamingCount++
		}
	}

	status := ExecutorStatus{QueueSize: database.PendingAIQueueCount()}
	if activeCount == 0 {
		status.State = "idle"
		return status
	}
	if streamingCount > 0 {
		status.State = "running"
	} else {
		status.State = "tool_executing"
	}
	if activeCount == 1 {
		status.RunningConvID = singleRunningConvID
		status.RunningConvTitle = getConvTitle(singleRunningConvID)
	}
	return status
}

// BroadcastSink returns the executor's broadcast sink for event subscription.
func (e *AIExecutor) GetBroadcastSink() *BroadcastSink {
	return e.broadcastSink
}

// RegisterSink registers a ChatSink for broadcast.
func (e *AIExecutor) RegisterSink(id string, sink ChatSink) {
	e.broadcastSink.Add(id, sink)
}

// UnregisterSink removes a ChatSink from broadcast.
func (e *AIExecutor) UnregisterSink(id string) {
	e.broadcastSink.Remove(id)
}

func (e *AIExecutor) ensureConversationStateLocked(convID string) *conversationState {
	state, ok := e.conversations[convID]
	if !ok {
		state = &conversationState{}
		e.conversations[convID] = state
	}
	return state
}

func (e *AIExecutor) markWorkerRunning(convID string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	state := e.ensureConversationStateLocked(convID)
	if state.workerRunning {
		return false
	}
	state.workerRunning = true
	return true
}

func (e *AIExecutor) clearWorkerRunning(convID string) {
	e.mu.Lock()
	if state, ok := e.conversations[convID]; ok {
		state.workerRunning = false
	}
	e.mu.Unlock()
}

func (e *AIExecutor) setConversationRunning(convID string, cancel context.CancelFunc) {
	e.mu.Lock()
	state := e.ensureConversationStateLocked(convID)
	state.running = true
	state.streaming = false
	state.cancelFn = cancel
	e.mu.Unlock()
}

func (e *AIExecutor) clearConversationRunning(convID string) {
	e.mu.Lock()
	if state, ok := e.conversations[convID]; ok {
		state.running = false
		state.streaming = false
		state.cancelFn = nil
	}
	e.mu.Unlock()
}

func (e *AIExecutor) wakeScheduler() {
	select {
	case e.notify <- struct{}{}:
	default:
	}
}

// getConvTitle fetches the conversation title from the database.
func getConvTitle(convID string) string {
	if convID == "" {
		return ""
	}
	convs, err := database.ListConversations()
	if err != nil {
		return convID
	}
	for _, c := range convs {
		if c.ID == convID {
			return c.Title
		}
	}
	return convID
}

// Start launches the scheduler that assigns work to per-conversation workers.
func (e *AIExecutor) Start() {
	go e.consumeLoop()
}

func (e *AIExecutor) consumeLoop() {
	e.schedulePending()
	for range e.notify {
		e.schedulePending()
	}
}

func (e *AIExecutor) schedulePending() {
	rows, err := database.ListPendingAIQueue()
	if err != nil {
		log.Printf("[AIExecutor] list pending queue error: %v", err)
		return
	}
	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if row.ConvID == "" {
			continue
		}
		if _, ok := seen[row.ConvID]; ok {
			continue
		}
		seen[row.ConvID] = struct{}{}
		if e.markWorkerRunning(row.ConvID) {
			go e.drainConversation(row.ConvID)
		}
	}
}

func (e *AIExecutor) drainConversation(convID string) {
	defer func() {
		e.clearWorkerRunning(convID)
		e.wakeScheduler()
	}()

	for {
		row, err := database.DequeueAIMessageByConversation(convID)
		if err != nil {
			log.Printf("[AIExecutor] dequeue error conv=%s: %v", convID, err)
			return
		}
		if row == nil {
			return
		}
		e.processMessage(row)
	}
}

func (e *AIExecutor) processMessage(row *database.AIQueueRow) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	e.setConversationRunning(row.ConvID, cancel)
	e.broadcastStatus()

	defer func() {
		if r := recover(); r != nil {
			log.Printf("[AIExecutor] HandleChat panicked: %v", r)
			e.broadcastSink.OnError(row.ConvID, fmt.Errorf("AI 执行异常: %v", r))
		}
		if err := database.CompleteAIQueueItem(row.ID); err != nil {
			log.Printf("[AIExecutor] failed to complete queue item %d: %v", row.ID, err)
		}
		cancel()
		e.clearConversationRunning(row.ConvID)
		e.broadcastStatus()
	}()

	sink := ChatSink(e.broadcastSink)
	if row.ClientID != "" {
		sink = &targetedChatSink{sinkID: row.ClientID, sink: e.broadcastSink}
	}
	e.handleChatFn(ctx, row.ConvID, row.Content, row.ClientID, row.ProviderID, row.Model, sink)
}

// executeCommand runs a slash command in an independent goroutine (never queued).
// sinkID is the connection-level ID for directed routing.
// - non-empty: send to that sink only; silently discard if the sink is gone (don't spam others)
// - empty: broadcast to all (only used by system-internal calls)
func (e *AIExecutor) executeCommand(convID, cmdName, cmdArgs, sinkID string) {
	sendToClient := func(msgType string, data interface{}) {
		if sinkID != "" {
			e.broadcastSink.SendToSystemEvent(sinkID, msgType, data)
		} else {
			e.broadcastSink.OnSystemEvent(msgType, data)
		}
	}

	sendToClient("chat.command_progress", map[string]interface{}{
		"command": cmdName, "state": "running",
	})

	ce := service.GetCommandExecutor()
	result := ce.ExecuteCommandForClient(convID, cmdName, cmdArgs, sinkID)

	sendToClient("chat.command_progress", map[string]interface{}{
		"command": cmdName, "state": "done",
	})

	ce.HandleCommandResult(convID, result)

	sendToClient("chat.command_result", map[string]interface{}{
		"conversationId":       convID,
		"command":              cmdName,
		"text":                 result.Text,
		"isError":              result.IsError,
		"clearHistory":         result.ClearHistory,
		"targetConversationId": result.ConversationID,
		"conversationAction":   result.ConversationAction,
		"switchConversation":   result.SwitchConversation,
		"routePolicy":          result.RoutePolicy,
		"ownerClientId":        result.OwnerClientID,
	})
}

type targetedChatSink struct {
	sinkID string
	sink   *BroadcastSink
}

func (t *targetedChatSink) OnDelta(conversationID, text string) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnDelta(conversationID, text) })
}

func (t *targetedChatSink) OnThinking(conversationID, text string) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnThinking(conversationID, text) })
}

func (t *targetedChatSink) OnToolCallPending(conversationID string, pending ToolCallPending) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnToolCallPending(conversationID, pending) })
}

func (t *targetedChatSink) OnToolCall(conversationID string, call ToolCall) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnToolCall(conversationID, call) })
}

func (t *targetedChatSink) OnToolResult(conversationID string, result ToolResult) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnToolResult(conversationID, result) })
}

func (t *targetedChatSink) OnShellOutput(conversationID, toolCallID string, output ShellOutput) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnShellOutput(conversationID, toolCallID, output) })
}

func (t *targetedChatSink) OnUIAction(conversationID string, action UIAction) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnUIAction(conversationID, action) })
}

func (t *targetedChatSink) OnMediaAttachment(conversationID string, attachment MediaAttachment) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnMediaAttachment(conversationID, attachment) })
}

func (t *targetedChatSink) OnDone(conversationID, fullText string, usage TokenUsage) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnDone(conversationID, fullText, usage) })
}

func (t *targetedChatSink) OnError(conversationID string, err error) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnError(conversationID, err) })
}

func (t *targetedChatSink) OnSystemEvent(msgType string, data interface{}) {
	t.sink.sendTo(t.sinkID, func(s ChatSink) { s.OnSystemEvent(msgType, data) })
}

// broadcastStatus sends a chat.status_update event to all sinks.
func (e *AIExecutor) broadcastStatus() {
	status := e.Status()
	e.broadcastSink.OnSystemEvent("chat.status_update", status)
}
