package database

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

var aiQueueTestDBOnce sync.Once

func setupAIQueueTestDB(t *testing.T) {
	t.Helper()

	aiQueueTestDBOnce.Do(func() {
		configDir := filepath.Join(os.TempDir(), "webos-database-ai-queue-tests")
		_ = os.RemoveAll(configDir)
		if err := Init(configDir); err != nil {
			t.Fatalf("Init failed: %v", err)
		}
	})

	clearAIQueueTestState(t)
}

func clearAIQueueTestState(t *testing.T) {
	t.Helper()

	db := DB()
	if db == nil {
		t.Fatal("database not initialized")
	}
	statements := []string{
		"DELETE FROM ai_queue",
		"DELETE FROM ai_messages",
		"DELETE FROM ai_summaries",
		"DELETE FROM ai_conversations",
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("Exec %q failed: %v", stmt, err)
		}
	}
}

func TestDeletePendingAIQueueByConversation(t *testing.T) {
	setupAIQueueTestDB(t)

	if err := CreateConversation("conv-a", "A", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-a failed: %v", err)
	}
	if err := CreateConversation("conv-b", "B", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-b failed: %v", err)
	}

	id1, err := EnqueueAIMessage("conv-a", "msg-1", "client-a", "provider-1", "model-1")
	if err != nil {
		t.Fatalf("EnqueueAIMessage 1 failed: %v", err)
	}
	if _, err := EnqueueAIMessage("conv-a", "msg-2", "client-a", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage 2 failed: %v", err)
	}
	if _, err := EnqueueAIMessage("conv-b", "msg-3", "client-b", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage 3 failed: %v", err)
	}

	row, err := DequeueAIMessage()
	if err != nil {
		t.Fatalf("DequeueAIMessage failed: %v", err)
	}
	if row == nil || row.ID != id1 {
		t.Fatalf("dequeued row = %+v, want id %d", row, id1)
	}

	cleared, err := DeletePendingAIQueueByConversation("conv-a")
	if err != nil {
		t.Fatalf("DeletePendingAIQueueByConversation failed: %v", err)
	}
	if cleared != 1 {
		t.Fatalf("cleared = %d, want 1", cleared)
	}

	next, err := DequeueAIMessage()
	if err != nil {
		t.Fatalf("DequeueAIMessage after delete failed: %v", err)
	}
	if next == nil {
		t.Fatal("expected remaining queue item for conv-b")
	}
	if next.ConvID != "conv-b" {
		t.Fatalf("next conv = %q, want conv-b", next.ConvID)
	}

	none, err := DequeueAIMessage()
	if err != nil {
		t.Fatalf("final DequeueAIMessage failed: %v", err)
	}
	if none != nil {
		t.Fatalf("expected queue empty, got %+v", none)
	}
}

func TestPendingAIQueueCountByConversation(t *testing.T) {
	setupAIQueueTestDB(t)

	if err := CreateConversation("conv-a", "A", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-a failed: %v", err)
	}
	if err := CreateConversation("conv-b", "B", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation conv-b failed: %v", err)
	}
	if _, err := EnqueueAIMessage("conv-a", "msg-1", "client-a", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage conv-a #1 failed: %v", err)
	}
	if _, err := EnqueueAIMessage("conv-a", "msg-2", "client-a", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage conv-a #2 failed: %v", err)
	}
	if _, err := EnqueueAIMessage("conv-b", "msg-3", "client-b", "provider-1", "model-1"); err != nil {
		t.Fatalf("EnqueueAIMessage conv-b failed: %v", err)
	}

	countA, err := PendingAIQueueCountByConversation("conv-a")
	if err != nil {
		t.Fatalf("PendingAIQueueCountByConversation conv-a failed: %v", err)
	}
	if countA != 2 {
		t.Fatalf("countA = %d, want 2", countA)
	}

	countB, err := PendingAIQueueCountByConversation("conv-b")
	if err != nil {
		t.Fatalf("PendingAIQueueCountByConversation conv-b failed: %v", err)
	}
	if countB != 1 {
		t.Fatalf("countB = %d, want 1", countB)
	}
}
