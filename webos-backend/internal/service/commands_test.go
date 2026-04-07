package service

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"webos-backend/internal/database"
)

var commandTestDBOnce sync.Once

func setupCommandTestDB(t *testing.T) {
	t.Helper()

	commandTestDBOnce.Do(func() {
		configDir := filepath.Join(os.TempDir(), "webos-service-command-tests")
		_ = os.RemoveAll(configDir)
		if err := database.Init(configDir); err != nil {
			t.Fatalf("Init failed: %v", err)
		}
	})

	clearCommandTestState(t)

	aiConfig := `{"providers":[{"id":"provider-1","name":"Provider 1","models":["model-1"]}]}`
	if err := database.SetPreference("ai_config", aiConfig); err != nil {
		t.Fatalf("SetPreference failed: %v", err)
	}
}

func clearCommandTestState(t *testing.T) {
	t.Helper()

	db := database.DB()
	if db == nil {
		t.Fatal("database not initialized")
	}
	statements := []string{
		"DELETE FROM ai_messages",
		"DELETE FROM ai_summaries",
		"DELETE FROM ai_conversations",
		"DELETE FROM ai_queue",
		"DELETE FROM preferences WHERE key = 'ai_config'",
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("Exec %q failed: %v", stmt, err)
		}
	}
}

func TestExecuteCommandForClientConversationSwitchSemantics(t *testing.T) {
	setupCommandTestDB(t)

	ce := &CommandExecutor{}
	if err := database.CreateConversation("conv-existing", "Existing", "provider-1", "model-1"); err != nil {
		t.Fatalf("CreateConversation failed: %v", err)
	}

	tests := []struct {
		name              string
		convID            string
		cmdName           string
		cmdArgs           string
		clientID          string
		wantError         bool
		wantSwitch        bool
		wantAction        string
		wantRoutePolicy   string
		wantOwnerClientID string
		wantTargetSet     bool
	}{
		{
			name:              "conv switch is explicit directed switch",
			cmdName:           "conv",
			cmdArgs:           "switch conv-existing",
			clientID:          "weixin-ai-bot",
			wantSwitch:        true,
			wantAction:        "switched",
			wantRoutePolicy:   "directed",
			wantOwnerClientID: "weixin-ai-bot",
			wantTargetSet:     true,
		},
		{
			name:            "conv new is explicit unowned switch",
			cmdName:         "conv",
			cmdArgs:         "new",
			wantSwitch:      true,
			wantAction:      "created",
			wantRoutePolicy: "unowned",
			wantTargetSet:   true,
		},
		{
			name:              "status stays informational",
			cmdName:           "status",
			convID:            "conv-existing",
			clientID:          "telegram-ai-bot",
			wantSwitch:        false,
			wantAction:        "",
			wantRoutePolicy:   "directed",
			wantOwnerClientID: "telegram-ai-bot",
			wantTargetSet:     false,
		},
		{
			name:            "unknown command stays unowned error",
			cmdName:         "missing",
			wantError:       true,
			wantSwitch:      false,
			wantRoutePolicy: "unowned",
			wantTargetSet:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ce.ExecuteCommandForClient(tt.convID, tt.cmdName, tt.cmdArgs, tt.clientID)
			if result.IsError != tt.wantError {
				t.Fatalf("IsError = %v, want %v", result.IsError, tt.wantError)
			}
			if result.SwitchConversation != tt.wantSwitch {
				t.Fatalf("SwitchConversation = %v, want %v", result.SwitchConversation, tt.wantSwitch)
			}
			if result.ConversationAction != tt.wantAction {
				t.Fatalf("ConversationAction = %q, want %q", result.ConversationAction, tt.wantAction)
			}
			if result.RoutePolicy != tt.wantRoutePolicy {
				t.Fatalf("RoutePolicy = %q, want %q", result.RoutePolicy, tt.wantRoutePolicy)
			}
			if result.OwnerClientID != tt.wantOwnerClientID {
				t.Fatalf("OwnerClientID = %q, want %q", result.OwnerClientID, tt.wantOwnerClientID)
			}
			gotTargetSet := result.ConversationID != ""
			if gotTargetSet != tt.wantTargetSet {
				t.Fatalf("ConversationID present = %v, want %v (got %q)", gotTargetSet, tt.wantTargetSet, result.ConversationID)
			}
		})
	}
}

func TestExecuteCommandForClientAISemantics(t *testing.T) {
	setupCommandTestDB(t)

	var calls []struct {
		convID   string
		message  string
		clientID string
	}

	ce := &CommandExecutor{
		OnAISend: func(convID, message, clientID string) (bool, string) {
			calls = append(calls, struct {
				convID   string
				message  string
				clientID string
			}{convID: convID, message: message, clientID: clientID})
			return true, ""
		},
	}

	t.Run("directed caller stays directed without switch", func(t *testing.T) {
		result := ce.ExecuteCommandForClient("conv-a", "ai", "hello", "feishu-ai-bot")
		if result.IsError {
			t.Fatalf("unexpected error: %s", result.Text)
		}
		if result.SwitchConversation {
			t.Fatalf("SwitchConversation = true, want false")
		}
		if result.RoutePolicy != "directed" {
			t.Fatalf("RoutePolicy = %q, want directed", result.RoutePolicy)
		}
		if result.OwnerClientID != "feishu-ai-bot" {
			t.Fatalf("OwnerClientID = %q, want feishu-ai-bot", result.OwnerClientID)
		}
	})

	t.Run("scheduled ai stays unowned and can target sink", func(t *testing.T) {
		result := ce.ExecuteCommandForClient("scheduled_ai", "ai", "@telegram-ai-bot ping", "")
		if result.IsError {
			t.Fatalf("unexpected error: %s", result.Text)
		}
		if result.SwitchConversation {
			t.Fatalf("SwitchConversation = true, want false")
		}
		if result.RoutePolicy != "unowned" {
			t.Fatalf("RoutePolicy = %q, want unowned", result.RoutePolicy)
		}
		if result.OwnerClientID != "" {
			t.Fatalf("OwnerClientID = %q, want empty", result.OwnerClientID)
		}
	})

	if len(calls) != 2 {
		t.Fatalf("OnAISend call count = %d, want 2", len(calls))
	}
	if calls[0].convID != "conv-a" || calls[0].message != "hello" || calls[0].clientID != "" {
		t.Fatalf("first OnAISend call = %+v, want conv-a/hello/empty target", calls[0])
	}
	if calls[1].convID != "scheduled_ai" || calls[1].message != "ping" || calls[1].clientID != "telegram-ai-bot" {
		t.Fatalf("second OnAISend call = %+v, want scheduled_ai/ping/telegram-ai-bot", calls[1])
	}
}

func TestExecuteCommandForClientConvNewCreatesConversation(t *testing.T) {
	setupCommandTestDB(t)

	ce := &CommandExecutor{}
	result := ce.ExecuteCommandForClient("", "conv", "new", "weixin-ai-bot")
	if result.IsError {
		t.Fatalf("unexpected error: %s", result.Text)
	}
	if result.ConversationID == "" {
		t.Fatal("ConversationID is empty")
	}
	if !result.SwitchConversation {
		t.Fatal("SwitchConversation = false, want true")
	}

	conv, err := database.GetConversation(result.ConversationID)
	if err != nil {
		t.Fatalf("GetConversation failed: %v", err)
	}
	if conv == nil {
		t.Fatal("created conversation not found")
	}
	if conv.ProviderID != "provider-1" || conv.Model != "model-1" {
		t.Fatalf("conversation selection = %s/%s, want provider-1/model-1", conv.ProviderID, conv.Model)
	}
}

func TestDefaultConversationSelectionRequiresAIConfig(t *testing.T) {
	setupCommandTestDB(t)

	db := database.DB()
	if _, err := db.Exec("DELETE FROM preferences WHERE key = 'ai_config'"); err != nil {
		t.Fatalf("delete ai_config failed: %v", err)
	}

	_, _, err := defaultConversationSelection()
	if err == nil {
		t.Fatal("expected error when ai_config is missing")
	}
	if got := err.Error(); got != "请先配置 AI" {
		t.Fatalf("error = %q, want %q", got, "请先配置 AI")
	}
}

func TestExecuteCommandForClientAIFailureIncludesReason(t *testing.T) {
	setupCommandTestDB(t)

	ce := &CommandExecutor{
		OnAISend: func(convID, message, clientID string) (bool, string) {
			return false, "queue_busy"
		},
	}

	result := ce.ExecuteCommandForClient("scheduled_ai", "ai", "hello", "")
	if !result.IsError {
		t.Fatal("IsError = false, want true")
	}
	if result.SwitchConversation {
		t.Fatal("SwitchConversation = true, want false")
	}
	if result.RoutePolicy != "unowned" {
		t.Fatalf("RoutePolicy = %q, want unowned", result.RoutePolicy)
	}
	if got := result.Text; got != fmt.Sprintf("消息发送失败: %s", "queue_busy") {
			t.Fatalf("Text = %q, want failure reason", got)
	}
}
