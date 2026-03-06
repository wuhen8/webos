package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Per-provider rate limiter: enforce minimum interval between API requests.
var (
	rateMu        sync.Mutex
	providerRates = make(map[string]*providerRate)

	// notifyRateLimit is a global callback for broadcasting rate limit notifications.
	// Set during AI initialization. Nil means no notification.
	notifyRateLimit func(level, title, message string)
)

const defaultRPM = 10

// SetNotifyRateLimitCallback sets the global callback for rate limit notifications.
// Call this during AI initialization to enable frontend notifications on 429.
func SetNotifyRateLimitCallback(fn func(level, title, message string)) {
	notifyRateLimit = fn
}

type providerRate struct {
	lastCall time.Time
}

// waitRateLimit blocks until at least the minimum interval (based on RPM) has passed
// since the last API call to the same provider (identified by baseURL).
func waitRateLimit(ctx context.Context, baseURL string, rpm int) error {
	if rpm <= 0 {
		rpm = defaultRPM
	}
	minInterval := time.Minute / time.Duration(rpm)

	rateMu.Lock()
	pr, ok := providerRates[baseURL]
	if !ok {
		pr = &providerRate{}
		providerRates[baseURL] = pr
	}
	elapsed := time.Since(pr.lastCall)
	wait := minInterval - elapsed
	if wait > 0 {
		// Reserve our slot now before releasing the lock
		pr.lastCall = time.Now().Add(wait)
	} else {
		pr.lastCall = time.Now()
	}
	rateMu.Unlock()

	if wait > 0 {
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return nil
}

const (
	retryBaseWait  = 10 * time.Second // initial backoff for retryable errors
	retryMaxWait   = 5 * time.Minute  // cap for exponential backoff
	maxRetryCount  = 5                // max retry attempts for 429/5xx/connection errors
)

// httpClient is a shared HTTP client with reasonable timeouts for streaming.
var httpClient = &http.Client{
	Timeout: 10 * time.Minute,
	Transport: &http.Transport{
		ResponseHeaderTimeout: 30 * time.Second,
	},
}

// apiRequest holds the parameters for an API request.
type apiRequest struct {
	URL     string
	Body    []byte
	Headers map[string]string
}

// doAPIRequest sends an HTTP POST with retry on 429/5xx/connection errors.
// Backoff starts at 10s, doubles each attempt, caps at 5 minutes.
// Max 5 attempts. Returns error if all retries exhausted.
func doAPIRequest(ctx context.Context, cfg AIConfig, ar apiRequest) (*http.Response, error) {
	wait := retryBaseWait

	for attempt := 1; attempt <= maxRetryCount; attempt++ {
		if err := waitRateLimit(ctx, cfg.BaseURL, cfg.RPM); err != nil {
			return nil, fmt.Errorf("rate limit wait cancelled: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, "POST", ar.URL, bytes.NewReader(ar.Body))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		for k, v := range ar.Headers {
			req.Header.Set(k, v)
		}

		resp, err := httpClient.Do(req)

		// Connection error — retryable
		if err != nil {
			log.Printf("[ai] 请求失败 (第%d次): %v, %s后重试", attempt, err, wait)
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			wait = nextBackoff(wait)
			continue
		}

		// 429 Too Many Requests — retryable
		if resp.StatusCode == http.StatusTooManyRequests {
			errBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("[ai] 触发速率限制 429 (第%d次): %s, %s后重试", attempt, string(errBody), wait)

			// Notify frontend on each 429 attempt
			if notifyRateLimit != nil {
				msg := fmt.Sprintf("触发速率限制 (第%d/%d次)，%v 后重试...", attempt, maxRetryCount, wait)
				notifyRateLimit("warning", "API 限速中", msg)
			}

			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			wait = nextBackoff(wait)
			continue
		}

		// 5xx Server Error — retryable
		if resp.StatusCode >= 500 {
			errBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("[ai] 服务端错误 %d (第%d次): %s, %s后重试", resp.StatusCode, attempt, string(errBody), wait)
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			wait = nextBackoff(wait)
			continue
		}

		// Other non-200 errors — not retryable
		if resp.StatusCode != http.StatusOK {
			errBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(errBody))
		}

		return resp, nil
	}

	// All retries exhausted
	return nil, fmt.Errorf("API 请求失败：重试次数已达上限 (%d 次)", maxRetryCount)
}

// nextBackoff doubles the wait time, capped at retryMaxWait.
func nextBackoff(current time.Duration) time.Duration {
	next := current * 2
	if next > retryMaxWait {
		next = retryMaxWait
	}
	return next
}

// StreamDelta represents one incremental chunk from the SSE stream.
type StreamDelta struct {
	Content         string           // text content delta
	Thinking        string           // reasoning/thinking content delta
	ToolCalls       []ToolCall       // tool call deltas (may have partial arguments)
	ToolCallPending *ToolCallPending // emitted once when a tool call name is first detected
	Done            bool             // true when finish_reason is present
	ToolUse         bool             // true when finish_reason == "tool_calls"
}

// StreamCallback is called for each SSE delta.
type StreamCallback func(delta StreamDelta)

// chatRequest is the request body for the chat completions API.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Tools       []ToolDef     `json:"tools,omitempty"`
	Stream      bool          `json:"stream"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature *float64      `json:"temperature,omitempty"`
}

// sseChoice is a partial parse of the SSE chunk.
type sseChoice struct {
	Delta struct {
		Content          string `json:"content,omitempty"`
		ReasoningContent string `json:"reasoning_content,omitempty"`
		ToolCalls        []struct {
			Index    int    `json:"index"`
			ID       string `json:"id,omitempty"`
			Type     string `json:"type,omitempty"`
			Function struct {
				Name      string `json:"name,omitempty"`
				Arguments string `json:"arguments,omitempty"`
			} `json:"function"`
		} `json:"tool_calls,omitempty"`
	} `json:"delta"`
	FinishReason *string `json:"finish_reason"`
}

type sseChunk struct {
	Choices []sseChoice `json:"choices"`
}

// ChatStream sends a streaming chat completion request and calls cb for each delta.
// It assembles tool_calls from incremental deltas and returns the final assembled list.
// Routes to the appropriate backend based on cfg.APIFormat.
func ChatStream(ctx context.Context, cfg AIConfig, messages []ChatMessage, tools []ToolDef, cb StreamCallback) ([]ToolCall, error) {
	switch cfg.APIFormat {
	case APIFormatAnthropic:
		return chatStreamAnthropic(ctx, cfg, messages, tools, cb)
	case APIFormatResponses:
		return chatStreamResponses(ctx, cfg, messages, tools, cb)
	default:
		return chatStreamOpenAI(ctx, cfg, messages, tools, cb)
	}
}

// chatStreamOpenAI sends a streaming chat completion request using the OpenAI-compatible API.
func chatStreamOpenAI(ctx context.Context, cfg AIConfig, messages []ChatMessage, tools []ToolDef, cb StreamCallback) ([]ToolCall, error) {
	reqBody := chatRequest{
		Model:    cfg.Model,
		Messages: messages,
		Tools:    tools,
		Stream:   true,
	}
	if cfg.MaxTokens > 0 {
		reqBody.MaxTokens = cfg.MaxTokens
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	apiURL := strings.TrimRight(cfg.BaseURL, "/") + "/chat/completions"

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

	// Parse SSE stream
	// Accumulate tool calls by index
	toolCallMap := make(map[int]*ToolCall)
	notifiedTools := make(map[int]bool) // track which tool calls have been notified as pending
	var isToolUse bool
	var inThinkTag bool       // tracking <think> tag state across deltas
	var tagBuf strings.Builder // buffer for partial tag detection

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		// Check cancellation on each SSE event so that stop takes effect promptly
		// even when buffered data is still available from the TCP connection.
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		// Check for stream-level error (e.g. minimax returns {"type":"error","error":{...}})
		var streamErr struct {
			Type  string `json:"type"`
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(data), &streamErr) == nil && streamErr.Type == "error" {
			return nil, fmt.Errorf("API stream error: %s", streamErr.Error.Message)
		}

		var chunk sseChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) == 0 {
			continue
		}

		choice := chunk.Choices[0]

		// Thinking/reasoning content delta (dedicated field)
		if choice.Delta.ReasoningContent != "" {
			cb(StreamDelta{Thinking: choice.Delta.ReasoningContent})
		}

		// Text content delta — detect <think> tags mixed into content
		if choice.Delta.Content != "" {
			tagBuf.WriteString(choice.Delta.Content)
			raw := tagBuf.String()
			tagBuf.Reset()

			for len(raw) > 0 {
				if inThinkTag {
					// Look for </think>
					idx := strings.Index(raw, "</think>")
					if idx == -1 {
						// Could be partial tag at end, e.g. "</thi"
						if len(raw) < len("</think>") && strings.HasPrefix("</think>", raw) {
							tagBuf.WriteString(raw)
							raw = ""
						} else {
							// Check if tail could be start of </think>
							emitted := raw
							for i := 1; i < len("</think>") && i < len(raw); i++ {
								tail := raw[len(raw)-i:]
								if strings.HasPrefix("</think>", tail) {
									emitted = raw[:len(raw)-i]
									tagBuf.WriteString(tail)
									break
								}
							}
							if emitted != "" {
								cb(StreamDelta{Thinking: emitted})
							}
							raw = ""
						}
					} else {
						// Emit thinking before the tag
						if idx > 0 {
							cb(StreamDelta{Thinking: raw[:idx]})
						}
						inThinkTag = false
						raw = raw[idx+len("</think>"):]
					}
				} else {
					// Look for <think>
					idx := strings.Index(raw, "<think>")
					if idx == -1 {
						// Strip stray </think> that may appear without a matching <think>
						cleaned := strings.ReplaceAll(raw, "</think>", "")
						// Check for partial tag at end
						emitted := cleaned
						for i := 1; i < len("<think>") && i < len(cleaned); i++ {
							tail := cleaned[len(cleaned)-i:]
							if strings.HasPrefix("<think>", tail) {
								emitted = cleaned[:len(cleaned)-i]
								tagBuf.WriteString(tail)
								break
							}
						}
						if emitted != "" {
							cb(StreamDelta{Content: emitted})
						}
						raw = ""
					} else {
						// Emit content before the tag
						if idx > 0 {
							cb(StreamDelta{Content: raw[:idx]})
						}
						inThinkTag = true
						raw = raw[idx+len("<think>"):]
					}
				}
			}
		}

		// Tool call deltas - accumulate by index
		// Must process BEFORE checking finish_reason, as the final chunk
		// may contain both the last arguments delta and finish_reason.
		for _, tc := range choice.Delta.ToolCalls {
			existing, ok := toolCallMap[tc.Index]
			if !ok {
				existing = &ToolCall{
					ID:   tc.ID,
					Type: tc.Type,
					Function: FunctionCall{
						Name: tc.Function.Name,
					},
				}
				toolCallMap[tc.Index] = existing
			} else {
				if tc.ID != "" {
					existing.ID = tc.ID
				}
				if tc.Type != "" {
					existing.Type = tc.Type
				}
				if tc.Function.Name != "" {
					existing.Function.Name = tc.Function.Name
				}
			}
			existing.Function.Arguments += tc.Function.Arguments

			// Emit ToolCallPending once when we have both ID and name
			if !notifiedTools[tc.Index] && existing.ID != "" && existing.Function.Name != "" {
				notifiedTools[tc.Index] = true
				cb(StreamDelta{ToolCallPending: &ToolCallPending{
					ID:   existing.ID,
					Name: existing.Function.Name,
				}})
			}
		}

		// Check finish reason
		if choice.FinishReason != nil {
			if *choice.FinishReason == "tool_calls" {
				isToolUse = true
			}
			cb(StreamDelta{Done: true, ToolUse: isToolUse})
			break
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read SSE stream: %w", err)
	}

	// Convert map to sorted slice
	if len(toolCallMap) == 0 {
		return nil, nil
	}
	result := make([]ToolCall, 0, len(toolCallMap))
	for i := 0; i < len(toolCallMap); i++ {
		if tc, ok := toolCallMap[i]; ok {
			result = append(result, *tc)
		}
	}
	return result, nil
}
