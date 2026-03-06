package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Anthropic Messages API request/response types

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	Tools     []anthropicTool    `json:"tools,omitempty"`
	Stream    bool               `json:"stream"`
}

type anthropicMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // string or []anthropicContentBlock
}

type anthropicContentBlock struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ID       string    `json:"id,omitempty"`        // for tool_use
	Name     string    `json:"name,omitempty"`       // for tool_use
	Input    any       `json:"input,omitempty"`      // for tool_use (json object)
	ToolUseID string   `json:"tool_use_id,omitempty"` // for tool_result
	Content   interface{} `json:"content,omitempty"`  // for tool_result (string or blocks)
	IsError  bool      `json:"is_error,omitempty"`   // for tool_result
	Source   *anthropicImageSource `json:"source,omitempty"` // for image
}

type anthropicImageSource struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // e.g. "image/jpeg"
	Data      string `json:"data"`       // base64 encoded
}

type anthropicTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"input_schema"`
}

// Anthropic SSE event types
type anthropicSSEEvent struct {
	Type string `json:"type"`
}

type anthropicContentBlockStart struct {
	Type         string `json:"type"`
	Index        int    `json:"index"`
	ContentBlock struct {
		Type  string `json:"type"`
		ID    string `json:"id,omitempty"`
		Name  string `json:"name,omitempty"`
		Text  string `json:"text,omitempty"`
		Input json.RawMessage `json:"input,omitempty"`
	} `json:"content_block"`
}

type anthropicContentBlockDelta struct {
	Type  string `json:"type"`
	Index int    `json:"index"`
	Delta struct {
		Type        string `json:"type"`
		Text        string `json:"text,omitempty"`
		PartialJSON string `json:"partial_json,omitempty"`
		Thinking    string `json:"thinking,omitempty"`
	} `json:"delta"`
}

type anthropicMessageDelta struct {
	Type  string `json:"type"`
	Delta struct {
		StopReason string `json:"stop_reason"`
	} `json:"delta"`
}

type anthropicErrorEvent struct {
	Type  string `json:"type"`
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// convertMessagesForAnthropic converts internal ChatMessages to Anthropic format.
// Returns the system prompt (extracted from system messages) and the converted messages.
func convertMessagesForAnthropic(messages []ChatMessage) (string, []anthropicMessage) {
	var systemParts []string
	var result []anthropicMessage

	for _, msg := range messages {
		switch msg.Role {
		case "system":
			if text, ok := msg.Content.(string); ok {
				systemParts = append(systemParts, text)
			}

		case "user":
			content := convertContentForAnthropic(msg.Content)
			result = append(result, anthropicMessage{Role: "user", Content: content})

		case "assistant":
			var blocks []anthropicContentBlock
			// Add text content if present
			if text := extractTextContent(msg.Content); text != "" {
				blocks = append(blocks, anthropicContentBlock{Type: "text", Text: text})
			}
			// Add tool_use blocks
			for _, tc := range msg.ToolCalls {
				var input interface{}
				if err := json.Unmarshal([]byte(tc.Function.Arguments), &input); err != nil {
					input = map[string]interface{}{}
				}
				blocks = append(blocks, anthropicContentBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Function.Name,
					Input: input,
				})
			}
			if len(blocks) > 0 {
				result = append(result, anthropicMessage{Role: "assistant", Content: blocks})
			} else if text := extractTextContent(msg.Content); text != "" {
				result = append(result, anthropicMessage{Role: "assistant", Content: text})
			}

		case "tool":
			// Tool results in Anthropic format go as user messages with tool_result content blocks
			block := anthropicContentBlock{
				Type:      "tool_result",
				ToolUseID: msg.ToolCallID,
				Content:   extractTextContent(msg.Content),
			}
			// Check if this is consecutive with other tool results
			if len(result) > 0 && result[len(result)-1].Role == "user" {
				if blocks, ok := result[len(result)-1].Content.([]anthropicContentBlock); ok {
					if len(blocks) > 0 && blocks[0].Type == "tool_result" {
						result[len(result)-1].Content = append(blocks, block)
						continue
					}
				}
			}
			result = append(result, anthropicMessage{Role: "user", Content: []anthropicContentBlock{block}})
		}
	}

	// Anthropic requires alternating user/assistant messages.
	// Merge consecutive same-role messages.
	result = mergeConsecutiveMessages(result)

	return strings.Join(systemParts, "\n\n"), result
}

// mergeConsecutiveMessages ensures no two consecutive messages have the same role.
func mergeConsecutiveMessages(messages []anthropicMessage) []anthropicMessage {
	if len(messages) == 0 {
		return messages
	}

	var merged []anthropicMessage
	for _, msg := range messages {
		if len(merged) > 0 && merged[len(merged)-1].Role == msg.Role {
			// Merge into previous message
			prev := &merged[len(merged)-1]
			prevBlocks := toContentBlocks(prev.Content)
			curBlocks := toContentBlocks(msg.Content)
			prev.Content = append(prevBlocks, curBlocks...)
		} else {
			merged = append(merged, msg)
		}
	}

	// Ensure first message is from user (Anthropic requirement)
	if len(merged) > 0 && merged[0].Role != "user" {
		merged = append([]anthropicMessage{{Role: "user", Content: "继续"}}, merged...)
	}

	return merged
}

// toContentBlocks converts message content to []anthropicContentBlock.
func toContentBlocks(content interface{}) []anthropicContentBlock {
	switch v := content.(type) {
	case []anthropicContentBlock:
		return v
	case string:
		if v == "" {
			return nil
		}
		return []anthropicContentBlock{{Type: "text", Text: v}}
	default:
		return nil
	}
}

// convertContentForAnthropic converts internal content to Anthropic format.
func convertContentForAnthropic(content interface{}) interface{} {
	switch v := content.(type) {
	case string:
		return v
	case []ContentPart:
		var blocks []anthropicContentBlock
		for _, p := range v {
			if p.Type == "text" {
				blocks = append(blocks, anthropicContentBlock{Type: "text", Text: p.Text})
			} else if p.Type == "image_url" && p.ImageURL != nil {
				// Parse data URL: data:mime;base64,data
				url := p.ImageURL.URL
				if strings.HasPrefix(url, "data:") {
					parts := strings.SplitN(url[5:], ";base64,", 2)
					if len(parts) == 2 {
						blocks = append(blocks, anthropicContentBlock{
							Type: "image",
							Source: &anthropicImageSource{
								Type:      "base64",
								MediaType: parts[0],
								Data:      parts[1],
							},
						})
						continue
					}
				}
				// Fallback: skip unsupported image format
			}
		}
		if len(blocks) == 0 {
			return ""
		}
		return blocks
	default:
		return ""
	}
}

// extractTextContent extracts plain text from content.
func extractTextContent(content interface{}) string {
	switch v := content.(type) {
	case string:
		return v
	case []ContentPart:
		var parts []string
		for _, p := range v {
			if p.Text != "" {
				parts = append(parts, p.Text)
			}
		}
		return strings.Join(parts, "\n")
	default:
		return ""
	}
}

// convertToolsForAnthropic converts OpenAI-format tool definitions to Anthropic format.
func convertToolsForAnthropic(tools []ToolDef) []anthropicTool {
	if len(tools) == 0 {
		return nil
	}
	result := make([]anthropicTool, 0, len(tools))
	for _, t := range tools {
		result = append(result, anthropicTool{
			Name:        t.Function.Name,
			Description: t.Function.Description,
			InputSchema: t.Function.Parameters,
		})
	}
	return result
}

// chatStreamAnthropic sends a streaming request to the Anthropic Messages API.
func chatStreamAnthropic(ctx context.Context, cfg AIConfig, messages []ChatMessage, tools []ToolDef, cb StreamCallback) ([]ToolCall, error) {
	systemPrompt, anthropicMsgs := convertMessagesForAnthropic(messages)
	anthropicTools := convertToolsForAnthropic(tools)

	maxTokens := cfg.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	reqBody := anthropicRequest{
		Model:     cfg.Model,
		MaxTokens: maxTokens,
		System:    systemPrompt,
		Messages:  anthropicMsgs,
		Tools:     anthropicTools,
		Stream:    true,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	apiURL := strings.TrimRight(cfg.BaseURL, "/")
	if strings.HasSuffix(apiURL, "/v1") {
		apiURL += "/messages"
	} else {
		apiURL += "/v1/messages"
	}

	resp, err := doAPIRequest(ctx, cfg, apiRequest{
		URL:  apiURL,
		Body: body,
		Headers: map[string]string{
			"Content-Type":      "application/json",
			"x-api-key":         cfg.APIKey,
			"anthropic-version": "2023-06-01",
			"Accept":            "text/event-stream",
			"Accept-Encoding":   "identity",
		},
	})
	if err != nil {
		return nil, err
	}

	// Context cancellation watcher: close response body when context is cancelled.
	// This unblocks scanner.Scan() which may be stuck in Read().
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			resp.Body.Close()
		case <-done:
		}
	}()
	defer func() {
		close(done)
		resp.Body.Close()
	}()

	// Parse Anthropic SSE stream
	// Track content blocks by index
	type blockInfo struct {
		blockType string // "text", "tool_use", "thinking"
		toolID    string
		toolName  string
		argsJSON  strings.Builder
	}
	blocks := make(map[int]*blockInfo)
	var isToolUse bool

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var eventType string

	for scanner.Scan() {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		line := scanner.Text()

		// SSE event type line
		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			// 检测非标准的裸 JSON 错误（某些代理/中转服务会直接发送错误 JSON）
			if strings.HasPrefix(line, "{") {
				var rawErr struct {
					Type  string `json:"type"`
					Error struct {
						Type    string `json:"type"`
						Message string `json:"message"`
					} `json:"error"`
				}
				if json.Unmarshal([]byte(line), &rawErr) == nil && rawErr.Error.Message != "" {
					return nil, fmt.Errorf("Anthropic API error: %s", rawErr.Error.Message)
				}
			}
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		switch eventType {
		case "content_block_start":
			var ev anthropicContentBlockStart
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			bi := &blockInfo{blockType: ev.ContentBlock.Type}
			if ev.ContentBlock.Type == "tool_use" {
				bi.toolID = ev.ContentBlock.ID
				bi.toolName = ev.ContentBlock.Name
				cb(StreamDelta{ToolCallPending: &ToolCallPending{
					ID:   ev.ContentBlock.ID,
					Name: ev.ContentBlock.Name,
				}})
			}
			blocks[ev.Index] = bi

		case "content_block_delta":
			var ev anthropicContentBlockDelta
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			bi := blocks[ev.Index]
			if bi == nil {
				continue
			}
			switch ev.Delta.Type {
			case "text_delta":
				if bi.blockType == "thinking" {
					cb(StreamDelta{Thinking: ev.Delta.Text})
				} else {
					cb(StreamDelta{Content: ev.Delta.Text})
				}
			case "thinking_delta":
				cb(StreamDelta{Thinking: ev.Delta.Thinking})
			case "input_json_delta":
				bi.argsJSON.WriteString(ev.Delta.PartialJSON)
			}

		case "message_delta":
			var ev anthropicMessageDelta
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			if ev.Delta.StopReason == "tool_use" {
				isToolUse = true
			}
			cb(StreamDelta{Done: true, ToolUse: isToolUse})

		case "error":
			var ev anthropicErrorEvent
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			return nil, fmt.Errorf("Anthropic stream error: %s", ev.Error.Message)

		case "message_stop":
			// Stream complete
		}

		eventType = ""
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read SSE stream: %w", err)
	}

	// Collect tool calls from blocks
	var toolCalls []ToolCall
	for i := 0; i < len(blocks); i++ {
		bi := blocks[i]
		if bi == nil || bi.blockType != "tool_use" {
			continue
		}
		args := bi.argsJSON.String()
		if args == "" {
			args = "{}"
		}
		toolCalls = append(toolCalls, ToolCall{
			ID:   bi.toolID,
			Type: "function",
			Function: FunctionCall{
				Name:      bi.toolName,
				Arguments: args,
			},
		})
	}

	return toolCalls, nil
}
