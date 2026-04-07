// chat_service.go — Protocol-agnostic chat business logic.
// All protocols (WebSocket, WASM, HTTP API) call these methods.
// Handler/bridge layers are thin adapters that only do protocol-specific formatting.
package ai

import (
	"context"
	"fmt"

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
	MessageCount   int    `json:"messageCount"`            // 会话消息总数
	ContextTokens  int    `json:"contextTokens"`           // 当前上下文估算 token 数
	ContextWindow  int    `json:"contextWindow"`           // 上下文窗口大小
	ContextPercent int    `json:"contextPercent"`          // 上下文占窗口百分比
	HasSummary     bool   `json:"hasSummary"`              // 是否有摘要
	SummaryUpToID  int64  `json:"summaryUpToId,omitempty"` // 摘要覆盖到的消息 ID
	Compressed     bool   `json:"compressed"`              // 是否触发了截断/压缩
	RecentMessages int    `json:"recentMessages"`          // 保留最近消息数配置
	Model          string `json:"model"`                   // 当前模型
}

// ChatStatusResult is the unified response for chat.status.
type ChatStatusResult struct {
	ConversationID string         `json:"conversationId"`
	Active         bool           `json:"active"`
	Context        *ContextStatus `json:"context,omitempty"`
}

// StopConversationResult is returned after stopping a conversation.
type StopConversationResult struct {
	ConversationID string `json:"conversationId"`
	StoppedActive  bool   `json:"stoppedActive"`
	ClearedPending int64  `json:"clearedPending"`
}

// ConversationConfigResult is the conversation-scoped model configuration exposed to clients.
type ConversationConfigResult struct {
	ConversationID string       `json:"conversationId,omitempty"`
	Providers      []AIProvider `json:"providers"`
	ProviderID     string       `json:"providerId"`
	Model          string       `json:"model"`
	Draft          bool         `json:"draft"`
}

// NewChatService creates a ChatService from an existing executor and service.
func NewChatService(executor *AIExecutor, service *Service) *ChatService {
	return &ChatService{executor: executor, service: service}
}

func createConversationForSend(seedContent, providerID, model string) (string, error) {
	cfg, err := loadAIConfig("", providerID, model)
	if err != nil {
		return "", fmt.Errorf("AI 未配置: %v", err)
	}
	convID := genID()
	title := seedContent
	if title == "" || isConversationInitMessage(title) {
		title = "新对话"
	}
	if len(title) > 50 {
		title = title[:50] + "..."
	}
	if err := database.CreateConversation(convID, title, cfg.ProviderID, cfg.Model); err != nil {
		return "", fmt.Errorf("创建对话失败: %v", err)
	}
	return convID, nil
}

// SendMessage enqueues a message (or executes a command if it starts with /).
// clientID identifies the caller — used for both ClientContext lookup and sink routing.
func (cs *ChatService) SendMessage(convID, content, clientID, providerID, model string) EnqueueResult {
	resolvedConvID := convID
	if resolvedConvID == "" {
		newConvID, err := createConversationForSend(content, providerID, model)
		if err != nil {
			return EnqueueResult{Accepted: false, Reason: err.Error()}
		}
		resolvedConvID = newConvID
	}
	result := cs.executor.Enqueue(resolvedConvID, content, clientID, providerID, model)
	if result.ConversationID == "" {
		result.ConversationID = resolvedConvID
	}
	return result
}

// Commands returns all available slash commands.
func (cs *ChatService) Commands() []service.CommandDef {
	return service.ListCommands()
}

// GetMessages returns messages for a conversation.
func (cs *ChatService) GetMessages(convID string) ([]database.AIMessageRow, error) {
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

// StopConversation stops the active generation for a conversation and clears its pending queue items.
func (cs *ChatService) StopConversation(convID string) (StopConversationResult, error) {
	if convID == "" {
		return StopConversationResult{}, fmt.Errorf("conversationId is required")
	}
	stopped := cs.executor.StopConversation(convID)
	cleared, err := database.DeletePendingAIQueueByConversation(convID)
	if err != nil {
		return StopConversationResult{}, err
	}
	return StopConversationResult{
		ConversationID: convID,
		StoppedActive:  stopped,
		ClearedPending: cleared,
	}, nil
}

// IsChatActive returns whether a conversation is currently running or still has queued work.
func (cs *ChatService) IsChatActive(convID string) bool {
	if convID == "" {
		return false
	}
	if cs.executor.IsConversationRunning(convID) {
		return true
	}
	pending, err := database.PendingAIQueueCountByConversation(convID)
	if err != nil {
		return false
	}
	return pending > 0
}

// ExecutorStatus returns the current executor state.
func (cs *ChatService) ExecutorStatus() ExecutorStatus {
	return cs.executor.Status()
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
		return &ContextStatus{}, nil
	}

	cfg, err := loadAIConfig(convID, "", "")
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

// GetConversationConfig returns the provider list plus the selected provider/model for a conversation.
func (cs *ChatService) GetConversationConfig(convID string) (*ConversationConfigResult, error) {
	multi, err := loadMultiConfig()
	if err != nil {
		return nil, err
	}
	provider, model, err := resolveConversationSelection(multi, convID)
	if err != nil {
		return nil, err
	}
	return &ConversationConfigResult{
		ConversationID: convID,
		Providers:      multi.Providers,
		ProviderID:     provider.ID,
		Model:          model,
		Draft:          convID == "",
	}, nil
}

// SetConversationConfig updates the provider/model selection for an existing conversation.
func (cs *ChatService) SetConversationConfig(convID, providerID, model string) (*ConversationConfigResult, error) {
	if convID == "" {
		return nil, fmt.Errorf("conversationId is required")
	}
	if providerID == "" {
		return nil, fmt.Errorf("providerId is required")
	}
	if model == "" {
		return nil, fmt.Errorf("model is required")
	}

	multi, err := loadMultiConfig()
	if err != nil {
		return nil, err
	}
	var provider *AIProvider
	for i := range multi.Providers {
		if multi.Providers[i].ID == providerID {
			provider = &multi.Providers[i]
			break
		}
	}
	if provider == nil {
		return nil, fmt.Errorf("未找到供应商: %s", providerID)
	}
	validModel := false
	for _, candidate := range provider.Models {
		if candidate == model {
			validModel = true
			break
		}
	}
	if !validModel {
		return nil, fmt.Errorf("供应商 %s 中未找到模型: %s", provider.Name, model)
	}
	conv, err := database.GetConversation(convID)
	if err != nil {
		return nil, err
	}
	if conv == nil {
		return nil, fmt.Errorf("对话不存在: %s", convID)
	}
	if err := database.UpdateConversationModel(convID, providerID, model); err != nil {
		return nil, err
	}
	return &ConversationConfigResult{
		ConversationID: convID,
		Providers:      multi.Providers,
		ProviderID:     providerID,
		Model:          model,
		Draft:          false,
	}, nil
}
