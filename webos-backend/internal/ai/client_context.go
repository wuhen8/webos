// client_context.go — Client context registry.
// Each protocol/client registers its identity, capabilities, and formatting hints.
// AI center reads the active client's context when building the system prompt.
package ai

import "sync"

// ClientContext describes a connected client's identity and preferences.
type ClientContext struct {
	ID           string            `json:"id"`           // unique key: "web", "telegram-ai-bot", "discord-bot"
	Platform     string            `json:"platform"`     // "web", "telegram", "discord", "api"
	DisplayName  string            `json:"displayName"`  // human-readable: "Telegram Bot"
	Capabilities []string          `json:"capabilities"` // what the client supports: "markdown", "code_blocks", "images", "html"
	Constraints  []string          `json:"constraints"`  // limitations: "max_message_4096", "no_tables"
	SystemHint   string            `json:"systemHint"`   // free-form system prompt injected into AI context
	Metadata     map[string]string `json:"metadata"`     // extensible key-value pairs
}

// clientRegistry is a global in-memory registry of client contexts.
var clientRegistry struct {
	mu      sync.RWMutex
	clients map[string]*ClientContext
}

func init() {
	clientRegistry.clients = make(map[string]*ClientContext)

	// Register the default web client
	RegisterClientContext(&ClientContext{
		ID:           "web",
		Platform:     "web",
		DisplayName:  "Web UI",
		Capabilities: []string{"markdown", "code_blocks", "images", "html", "tables", "latex"},
		SystemHint:   "", // web UI has no special formatting needs
	})
}

// RegisterClientContext registers or updates a client context.
func RegisterClientContext(ctx *ClientContext) {
	clientRegistry.mu.Lock()
	defer clientRegistry.mu.Unlock()
	clientRegistry.clients[ctx.ID] = ctx
}

// UnregisterClientContext removes a client context.
func UnregisterClientContext(id string) {
	clientRegistry.mu.Lock()
	defer clientRegistry.mu.Unlock()
	delete(clientRegistry.clients, id)
}

// GetClientContext returns the client context for the given ID, or nil.
func GetClientContext(id string) *ClientContext {
	clientRegistry.mu.RLock()
	defer clientRegistry.mu.RUnlock()
	return clientRegistry.clients[id]
}

// ListClientContexts returns all registered client contexts.
func ListClientContexts() []*ClientContext {
	clientRegistry.mu.RLock()
	defer clientRegistry.mu.RUnlock()
	out := make([]*ClientContext, 0, len(clientRegistry.clients))
	for _, c := range clientRegistry.clients {
		out = append(out, c)
	}
	return out
}
