package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

// OpenAI Responses API request types

type responsesRequest struct {
	Model        string              `json:"model"`
	Input        []responsesInput    `json:"input"`
	Instructions string              `json:"instructions,omitempty"`
	Tools        []responsesTool     `json:"tools,omitempty"`
	Stream       bool                `json:"stream"`
	MaxTokens    int                 `json:"max_output_tokens,omitempty"`
}

// responsesInput is a union type for input items.
// For messages: type="message", role, content
// For function calls: type="function_call", call_id, name, arguments
// For function outputs: type="function_call_output", call_id, output
type responsesInput struct {
	Type      string      `json:"type"`
	Role      string      `json:"role,omitempty"`
	Content   interface{} `json:"content,omitempty"`
	CallID    string      `json:"call_id,omitempty"`
	Name      string      `json:"name,omitempty"`
	Arguments string      `json:"arguments,omitempty"`
	Output    string      `json:"output,omitempty"`
	ID        string      `json:"id,omitempty"`
}

type responsesTool struct {
	Type        string      `json:"type"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

// toFcID ensures a tool call ID has the "fc_" prefix required by the Responses API.
// IDs from Chat Completions format (e.g. "call_xxx") are converted to "fc_xxx".
// IDs already starting with "fc_" or "fc-" are left as-is.
func toFcID(id string) string {
	if strings.HasPrefix(id, "fc_") || strings.HasPrefix(id, "fc-") {
		return id
	}
	if strings.HasPrefix(id, "call_") {
		return "fc_" + id[5:]
	}
	return "fc_" + id
}

// convertMessagesForResponses converts internal ChatMessages to Responses API input format.
// Returns the system instructions string and the input array.
func convertMessagesForResponses(messages []ChatMessage) (string, []responsesInput) {
	var instructions []string
	var input []responsesInput

	for _, msg := range messages {
		switch msg.Role {
		case "system":
			if text, ok := msg.Content.(string); ok {
				instructions = append(instructions, text)
			}

		case "user":
			text := extractTextContent(msg.Content)
			if text != "" {
				input = append(input, responsesInput{
					Type:    "message",
					Role:    "user",
					Content: text,
				})
			}

		case "assistant":
			// Add text content as a message if present
			text := extractTextContent(msg.Content)
			if text != "" {
				input = append(input, responsesInput{
					Type:    "message",
					Role:    "assistant",
					Content: text,
				})
			}
			// Add tool calls as function_call items
			for _, tc := range msg.ToolCalls {
				fcID := toFcID(tc.ID)
				input = append(input, responsesInput{
					Type:      "function_call",
					CallID:    fcID,
					Name:      tc.Function.Name,
					Arguments: tc.Function.Arguments,
					ID:        fcID,
				})
			}

		case "tool":
			// Tool results become function_call_output items
			input = append(input, responsesInput{
				Type:   "function_call_output",
				CallID: toFcID(msg.ToolCallID),
				Output: extractTextContent(msg.Content),
			})
		}
	}

	return strings.Join(instructions, "\n\n"), input
}

// convertToolsForResponses converts OpenAI-format tool definitions to Responses API format.
func convertToolsForResponses(tools []ToolDef) []responsesTool {
	if len(tools) == 0 {
		return nil
	}
	result := make([]responsesTool, 0, len(tools))
	for _, t := range tools {
		result = append(result, responsesTool{
			Type:        "function",
			Name:        t.Function.Name,
			Description: t.Function.Description,
			Parameters:  t.Function.Parameters,
		})
	}
	return result
}

// chatStreamResponses sends a streaming request using the OpenAI Responses API.
func chatStreamResponses(ctx context.Context, cfg AIConfig, messages []ChatMessage, tools []ToolDef, cb StreamCallback) ([]ToolCall, error) {
	instructions, input := convertMessagesForResponses(messages)
	respTools := convertToolsForResponses(tools)

	reqBody := responsesRequest{
		Model:        cfg.Model,
		Input:        input,
		Instructions: instructions,
		Tools:        respTools,
		Stream:       true,
	}
	if cfg.MaxTokens > 0 {
		reqBody.MaxTokens = cfg.MaxTokens
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	apiURL := strings.TrimRight(cfg.BaseURL, "/") + "/responses"

	resp, err := doAPIRequest(ctx, cfg, apiRequest{
		URL:  apiURL,
		Body: body,
		Headers: map[string]string{
			"Content-Type":    "application/json",
			"Authorization":   "Bearer " + cfg.APIKey,
			"Accept":          "text/event-stream",
			"Accept-Encoding": "identity",
		},
	})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Parse Responses API SSE stream
	// Track function calls by item ID
	type funcCallInfo struct {
		callID  string
		name    string
		argsJSON strings.Builder
	}
	funcCalls := make(map[string]*funcCallInfo) // keyed by item_id
	var funcCallOrder []string                   // preserve order
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
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		switch eventType {
		case "response.output_item.added":
			// A new output item was added — could be a message or function_call
			var ev struct {
				OutputIndex int `json:"output_index"`
				Item        struct {
					ID     string `json:"id"`
					Type   string `json:"type"`
					Name   string `json:"name,omitempty"`
					CallID string `json:"call_id,omitempty"`
				} `json:"item"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			if ev.Item.Type == "function_call" {
				fc := &funcCallInfo{
					callID: ev.Item.CallID,
					name:   ev.Item.Name,
				}
				if fc.callID == "" {
					fc.callID = ev.Item.ID
				}
				funcCalls[ev.Item.ID] = fc
				funcCallOrder = append(funcCallOrder, ev.Item.ID)
				cb(StreamDelta{ToolCallPending: &ToolCallPending{
					ID:   fc.callID,
					Name: fc.name,
				}})
			}

		case "response.output_text.delta":
			// Text content delta
			var ev struct {
				Delta string `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			if ev.Delta != "" {
				cb(StreamDelta{Content: ev.Delta})
			}

		case "response.function_call_arguments.delta":
			// Function call arguments streaming
			var ev struct {
				ItemID string `json:"item_id"`
				Delta  string `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			if fc, ok := funcCalls[ev.ItemID]; ok {
				fc.argsJSON.WriteString(ev.Delta)
			}

		case "response.reasoning_summary_text.delta":
			// Reasoning/thinking content
			var ev struct {
				Delta string `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			if ev.Delta != "" {
				cb(StreamDelta{Thinking: ev.Delta})
			}

		case "response.output_text.done":
			// Text output complete — no action needed

		case "response.function_call_arguments.done":
			// Function call arguments complete — no action needed

		case "response.output_item.done":
			// An output item is complete
			var ev struct {
				Item struct {
					Type string `json:"type"`
				} `json:"item"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}

		case "response.completed", "response.done":
			// Stream complete — check if response was truncated or incomplete
			var ev struct {
				Response struct {
					Status            string `json:"status"`
					IncompleteDetails *struct {
						Reason string `json:"reason"`
					} `json:"incomplete_details"`
				} `json:"response"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err == nil {
				if ev.Response.Status == "incomplete" {
					reason := "unknown"
					if ev.Response.IncompleteDetails != nil {
						reason = ev.Response.IncompleteDetails.Reason
					}
					log.Printf("[ai][responses] response incomplete, reason: %s", reason)
				}
			}
			if len(funcCalls) > 0 {
				isToolUse = true
			}
			cb(StreamDelta{Done: true, ToolUse: isToolUse})

		case "error":
			var ev struct {
				Error struct {
					Message string `json:"message"`
					Code    string `json:"code"`
				} `json:"error"`
			}
			if err := json.Unmarshal([]byte(data), &ev); err != nil {
				continue
			}
			return nil, fmt.Errorf("Responses API error: %s", ev.Error.Message)
		}

		eventType = ""
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read SSE stream: %w", err)
	}

	// Collect tool calls in order
	if len(funcCalls) == 0 {
		return nil, nil
	}
	var toolCalls []ToolCall
	for _, itemID := range funcCallOrder {
		fc := funcCalls[itemID]
		if fc == nil {
			continue
		}
		args := fc.argsJSON.String()
		if args == "" {
			args = "{}"
		}
		toolCalls = append(toolCalls, ToolCall{
			ID:   fc.callID,
			Type: "function",
			Function: FunctionCall{
				Name:      fc.name,
				Arguments: args,
			},
		})
	}

	return toolCalls, nil
}
