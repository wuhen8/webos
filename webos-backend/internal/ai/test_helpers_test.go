package ai

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"webos-backend/internal/database"
)

var aiChatTestDBOnce sync.Once

func setupAIChatTestDB(t *testing.T) {
	t.Helper()

	aiChatTestDBOnce.Do(func() {
		configDir := filepath.Join(os.TempDir(), "webos-ai-chat-tests")
		_ = os.RemoveAll(configDir)
		if err := database.Init(configDir); err != nil {
			t.Fatalf("Init failed: %v", err)
		}
	})

	clearAIChatTestState(t)
}

func clearAIChatTestState(t *testing.T) {
	t.Helper()

	db := database.DB()
	if db == nil {
		t.Fatal("database not initialized")
	}
	statements := []string{
		"DELETE FROM ai_queue",
		"DELETE FROM ai_messages",
		"DELETE FROM ai_summaries",
		"DELETE FROM ai_conversations",
		"DELETE FROM preferences WHERE key = 'ai_config'",
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("Exec %q failed: %v", stmt, err)
		}
	}

	aiConfig := `{"providers":[{"id":"provider-1","name":"Provider 1","models":["model-1"]}]}`
	if err := database.SetPreference("ai_config", aiConfig); err != nil {
		t.Fatalf("SetPreference failed: %v", err)
	}
}
