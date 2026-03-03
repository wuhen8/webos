package ai

// ChatMessage represents an OpenAI-compatible chat message.
// Content can be a string (plain text) or []ContentPart (multimodal).
type ChatMessage struct {
	Role       string      `json:"role"`
	Content    interface{} `json:"content,omitempty"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

// ContentPart represents one part of a multimodal content array.
type ContentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *ImageURL `json:"image_url,omitempty"`
}

// ImageURL holds the data URL for an inline image.
type ImageURL struct {
	URL string `json:"url"`
}

// ToolCall represents a tool invocation from the assistant.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall holds the function name and arguments JSON string.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ToolResult holds the result of a tool execution.
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Content    string `json:"content"`
	IsError    bool   `json:"is_error,omitempty"`
}

// APIFormat constants for provider API types.
const (
	APIFormatOpenAI     = "openai"
	APIFormatAnthropic  = "anthropic"
	APIFormatResponses  = "responses"
)

// AIProvider represents a single OpenAI-compatible provider with its models.
type AIProvider struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	BaseURL   string   `json:"baseUrl"`
	APIKey    string   `json:"apiKey"`
	Models    []string `json:"models"`
	APIFormat string   `json:"apiFormat,omitempty"` // "openai" (default) or "anthropic"
}

// AIMultiConfig is the top-level AI configuration supporting multiple providers.
type AIMultiConfig struct {
	Providers      []AIProvider `json:"providers"`
	ActiveProvider string       `json:"activeProvider"`
	ActiveModel    string       `json:"activeModel"`
	MaxTokens      int          `json:"maxTokens,omitempty"`
	MaxInputTokens int          `json:"maxInputTokens,omitempty"` // 模型最大输入 token 限制，默认 128000
	MaxToolRounds  int          `json:"maxToolRounds,omitempty"`
	RPM            int          `json:"rpm,omitempty"`            // API requests per minute limit, default 10
	RecentMessages int          `json:"recentMessages,omitempty"` // 保留最近消息数，默认 5
}

// AIConfig stores the flat LLM API configuration used by ChatStream.
type AIConfig struct {
	BaseURL        string `json:"baseUrl"`
	APIKey         string `json:"apiKey"`
	Model          string `json:"model"`
	APIFormat      string `json:"apiFormat,omitempty"`       // "openai" (default) or "anthropic"
	MaxTokens      int    `json:"maxTokens,omitempty"`
	MaxInputTokens int    `json:"maxInputTokens,omitempty"` // 模型最大输入 token 限制，默认 128000
	MaxToolRounds  int    `json:"maxToolRounds,omitempty"`
	RPM            int    `json:"rpm,omitempty"`            // requests per minute, default 10
	ContextWindow  int    `json:"contextWindow,omitempty"`  // 上下文窗口大小，默认 32000
	RecentMessages int    `json:"recentMessages,omitempty"` // 保留最近消息数，默认 5
}

// TokenUsage holds token estimation info for a chat turn.
type TokenUsage struct {
	ContextTokens  int  `json:"contextTokens"`  // 本轮上下文总 token 数
	ResponseTokens int  `json:"responseTokens"` // 本轮回复 token 数
	ContextPercent int  `json:"contextPercent"` // 上下文占窗口百分比
	Compressed     bool `json:"compressed"`     // 是否触发了上下文压缩
}

// ToolCallPending is a lightweight notification sent as soon as the LLM
// starts generating a tool call (name known, arguments still streaming).
type ToolCallPending struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ShellOutput represents a chunk of real-time shell output.
type ShellOutput struct {
	Stream string `json:"stream"` // "stdout" or "stderr"
	Data   string `json:"data"`
}

// UIAction represents a UI action to be executed by the frontend.
type UIAction struct {
	Action string      `json:"action"` // "open_app", "open_path"
	Params interface{} `json:"params"`
}

// MediaAttachment represents a file/image sent to the user.
type MediaAttachment struct {
	NodeID   string `json:"nodeId"`             // storage node
	Path     string `json:"path"`               // file path
	FileName string `json:"fileName"`           // display name
	MimeType string `json:"mimeType,omitempty"` // e.g. "image/png", "application/pdf"
	Size     int64  `json:"size"`               // file size in bytes
	Caption  string `json:"caption,omitempty"`  // optional description
}

// ChatSink is the output interface for chat events.
type ChatSink interface {
	OnDelta(conversationID, text string)
	OnThinking(conversationID, text string)
	OnToolCallPending(conversationID string, pending ToolCallPending)
	OnToolCall(conversationID string, call ToolCall)
	OnToolResult(conversationID string, result ToolResult)
	OnShellOutput(conversationID string, toolCallID string, output ShellOutput)
	OnUIAction(conversationID string, action UIAction)
	OnMediaAttachment(conversationID string, attachment MediaAttachment)
	OnDone(conversationID string, fullText string, usage TokenUsage)
	OnError(conversationID string, err error)
	// OnSystemEvent sends a structured system event (e.g. status updates, conv switches).
	// msgType is the event type string, data is the JSON-serializable payload.
	OnSystemEvent(msgType string, data interface{})
}

// ExecResult holds the output of a sandbox code execution.
type ExecResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
}

// ToolDef describes a tool for the OpenAI function calling API.
type ToolDef struct {
	Type     string      `json:"type"`
	Function ToolFuncDef `json:"function"`
}

// ToolFuncDef is the function definition within a tool.
type ToolFuncDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

