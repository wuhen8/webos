package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"webos-backend/internal/database"
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
	b.mu.RLock()
	sink, ok := b.sinks[sinkID]
	b.mu.RUnlock()
	if !ok {
		return false
	}
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[BroadcastSink] sink %s panicked: %v, removing", sinkID, r)
			b.Remove(sinkID)
		}
	}()
	sink.OnSystemEvent(msgType, data)
	return true
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

// EnqueueMsg represents a message to be processed by the executor.
type EnqueueMsg struct {
	ConvID  string
	Content string
}
// executeCommand runs a slash command in an independent goroutine (never queued).
// Results are broadcast to all sinks (WebSocket, WASM, etc.).
func (e *AIExecutor) executeCommand(convID, cmdName, cmdArgs, clientID string) {
	sendToClient := func(msgType string, data interface{}) {
		if clientID == "" || !e.broadcastSink.SendToSystemEvent(clientID, msgType, data) {
			e.broadcastSink.OnSystemEvent(msgType, data)
		}
	}

	sendToClient("chat_command_progress", map[string]interface{}{
		"command": cmdName, "state": "running",
	})

	result := e.service.ExecuteCommand(convID, cmdName, cmdArgs)

	sendToClient("chat_command_progress", map[string]interface{}{
		"command": cmdName, "state": "done",
	})

	e.service.HandleCommandResult(convID, result)

	sendToClient("chat_command_result", map[string]interface{}{
		"conversationId": convID,
		"command":        cmdName,
		"text":           result.Text,
		"isError":        result.IsError,
		"clearHistory":   result.ClearHistory,
	})
}

// EnqueueResult represents the result of an enqueue operation.
type EnqueueResult struct {
	Accepted        bool   `json:"accepted"`
	Reason          string `json:"reason,omitempty"`
	ActiveConvID    string `json:"activeConvId,omitempty"`
	ActiveConvTitle string `json:"activeConvTitle,omitempty"`
}

// ExecutorStatus represents the current state of the executor.
type ExecutorStatus struct {
	State           string `json:"state"`           // "idle", "running", or "tool_executing"
	RunningConvID   string `json:"runningConvId"`   // conversation currently being executed (empty when idle)
	RunningConvTitle string `json:"runningConvTitle"` // title of the running conversation
	QueueSize       int    `json:"queueSize"`       // number of queued messages
	ActiveConvID    string `json:"activeConvId"`    // the active (selected) conversation ID
}

// AIExecutor manages the message queue, broadcast sink, and active conversation.
// The queue is persisted to the database so messages survive restarts.
// "Busy" means the AI is streaming an API response; tool execution does NOT count as busy.
type AIExecutor struct {
	service       *Service
	notify        chan struct{} // signals that new work is available
	broadcastSink *BroadcastSink

	mu            sync.Mutex
	activeConvID  string             // cached in memory, persisted to DB
	runningConvID string             // conversation currently being executed
	streaming     bool               // true only while LLM API is streaming
	cancelFn      context.CancelFunc // cancel function for current execution
}

const (
	prefKeyActiveConvID = "active_conv_id"
)

// NewAIExecutor creates a new AIExecutor. Call Start() to begin consuming.
// Must be called after database.Init() — it reads persisted state from DB.
func NewAIExecutor(svc *Service) *AIExecutor {
	ex := &AIExecutor{
		service:       svc,
		notify:        make(chan struct{}, 1),
		broadcastSink: NewBroadcastSink(),
		activeConvID:  loadActiveConvID(),
	}
	if err := database.ResetProcessingAIQueue(); err != nil {
		log.Printf("[AIExecutor] failed to reset processing queue items: %v", err)
	}
	return ex
}

// loadActiveConvID reads the persisted active conversation ID from the database.
func loadActiveConvID() string {
	val, err := database.GetPreference(prefKeyActiveConvID)
	if err != nil || val == "" {
		return ""
	}
	var id string
	if err := json.Unmarshal([]byte(val), &id); err != nil {
		return val
	}
	return id
}

// Enqueue persists a message to the database queue and wakes the consumer.
// Only accepts messages for the active conversation. Empty convID means "use active".
// Returns rejection info if convID doesn't match the active conversation.
func (e *AIExecutor) Enqueue(convID, content, clientID string) EnqueueResult {
	e.mu.Lock()
	active := e.activeConvID
	e.mu.Unlock()

	// Empty convID → use active conversation (or create new if none)
	if convID == "" {
		if active == "" {
			// No active conversation — will be created by HandleChat
			convID = ""
		} else {
			convID = active
		}
	} else if active != "" && convID != active {
		// Non-active conversation — reject
		return EnqueueResult{
			Accepted:        false,
			Reason:          "inactive_conv",
			ActiveConvID:    active,
			ActiveConvTitle: getConvTitle(active),
		}
	}

	// Slash commands bypass the queue — independent goroutine ensures /stop /restart always work
	if cmdName, cmdArgs, isCmd := ParseCommand(content); isCmd {
		go e.executeCommand(convID, cmdName, cmdArgs, clientID)
		return EnqueueResult{Accepted: true}
	}

	if _, err := database.EnqueueAIMessage(convID, content, clientID); err != nil {
		log.Printf("[AIExecutor] failed to enqueue message: %v", err)
		return EnqueueResult{Accepted: false, Reason: "enqueue_failed"}
	}

	// Wake consumer
	select {
	case e.notify <- struct{}{}:
	default:
	}

	return EnqueueResult{Accepted: true}
}

// IsStreaming returns true if the executor is currently streaming an LLM API response.
// Tool execution does NOT count as streaming/busy.
func (e *AIExecutor) IsStreaming() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.streaming
}

// SetStreaming updates the streaming state. Called by Service.HandleChat.
func (e *AIExecutor) SetStreaming(v bool) {
	e.mu.Lock()
	e.streaming = v
	e.mu.Unlock()
	e.broadcastStatus()
}

// Stop cancels the currently running task.
func (e *AIExecutor) Stop() {
	e.mu.Lock()
	fn := e.cancelFn
	e.cancelFn = nil
	e.runningConvID = ""
	e.streaming = false
	e.mu.Unlock()

	if fn != nil {
		fn()
	}
	e.broadcastStatus()
}

// Status returns the current executor status.
func (e *AIExecutor) Status() ExecutorStatus {
	e.mu.Lock()
	defer e.mu.Unlock()
	state := "idle"
	if e.runningConvID != "" {
		if e.streaming {
			state = "running"
		} else {
			state = "tool_executing"
		}
	}
	return ExecutorStatus{
		State:            state,
		RunningConvID:    e.runningConvID,
		RunningConvTitle: getConvTitle(e.runningConvID),
		QueueSize:        database.PendingAIQueueCount(),
		ActiveConvID:     e.activeConvID,
	}
}

// GetActiveConvID returns the current active conversation ID.
func (e *AIExecutor) GetActiveConvID() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.activeConvID
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

// SwitchConvResult represents the result of a conversation switch attempt.
type SwitchConvResult struct {
	OK              bool
	Reason          string // "running" if executor is busy
	RunningConvID   string
	RunningConvTitle string
}

// SwitchConv updates the active conversation and broadcasts conv_switched.
// Rejects if the executor is currently running a different conversation.
func (e *AIExecutor) SwitchConv(convID string) SwitchConvResult {
	e.mu.Lock()
	if e.runningConvID != "" && e.runningConvID != convID {
		running := e.runningConvID
		e.mu.Unlock()
		return SwitchConvResult{
			OK:               false,
			Reason:           "running",
			RunningConvID:    running,
			RunningConvTitle: getConvTitle(running),
		}
	}
	e.activeConvID = convID
	e.mu.Unlock()

	if err := database.SetPreference(prefKeyActiveConvID, convID); err != nil {
		log.Printf("[AIExecutor] failed to persist activeConvID: %v", err)
	}
	e.broadcastConvSwitched(convID)
	return SwitchConvResult{OK: true}
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

// Start launches the consumer goroutine that processes queued messages.
func (e *AIExecutor) Start() {
	go e.consumeLoop()
}

func (e *AIExecutor) consumeLoop() {
	// Process any messages left over from before restart
	e.drainQueue()

	for range e.notify {
		e.drainQueue()
	}
}

// drainQueue processes all pending messages in the DB queue sequentially.
func (e *AIExecutor) drainQueue() {
	for {
		row, err := database.DequeueAIMessage()
		if err != nil {
			log.Printf("[AIExecutor] dequeue error: %v", err)
			return
		}
		if row == nil {
			return // queue empty
		}
		e.processMessage(row)
	}
}

func (e *AIExecutor) processMessage(row *database.AIQueueRow) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[AIExecutor] HandleChat panicked: %v", r)
			e.broadcastSink.OnError(row.ConvID, fmt.Errorf("AI 执行异常: %v", r))
		}
		// Mark completed
		if err := database.CompleteAIQueueItem(row.ID); err != nil {
			log.Printf("[AIExecutor] failed to complete queue item %d: %v", row.ID, err)
		}
		// Reset running state
		e.mu.Lock()
		e.runningConvID = ""
		e.streaming = false
		e.cancelFn = nil
		e.mu.Unlock()

		e.broadcastStatus()
	}()

	// Set running state
	e.mu.Lock()
	e.runningConvID = row.ConvID
	e.mu.Unlock()

	// Update activeConvID if changed
	e.mu.Lock()
	if e.activeConvID != row.ConvID {
		e.activeConvID = row.ConvID
		e.mu.Unlock()
		if err := database.SetPreference(prefKeyActiveConvID, row.ConvID); err != nil {
			log.Printf("[AIExecutor] failed to persist activeConvID: %v", err)
		}
		e.broadcastConvSwitched(row.ConvID)
	} else {
		e.mu.Unlock()
	}

	e.broadcastStatus()

	// No timeout — messages are instructions that must be delivered
	ctx, cancel := context.WithCancel(context.Background())
	e.mu.Lock()
	e.cancelFn = cancel
	e.mu.Unlock()
	defer cancel()

	e.service.HandleChat(ctx, row.ConvID, row.Content, row.ClientID, e.broadcastSink)
}

// broadcastStatus sends a chat_status_update event to all sinks.
func (e *AIExecutor) broadcastStatus() {
	status := e.Status()
	e.broadcastSink.OnSystemEvent("chat_status_update", status)
}

// broadcastConvSwitched sends a conv_switched event to all sinks.
func (e *AIExecutor) broadcastConvSwitched(convID string) {
	title := getConvTitle(convID)
	e.broadcastSink.OnSystemEvent("conv_switched", map[string]string{
		"convId":    convID,
		"convTitle": title,
	})
}
