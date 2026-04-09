package ai

import (
	"testing"

	"webos-backend/internal/database"
)

func TestHistoryManagerSaveToolMessageStoresStructuredPayloadAndLoadMessagesRemainsBackwardCompatible(t *testing.T) {
	setupAIChatTestDB(t)

	if err := database.CreateConversation("conv-tool", "Tool", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation failed: %v", err)
	}

	h := NewHistoryManager()
	if err := h.SaveToolMessage("conv-tool", "call-1", "tool failed", true); err != nil {
		t.Fatalf("SaveToolMessage failed: %v", err)
	}
	if err := database.InsertMessage("conv-tool", "tool", "legacy plain text", nil, strPtr("call-2"), ""); err != nil {
		t.Fatalf("InsertMessage failed: %v", err)
	}

	rows, err := database.ListMessages("conv-tool")
	if err != nil {
		t.Fatalf("ListMessages failed: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("ListMessages len = %d, want 2", len(rows))
	}
	if rows[0].Content == "tool failed" {
		t.Fatal("expected stored tool message to be structured JSON, got plain text")
	}

	msgs, err := h.LoadMessages("conv-tool")
	if err != nil {
		t.Fatalf("LoadMessages failed: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("LoadMessages len = %d, want 2", len(msgs))
	}
	if got := msgs[0].Content; got != "tool failed" {
		t.Fatalf("first tool content = %#v, want %q", got, "tool failed")
	}
	if got := msgs[1].Content; got != "legacy plain text" {
		t.Fatalf("legacy tool content = %#v, want %q", got, "legacy plain text")
	}
}

func strPtr(s string) *string { return &s }
