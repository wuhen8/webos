package ai

import (
	"context"
	"testing"

	"webos-backend/internal/database"
)

func TestChatServiceStopConversationClearsPendingAndCancelsMatchingRun(t *testing.T) {
	setupAIChatTestDB(t)

	if err := database.CreateConversation("conv-stop", "Stop", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation failed: %v", err)
	}
	if _, err := database.EnqueueAIMessage("conv-stop", "queued-1", "client-1", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage 1 failed: %v", err)
	}
	if _, err := database.EnqueueAIMessage("conv-stop", "queued-2", "client-1", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage 2 failed: %v", err)
	}

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	executor.runningConvID = "conv-stop"
	executor.cancelFn = cancel
	executor.streaming = true
	chatSvc := NewChatService(executor, svc)

	result, err := chatSvc.StopConversation("conv-stop")
	if err != nil {
		t.Fatalf("StopConversation failed: %v", err)
	}
	if !result.StoppedActive {
		t.Fatal("StoppedActive = false, want true")
	}
	if result.ClearedPending != 2 {
		t.Fatalf("ClearedPending = %d, want 2", result.ClearedPending)
	}
	select {
	case <-ctx.Done():
	default:
		t.Fatal("expected running context to be cancelled")
	}
	if got := database.PendingAIQueueCount(); got != 0 {
		t.Fatalf("PendingAIQueueCount = %d, want 0", got)
	}
}

func TestChatServiceStopConversationDoesNotCancelOtherConversation(t *testing.T) {
	setupAIChatTestDB(t)

	if err := database.CreateConversation("conv-running", "Running", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-running failed: %v", err)
	}
	if err := database.CreateConversation("conv-target", "Target", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-target failed: %v", err)
	}
	if _, err := database.EnqueueAIMessage("conv-target", "queued-1", "client-1", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage failed: %v", err)
	}

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	executor.runningConvID = "conv-running"
	executor.cancelFn = cancel
	executor.streaming = true
	chatSvc := NewChatService(executor, svc)

	result, err := chatSvc.StopConversation("conv-target")
	if err != nil {
		t.Fatalf("StopConversation failed: %v", err)
	}
	if result.StoppedActive {
		t.Fatal("StoppedActive = true, want false")
	}
	if result.ClearedPending != 1 {
		t.Fatalf("ClearedPending = %d, want 1", result.ClearedPending)
	}
	select {
	case <-ctx.Done():
		t.Fatal("unexpected cancellation for running conversation")
	default:
	}
	if executor.runningConvID != "conv-running" {
		t.Fatalf("runningConvID = %q, want conv-running", executor.runningConvID)
	}
}

func TestChatServiceIsChatActiveUsesExecutorAndPendingQueue(t *testing.T) {
	setupAIChatTestDB(t)

	if err := database.CreateConversation("conv-running", "Running", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-running failed: %v", err)
	}
	if err := database.CreateConversation("conv-pending", "Pending", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-pending failed: %v", err)
	}
	if err := database.CreateConversation("conv-idle", "Idle", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-idle failed: %v", err)
	}
	if _, err := database.EnqueueAIMessage("conv-pending", "queued-1", "client-1", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage failed: %v", err)
	}

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	executor.runningConvID = "conv-running"
	executor.streaming = true
	chatSvc := NewChatService(executor, svc)

	if !chatSvc.IsChatActive("conv-running") {
		t.Fatal("conv-running should be active")
	}
	if !chatSvc.IsChatActive("conv-pending") {
		t.Fatal("conv-pending should be active because queue has pending work")
	}
	if chatSvc.IsChatActive("conv-idle") {
		t.Fatal("conv-idle should be inactive")
	}
}
