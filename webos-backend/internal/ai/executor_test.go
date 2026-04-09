package ai

import (
	"context"
	"sort"
	"sync"
	"testing"
	"time"

	"webos-backend/internal/database"
)

func TestAIExecutorRunsDifferentConversationsConcurrently(t *testing.T) {
	setupAIChatTestDB(t)

	mustCreateConversation(t, "conv-a", "A")
	mustCreateConversation(t, "conv-b", "B")

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	started := make(chan string, 2)
	release := make(chan struct{})

	executor.handleChatFn = func(ctx context.Context, convID, content, clientID, providerID, model string, sink ChatSink) {
		started <- convID
		<-release
	}

	executor.Start()
	executor.Enqueue("conv-a", "msg-a", "client-a", "provider-1", "model-1")
	executor.Enqueue("conv-b", "msg-b", "client-b", "provider-1", "model-1")

	got := []string{waitString(t, started), waitString(t, started)}
	sort.Strings(got)
	if got[0] != "conv-a" || got[1] != "conv-b" {
		t.Fatalf("started = %v, want [conv-a conv-b]", got)
	}

	close(release)
	waitUntil(t, func() bool {
		return !executor.IsConversationRunning("conv-a") && !executor.IsConversationRunning("conv-b") && database.PendingAIQueueCount() == 0
	})
}

func TestAIExecutorKeepsSingleConversationSerial(t *testing.T) {
	setupAIChatTestDB(t)

	mustCreateConversation(t, "conv-serial", "Serial")

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	firstStarted := make(chan struct{}, 1)
	secondStarted := make(chan struct{}, 1)
	allowFirst := make(chan struct{})
	allowSecond := make(chan struct{})
	var mu sync.Mutex
	calls := 0

	executor.handleChatFn = func(ctx context.Context, convID, content, clientID, providerID, model string, sink ChatSink) {
		mu.Lock()
		calls++
		callNo := calls
		mu.Unlock()
		switch callNo {
		case 1:
			firstStarted <- struct{}{}
			<-allowFirst
		case 2:
			secondStarted <- struct{}{}
			<-allowSecond
		default:
			panic("unexpected call count")
		}
	}

	executor.Start()
	executor.Enqueue("conv-serial", "msg-1", "client-a", "provider-1", "model-1")
	executor.Enqueue("conv-serial", "msg-2", "client-a", "provider-1", "model-1")

	waitSignal(t, firstStarted)
	assertNoSignal(t, secondStarted)

	close(allowFirst)
	waitSignal(t, secondStarted)
	close(allowSecond)

	waitUntil(t, func() bool {
		return !executor.IsConversationRunning("conv-serial") && database.PendingAIQueueCount() == 0
	})
}

func TestAIExecutorStopConversationOnlyCancelsTarget(t *testing.T) {
	setupAIChatTestDB(t)

	mustCreateConversation(t, "conv-a", "A")
	mustCreateConversation(t, "conv-b", "B")

	svc := NewService(nil)
	executor := NewAIExecutor(svc)
	startedA := make(chan struct{}, 1)
	startedB := make(chan struct{}, 1)
	canceledA := make(chan struct{}, 1)
	releaseB := make(chan struct{})
	doneB := make(chan struct{}, 1)

	executor.handleChatFn = func(ctx context.Context, convID, content, clientID, providerID, model string, sink ChatSink) {
		switch convID {
		case "conv-a":
			startedA <- struct{}{}
			<-ctx.Done()
			canceledA <- struct{}{}
		case "conv-b":
			startedB <- struct{}{}
			<-releaseB
			doneB <- struct{}{}
		default:
			panic("unexpected conversation")
		}
	}

	executor.Start()
	executor.Enqueue("conv-a", "msg-a", "client-a", "provider-1", "model-1")
	executor.Enqueue("conv-b", "msg-b", "client-b", "provider-1", "model-1")

	waitSignal(t, startedA)
	waitSignal(t, startedB)

	if !executor.StopConversation("conv-a") {
		t.Fatal("StopConversation(conv-a) = false, want true")
	}
	waitSignal(t, canceledA)
	if !executor.IsConversationRunning("conv-b") {
		t.Fatal("conv-b should still be running")
	}

	close(releaseB)
	waitSignal(t, doneB)
	waitUntil(t, func() bool {
		return !executor.IsConversationRunning("conv-a") && !executor.IsConversationRunning("conv-b") && database.PendingAIQueueCount() == 0
	})
}

func mustCreateConversation(t *testing.T, convID, title string) {
	t.Helper()
	if err := database.CreateConversation(convID, title, "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation %s failed: %v", convID, err)
	}
}

func waitSignal(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for signal")
	}
}

func waitString(t *testing.T, ch <-chan string) string {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for string")
		return ""
	}
}

func assertNoSignal(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
		t.Fatal("received unexpected signal")
	case <-time.After(150 * time.Millisecond):
	}
}

func waitUntil(t *testing.T, fn func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not satisfied before timeout")
}
