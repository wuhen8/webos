// chat_service.go — Protocol-agnostic chat business logic.
// All protocols (WebSocket, WASM, HTTP API) call these methods.
// Handler/bridge layers are thin adapters that only do protocol-specific formatting.
package ai

import (
	"context"

	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// ChatService provides protocol-agnostic chat operations.
// It wraps AIExecutor and Service, exposing a clean API for all callers.
type ChatService struct {
	executor *AIExecutor
	service  *Service
}
// ContextStatus holds the context window state for a conversation.
type ContextStatus struct {
	MessageCount   int    `json:"messageCount"`             // 会话消息总数
	ContextTokens  int    `json:"contextTokens"`            // 当前上下文估算 token 数
	ContextWindow  int    `json:"contextWindow"`            // 上下文窗口大小
	ContextPercent int    `json:"contextPercent"`           // 上下文占窗口百分比
	HasSummary     bool   `json:"hasSummary"`               // 是否有摘要
	SummaryUpToID  int64  `json:"summaryUpToId,omitempty"`  // 摘要覆盖到的消息 ID
	Compressed     bool   `json:"compressed"`               // 是否触发了截断/压缩
	RecentMessages int    `json:"recentMessages"`           // 保留最近消息数配置
	Model          string `json:"model"`                    // 当前模型
}

// ChatStatusResult is the unified response for chat_status.
type ChatStatusResult struct {
	ConversationID string         `json:"conversationId"`
	Active         bool           `json:"active"`
	Context        *ContextStatus `json:"context,omitempty"`
}


// NewChatService creates a ChatService from an existing executor and service.
func NewChatService(executor *AIExecutor, service *Service) *ChatService {
	return &ChatService{executor: executor, service: service}
}

// SendMessage enqueues a message (or executes a command if it starts with /).
// clientID identifies the caller — used for both ClientContext lookup and sink routing.
func (cs *ChatService) SendMessage(convID, content, clientID string) EnqueueResult {
	return cs.executor.Enqueue(convID, content, clientID)
}

// Commands returns all available slash commands.
func (cs *ChatService) Commands() []service.CommandDef {
	return service.ListCommands()
}

// GetMessages returns messages for a conversation.
// If convID is empty, uses the active conversation.
func (cs *ChatService) GetMessages(convID string) ([]database.AIMessageRow, error) {
	if convID == "" {
		convID = cs.executor.GetActiveConvID()
	}
	if convID == "" {
		return []database.AIMessageRow{}, nil
	}
	return database.ListMessages(convID)
}

// ListConversations returns all conversations.
func (cs *ChatService) ListConversations() ([]database.AIConversationRow, error) {
	return database.ListConversations()
}

// DeleteConversation deletes a conversation by ID.
func (cs *ChatService) DeleteConversation(convID string) error {
	return cs.service.DeleteConversation(convID)
}

// IsChatActive returns whether a conversation has an active generation.
func (cs *ChatService) IsChatActive(convID string) bool {
	return cs.service.IsChatActive(convID)
}

// ExecutorStatus returns the current executor state.
func (cs *ChatService) ExecutorStatus() ExecutorStatus {
	return cs.executor.Status()
}

// GetActiveConvID returns the currently active conversation ID.
func (cs *ChatService) GetActiveConvID() string {
	return cs.executor.GetActiveConvID()
}

// Cleanup runs AI service cleanup.
func (cs *ChatService) Cleanup() {
	cs.service.Cleanup()
}

// GetBroadcastSink returns the broadcast sink for event subscription.
func (cs *ChatService) GetBroadcastSink() *BroadcastSink {
	return cs.executor.GetBroadcastSink()
}

// GetSystemContext returns the system context for sink registration.
func (cs *ChatService) GetSystemContext() SystemContext {
	return cs.service.GetSystemContext()
}

// GetStatus returns the complete chat status for a conversation, including context state.
func (cs *ChatService) GetStatus(convID string) ChatStatusResult {
	result := ChatStatusResult{
		ConversationID: convID,
		Active:         cs.IsChatActive(convID),
	}
	if ctxStatus, err := cs.GetContextStatus(convID); err == nil && ctxStatus != nil {
		result.Context = ctxStatus
	}
	return result
}
// GetContextStatus returns the current context window state for a conversation.
func (cs *ChatService) GetContextStatus(convID string) (*ContextStatus, error) {
	if convID == "" {
		convID = cs.executor.GetActiveConvID()
	}
	if convID == "" {
		return &ContextStatus{}, nil
	}

	cfg, err := loadAIConfig()
	if err != nil {
		return nil, err
	}

	contextWindow := cfg.MaxInputTokens
	if contextWindow <= 0 {
		contextWindow = defaultMaxInputTokens
	}
	recentN := cfg.RecentMessages
	if recentN <= 0 {
		recentN = defaultRecentMessages
	}

	// Message count
	msgCount, _ := database.MessageCount(convID)

	// Load messages and estimate tokens
	rows, err := database.ListMessages(convID)
	if err != nil {
		return nil, err
	}
	msgs := rowsToMessages(rows)

	// Build system prompt (use skills if available, otherwise use default)
	systemPrompt := defaultSystemPrompt
	if cs.service.skills != nil {
		systemPrompt = buildSystemPrompt(cs.service.skills)
	}

	builtCtx, compressed, _ := BuildContext(context.Background(), *cfg, convID, systemPrompt, msgs, rows)

	totalTokens := 0
	for _, m := range builtCtx {
		totalTokens += EstimateMessageTokens(m)
	}

	percent := 0
	if contextWindow > 0 {
		percent = totalTokens * 100 / contextWindow
	}

	// Summary info
	hasSummary := false
	var summaryUpToID int64
	summary, _ := database.GetLatestSummary(convID)
	if summary != nil {
		hasSummary = true
		summaryUpToID = summary.UpToMsgID
	}

	return &ContextStatus{
		MessageCount:   msgCount,
		ContextTokens:  totalTokens,
		ContextWindow:  contextWindow,
		ContextPercent: percent,
		HasSummary:     hasSummary,
		SummaryUpToID:  summaryUpToID,
		Compressed:     compressed,
		RecentMessages: recentN,
		Model:          cfg.Model,
	}, nil
}

