package wasm

// AppManifest represents the wasm-relevant fields from manifest.json.
type AppManifest struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	WasmModule   string   `json:"wasmModule,omitempty"`
	Background   bool     `json:"background,omitempty"`
	PollInterval int      `json:"pollInterval,omitempty"` // 毫秒，>0 时宿主定时推 tick 事件
	Permissions  []string `json:"permissions,omitempty"`
}

// GetManifest loads and returns the manifest for an app.
func GetManifest(appID string) *AppManifest {
	m, err := loadManifest(appID)
	if err != nil {
		return nil
	}
	return m
}
