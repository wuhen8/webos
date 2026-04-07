package ai

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

const defaultSystemPrompt = `# 系统提示词

> system.md - 系统核心配置文档，定义 AI 的基础行为、工具使用规范、系统环境变量和约束

你是文件管理助手。你可以帮用户处理文件、执行代码、分析数据、管理系统。
当前时间：{{DATETIME}}（此为实时时间，每次请求更新，请以此为准，忽略历史消息中的旧时间）

## 数据目录
系统数据目录：{{DATA_DIR}}
文件工具（read_file、write_file、edit_file、list_files）使用相对路径时自动基于此目录解析，绝对路径原样使用。
用户说"打开 xxx 文件"且未给 / 开头路径时，视为相对路径。shell 工具中的路径不受此规则影响。

主要子目录：
- skills/    — AI 扩展技能（每个子目录是一个 skill）
- compose/   — Docker Compose 应用（每个子目录含 docker-compose.yml）
- webapps/   — 静态 Web 应用 & Wasm 应用
- uploads/   — 文件上传临时目录

## Skills 目录结构与规范
skills/ 根目录下的 .md 文件会全量加载到上下文：
- system.md — 系统提示词（即本文档），定义 AI 的基础行为。文件中 {{xxx}} 格式的是模板变量，加载时自动替换为实际值。编辑 system.md 时保留这些占位符原样
- 其他 .md — 辅助上下文，可用于记录长期记忆、用户偏好、项目笔记等，每次对话自动加载

当用户表达个人偏好、称呼习惯、常用配置等希望被长期记住的信息时，主动写入 skills/ 根目录的 memory.md（不存在则创建）。无需用户明确说"记住"，根据语义判断即可。

skills/ 下每个子目录是一个独立技能，目录名即技能名。启动时只读取每个 SKILL.md 的 frontmatter（name + description），不加载正文和脚本。
激活机制：用 activate_skill 激活后才加载完整正文（注入上下文）。同时最多激活 10 个，超出时自动淘汰最早的；技能数量多时用 search_skills 按关键词搜索再激活。结构：
skills/<name>/
  SKILL.md          — 必须，技能定义文件
  scripts/          — 可选，存放辅助脚本（.py 或 .sh），正文中指导 AI 用 shell 执行

SKILL.md 格式：
---
name: <与目录名一致>
description: <简短描述，含关键词供搜索匹配>
---
<正文：激活后注入给 AI 的指令，指导 AI 如何使用该技能>

规则：
- 激活后正文作为上下文注入，AI 按正文指令操作
- scripts/ 下的脚本由 AI 通过 shell 工具执行，不自动注册为工具
- 用户要求创建 skill 时，用 write_file 写入 skills/<name>/SKILL.md（和可选的 scripts/），然后提示用户重新激活

## 存储节点
{{STORAGE_NODES}}
文件工具直接操作存储节点，不经过 shell。

## shell 环境选择
shell 工具的 mode 参数决定执行环境：
- host：宿主机操作（文件管理、系统管理、docker 等）
- sandbox：隔离容器（运行不信任代码、安装临时依赖、数据处理脚本）
sandbox 下不能直接访问用户文件路径，需先用 download_to_sandbox 传入，处理完用 upload_from_sandbox 传回。

## 编写策略
- write_file：创建新文件或**完全覆盖**已有文件（会丢失原内容）
- edit_file：修改或追加已有文件内容（局部替换，保留其他内容）
- **规则**：操作已存在的文件时，尽量用 edit_file，非必要不要完全重写
- 生成超过200行的新文件时，先 write_file 写框架，再 edit_file 逐步填充

## 文件/目录引用
用户消息中 [文件: node_id:path] 或 [目录: node_id:path] 表示拖入的内容，提取 node_id 和 path 操作。

## 注意事项
- 内置工具优先，扩展技能仅在内置工具无法完成时激活
- 执行报错时分析错误并重试，不要轻易放弃
- 回复使用简洁中文
- 耗时任务不需要 AI 后续处理时用 submit_background_task
`

const defaultMaxToolRounds = 25

// Service is the AI chat orchestrator.
type Service struct {
	fileSvc *service.FileService
	tools   *ToolRegistry
	history *HistoryManager
	sandbox *Sandbox
	skills  *SkillsContext
	sysCtx  SystemContext

	Executor *AIExecutor // set after AIExecutor is created
}

// SetSystemContext injects the SystemContext into the tool registry.
// Called after executor is created (since SystemContext depends on executor.Status).
func (s *Service) SetSystemContext(sc SystemContext) {
	s.tools.sysCtx = sc
	s.sysCtx = sc
}

// GetSystemContext returns the SystemContext.
func (s *Service) GetSystemContext() SystemContext {
	return s.sysCtx
}

// NewService creates a new AI service.
func NewService(fileSvc *service.FileService) *Service {
	sandbox := NewSandbox()
	return &Service{
		fileSvc: fileSvc,
		tools:   NewToolRegistry(fileSvc, sandbox, nil),
		history: NewHistoryManager(),
		sandbox: sandbox,
	}
}

// ensureSkills initializes or refreshes the skills catalog.
// The catalog (name+description) is reloaded each time to pick up new skills.
// When the conversation changes, activated skills are cleared so updated
// SKILL.md files are re-read on next activate_skill call.
func (s *Service) ensureSkills(skillsDir, convID string) {
	if s.skills == nil || s.skills.SkillsDir != skillsDir {
		s.skills = LoadSkillsCatalog(skillsDir)
		s.skills.lastConvID = convID
		return
	}
	// Refresh catalog and system prompt
	fresh := LoadSkillsCatalog(skillsDir)
	s.skills.SystemPrompt = fresh.SystemPrompt
	s.skills.Catalog = fresh.Catalog
	// New conversation: clear activated cache
	if convID != s.skills.lastConvID {
		s.skills.mu.Lock()
		s.skills.Activated = make(map[string]*SkillActivation)
		s.skills.activOrder = nil
		s.skills.mu.Unlock()
		s.skills.lastConvID = convID
	}
}

// buildSystemPrompt constructs the system prompt from SkillsContext.
// Includes system.md content, storage node info, and skill catalog listing.
func buildSystemPrompt(sc *SkillsContext) string {
	// Build storage nodes info
	nodeInfo := "- local_1 (本地存储, 路径: 用户主目录)"
	nodes, err := database.ListStorageNodes()
	if err == nil && len(nodes) > 0 {
		var lines []string
		for _, n := range nodes {
			lines = append(lines, fmt.Sprintf("- %s: \"%s\" (类型: %s)", n.ID, n.Name, n.Type))
		}
		nodeInfo = strings.Join(lines, "\n")
	}

	// Start with system.md content
	prompt := strings.ReplaceAll(sc.SystemPrompt, "{{STORAGE_NODES}}", nodeInfo)
	prompt = strings.ReplaceAll(prompt, "{{DATA_DIR}}", config.DataDir())
	prompt = strings.ReplaceAll(prompt, "{{DATETIME}}", time.Now().Format("2006-01-02 15:04 (Mon)"))

	// Append skill info
	const catalogInlineThreshold = 10
	if len(sc.Catalog) > catalogInlineThreshold {
		prompt += fmt.Sprintf(`

## 扩展技能（Skills）
系统安装了 %d 个扩展技能。技能是独立于内置工具的外部扩展，需要先激活才能使用。

**使用原则**：
- 内置工具（shell、read_file、write_file、edit_file、list_files 等）始终可用，优先使用
- 只有当内置工具无法完成任务时，才使用 search_skills 搜索合适的技能，然后用 activate_skill 激活
- 不要对每个请求都搜索技能
`, len(sc.Catalog))
	} else if len(sc.Catalog) > 0 {
		var sb strings.Builder
		sb.WriteString(`

## 扩展技能（Skills）
以下是系统安装的扩展技能。技能是独立于内置工具的外部扩展，需要通过 activate_skill 激活后才能使用。

**使用原则**：
- 内置工具（shell、read_file、write_file、edit_file、list_files 等）始终可用，优先使用
- 只有当内置工具无法完成任务、且下方技能描述与用户需求高度匹配时，才激活对应技能

已安装的技能：
`)
		for _, entry := range sc.Catalog {
			sb.WriteString("- ")
			sb.WriteString(entry.Name)
			if entry.Description != "" {
				sb.WriteString(": ")
				sb.WriteString(entry.Description)
			}
			sb.WriteString("\n")
		}
		prompt += sb.String()
	}

	return prompt
}

// imageExts maps image file extensions to MIME types.
var imageExts = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
}

// fileRefRe matches [文件: node_id:path] and [目录: node_id:path] references in user messages.
var fileRefRe = regexp.MustCompile(`\[(?:文件|目录):\s*([^:\]]+):([^\]]+)\]`)

// processImageRefs scans a user message for file references pointing to images.
// If images are found, it returns a []ContentPart with text and image_url parts.
// Otherwise it returns the original string.
func (s *Service) processImageRefs(content string) interface{} {
	matches := fileRefRe.FindAllStringSubmatchIndex(content, -1)
	if len(matches) == 0 {
		return content
	}

	// Check if any matched reference is an image
	type imageRef struct {
		start, end int
		nodeID     string
		path       string
		mime       string
	}
	var imgRefs []imageRef
	for _, m := range matches {
		nodeID := content[m[2]:m[3]]
		path := content[m[4]:m[5]]
		ext := strings.ToLower(filepath.Ext(path))
		if mime, ok := imageExts[ext]; ok {
			imgRefs = append(imgRefs, imageRef{
				start:  m[0],
				end:    m[1],
				nodeID: nodeID,
				path:   path,
				mime:   mime,
			})
		}
	}

	if len(imgRefs) == 0 {
		return content
	}

	// Build multimodal content parts
	var parts []ContentPart
	cursor := 0
	for _, ref := range imgRefs {
		// Add text before this image reference
		if ref.start > cursor {
			text := strings.TrimSpace(content[cursor:ref.start])
			if text != "" {
				parts = append(parts, ContentPart{Type: "text", Text: text})
			}
		}

		// Read image file and encode as base64 data URL
		data, err := s.fileSvc.Read(ref.nodeID, ref.path)
		if err != nil {
			log.Printf("[ai] 读取图片失败 %s:%s: %v", ref.nodeID, ref.path, err)
			// Fallback: keep the original reference as text
			parts = append(parts, ContentPart{Type: "text", Text: content[ref.start:ref.end]})
		} else {
			b64 := base64.StdEncoding.EncodeToString(data)
			dataURL := fmt.Sprintf("data:%s;base64,%s", ref.mime, b64)
			parts = append(parts, ContentPart{
				Type:     "image_url",
				ImageURL: &ImageURL{URL: dataURL},
			})
		}
		cursor = ref.end
	}

	// Add remaining text after the last image reference
	if cursor < len(content) {
		text := strings.TrimSpace(content[cursor:])
		if text != "" {
			parts = append(parts, ContentPart{Type: "text", Text: text})
		}
	}

	// If we ended up with no parts (shouldn't happen), return original
	if len(parts) == 0 {
		return content
	}

	return parts
}

func isConversationInitMessage(msg string) bool {
	msg = strings.TrimSpace(msg)
	return strings.HasPrefix(msg, "[") && strings.HasSuffix(msg, "会话初始化]")
}

// HandleChat processes a user message in a conversation, streaming results to the sink.
func (s *Service) HandleChat(ctx context.Context, convID, userMsg, clientID, draftProviderID, draftModel string, sink ChatSink) {
	// Load AI config from preferences
	cfg, err := loadAIConfig(convID, draftProviderID, draftModel)
	if err != nil {
		sink.OnError(convID, fmt.Errorf("AI 未配置: %v", err))
		return
	}

	// Create or reuse conversation
	if convID == "" {
		convID = genID()
		title := userMsg
		if len(title) > 50 {
			title = title[:50] + "..."
		}
		if err := database.CreateConversation(convID, title, cfg.ProviderID, cfg.Model); err != nil {
			sink.OnError(convID, fmt.Errorf("创建对话失败: %v", err))
			return
		}
	} else {
		// 如果是已存在的会话，检查是否需要自动更新标题
		// 当标题为"新对话"且这是第一条用户消息时，用消息内容更新标题
		conv, err := database.GetConversation(convID)
		if err == nil && conv != nil && conv.Title == "新对话" {
			msgCount, _ := database.MessageCount(convID)
			if msgCount == 0 {
				title := userMsg
				if len(title) > 50 {
					title = title[:50] + "..."
				}
				database.UpdateConversationTitle(convID, title)
			}
		}
	}

	if isConversationInitMessage(userMsg) {
		database.TouchConversation(convID)
		return
	}

	// Save user message
	if err := s.history.SaveUserMessage(convID, userMsg); err != nil {
		sink.OnError(convID, fmt.Errorf("保存消息失败: %v", err))
		return
	}

	// Load history rows from database (needed for context compression)
	historyRows, err := database.ListMessages(convID)
	if err != nil {
		sink.OnError(convID, fmt.Errorf("加载历史失败: %v", err))
		return
	}
	history := rowsToMessages(historyRows)

	// Load skills (system.md is auto-generated if missing)
	skillsDir := config.SkillsDir()
	EnsureSystemSkill(skillsDir)
	s.ensureSkills(skillsDir, convID)
	skills := s.skills

	// Only the freshly submitted user message should be upgraded to multimodal input.
	// Historical image references stay as plain text so old images are not re-read and
	// re-sent to the model on every subsequent turn.
	if n := len(history); n > 0 && history[n-1].Role == "user" {
		if text, ok := history[n-1].Content.(string); ok {
			history[n-1].Content = s.processImageRefs(text)
		}
	}

	// Build context with compression if needed
	systemPrompt := buildSystemPrompt(skills)

	// Inject client context into system prompt so the model can reason about
	// routing targets such as `/ai @sinkId ...` and format constraints.
	if clientID != "" {
		if cc := GetClientContext(clientID); cc != nil {
			var clientInfo strings.Builder
			clientInfo.WriteString("\n\n## 当前客户端\n")
			clientInfo.WriteString(fmt.Sprintf("- client_id: %s\n", cc.ID))
			if cc.Platform != "" {
				clientInfo.WriteString(fmt.Sprintf("- platform: %s\n", cc.Platform))
			}
			if cc.DisplayName != "" {
				clientInfo.WriteString(fmt.Sprintf("- display_name: %s\n", cc.DisplayName))
			}
			if cc.SystemHint != "" {
				clientInfo.WriteString("\n")
				clientInfo.WriteString(cc.SystemHint)
			}
			systemPrompt += clientInfo.String()
		}
	}

	messages, compressed, err := BuildContext(ctx, *cfg, convID, systemPrompt, history, historyRows)
	if err != nil {
		sink.OnError(convID, fmt.Errorf("构建上下文失败: %v", err))
		return
	}

	// Track token usage
	var usage TokenUsage
	usage.Compressed = compressed

	// Inject context awareness into system message so the AI knows its context state
	{
		contextTokens := 0
		for _, m := range messages {
			contextTokens += EstimateMessageTokens(m)
		}
		maxInput := cfg.MaxInputTokens
		if maxInput <= 0 {
			maxInput = defaultMaxInputTokens
		}
		contextPercent := contextTokens * 100 / maxInput
		msgCount := len(messages) - 1 // exclude system message

		var ctxInfo strings.Builder
		ctxInfo.WriteString("\n\n## 当前上下文状态\n")
		ctxInfo.WriteString(fmt.Sprintf("- 上下文 tokens: ~%d / %d (%d%%)\n", contextTokens, maxInput, contextPercent))
		ctxInfo.WriteString(fmt.Sprintf("- 对话消息数: %d\n", msgCount))
		if compressed {
			ctxInfo.WriteString("- 上下文已压缩: 早期对话已被摘要替换，你可能丢失了部分细节\n")
		}
		if contextPercent >= 70 {
			ctxInfo.WriteString("- ⚠️ 上下文使用率较高，请在回复完用户当前问题后，自动调用斜杠命令工具执行 compress 命令压缩上下文，无需询问用户\n")
		}

		if sysContent, ok := messages[0].Content.(string); ok {
			messages[0].Content = sysContent + ctxInfo.String()
		}
	}

	// Dynamic tool list builder: built-in + skill management + activated skill tools
	buildAllTools := func() []ToolDef {
		tools := append([]ToolDef{}, s.tools.Defs()...)
		if len(skills.Catalog) > 0 {
			// Always provide activate_skill when skills exist
			tools = append(tools, activateSkillToolDef)
			// Only provide search_skills when catalog is too large to inline
			if len(skills.Catalog) > 10 {
				tools = append(tools, searchSkillsToolDef)
			}
		}
		return tools
	}
	allTools := buildAllTools()

	// Tool call loop
	maxRounds := cfg.MaxToolRounds
	if maxRounds <= 0 {
		maxRounds = defaultMaxToolRounds
	}

	// Loop protection: detect repeated failures and duplicate calls
	const maxConsecutiveErrors = 3
	consecutiveErrors := 0
	var lastCallSig string // "toolName:args" signature of last single tool call

	for round := 0; round < maxRounds; round++ {
		if ctx.Err() != nil {
			sink.OnError(convID, fmt.Errorf("对话已中断"))
			return
		}

		var fullText strings.Builder
		var fullThinking strings.Builder
		var toolCalls []ToolCall

		// Mark executor as streaming (busy) during API call
		if s.Executor != nil {
			s.Executor.SetStreaming(true)
		}
		toolCalls, err = ChatStream(ctx, *cfg, messages, allTools, func(delta StreamDelta) {
			if delta.Thinking != "" {
				fullThinking.WriteString(delta.Thinking)
				sink.OnThinking(convID, delta.Thinking)
			}
			if delta.Content != "" {
				fullText.WriteString(delta.Content)
				sink.OnDelta(convID, delta.Content)
			}
			if delta.ToolCallPending != nil {
				sink.OnToolCallPending(convID, *delta.ToolCallPending)
			}
		})

		// API call done — no longer streaming
		if s.Executor != nil {
			s.Executor.SetStreaming(false)
		}

		if err != nil {
			if ctx.Err() != nil {
				sink.OnError(convID, fmt.Errorf("对话已中断"))
			} else {
				sink.OnError(convID, fmt.Errorf("AI 请求失败: %v", err))
			}
			return
		}
		assistantContent := fullText.String()

		// Save assistant message
		savedToolIDs, _ := s.history.SaveAssistantMessage(convID, assistantContent, toolCalls, fullThinking.String())

		// If no tool calls, we're done
		if len(toolCalls) == 0 {
			database.TouchConversation(convID)
			// Calculate token usage
			usage.ContextTokens = 0
			for _, m := range messages {
				usage.ContextTokens += EstimateMessageTokens(m)
			}
			usage.ResponseTokens = EstimateTokens(assistantContent)
			maxInput := cfg.MaxInputTokens
			if maxInput <= 0 {
				maxInput = 128000
			}
			usage.ContextPercent = usage.ContextTokens * 100 / maxInput
			// Persist token usage to database
			if usageJSON, err := json.Marshal(usage); err == nil {
				database.UpdateLastAssistantTokenUsage(convID, string(usageJSON))
			}
			sink.OnDone(convID, assistantContent, usage)
			return
		}

		// Append assistant message with tool calls to messages (only valid ones)
		validToolCalls := make([]ToolCall, 0, len(toolCalls))
		for _, tc := range toolCalls {
			if savedToolIDs[tc.ID] {
				validToolCalls = append(validToolCalls, tc)
			}
		}
		if len(validToolCalls) == 0 {
			// All tool calls had invalid JSON args — treat as no tool calls
			database.TouchConversation(convID)
			usage.ContextTokens = 0
			for _, m := range messages {
				usage.ContextTokens += EstimateMessageTokens(m)
			}
			usage.ResponseTokens = EstimateTokens(assistantContent)
			maxInput := cfg.MaxInputTokens
			if maxInput <= 0 {
				maxInput = 128000
			}
			usage.ContextPercent = usage.ContextTokens * 100 / maxInput
			if usageJSON, err := json.Marshal(usage); err == nil {
				database.UpdateLastAssistantTokenUsage(convID, string(usageJSON))
			}
			sink.OnDone(convID, assistantContent, usage)
			return
		}
		messages = append(messages, ChatMessage{
			Role:      "assistant",
			Content:   assistantContent,
			ToolCalls: validToolCalls,
		})

		// Execute tool calls concurrently
		type toolResultItem struct {
			index  int
			tc     ToolCall
			result string
			isErr  bool
		}
		resultsCh := make(chan toolResultItem, len(validToolCalls))
		var wg sync.WaitGroup

		for i, tc := range validToolCalls {
			sink.OnToolCall(convID, tc)
			wg.Add(1)
			go func(idx int, tc ToolCall) {
				defer wg.Done()

				// Check cancellation before executing
				if ctx.Err() != nil {
					resultsCh <- toolResultItem{index: idx, tc: tc, result: "已取消", isErr: true}
					return
				}

				// Inject sink and toolCallID into context for shell streaming
				toolCtx := context.WithValue(ctx, sinkContextKey{}, sink)
				toolCtx = context.WithValue(toolCtx, toolCallIDContextKey{}, tc.ID)

				var result string
				var isErr bool

				if !json.Valid([]byte(tc.Function.Arguments)) {
					result = fmt.Sprintf("工具参数 JSON 不完整，无法执行 %s", tc.Function.Name)
					isErr = true
				} else if tc.Function.Name == "search_skills" {
					var p struct {
						Keyword string `json:"keyword"`
					}
					if err := json.Unmarshal([]byte(tc.Function.Arguments), &p); err != nil {
						result = "参数解析失败: " + err.Error()
						isErr = true
					} else {
						matches := skills.SearchSkills(p.Keyword, 20)
						if len(matches) == 0 {
							result = "没有找到匹配的技能"
						} else {
							var sb strings.Builder
							sb.WriteString(fmt.Sprintf("找到 %d 个匹配技能：\n", len(matches)))
							for _, m := range matches {
								sb.WriteString("- ")
								sb.WriteString(m.Name)
								if m.Description != "" {
									sb.WriteString(": ")
									sb.WriteString(m.Description)
								}
								sb.WriteString("\n")
							}
							sb.WriteString("\n使用 activate_skill 激活需要的技能。")
							result = sb.String()
						}
					}
				} else if tc.Function.Name == "activate_skill" {
					var p struct {
						SkillName string `json:"skill_name"`
					}
					if err := json.Unmarshal([]byte(tc.Function.Arguments), &p); err != nil {
						result = "参数解析失败: " + err.Error()
						isErr = true
					} else {
						act, actErr := skills.ActivateSkill(p.SkillName)
						if actErr != nil {
							result = "激活失败: " + actErr.Error()
							isErr = true
						} else {
							var sb strings.Builder
							sb.WriteString("技能已激活: ")
							sb.WriteString(p.SkillName)
							sb.WriteString("\n\n")
							sb.WriteString(act.Body)
							result = sb.String()
						}
					}
				} else {
					var execErr error
					result, execErr = s.tools.Execute(toolCtx, convID, tc.Function.Name, json.RawMessage(tc.Function.Arguments))
					if execErr != nil {
						result = "工具执行错误: " + execErr.Error()
						isErr = true
					}
				}

				resultsCh <- toolResultItem{index: idx, tc: tc, result: result, isErr: isErr}
			}(i, tc)
		}
		wg.Wait()
		close(resultsCh)

		cancelled := ctx.Err() != nil

		// Collect results and sort by original index
		items := make([]toolResultItem, 0, len(toolCalls))
		for item := range resultsCh {
			items = append(items, item)
		}
		// Sort by index to maintain order
		for i := 0; i < len(items); i++ {
			for j := i + 1; j < len(items); j++ {
				if items[j].index < items[i].index {
					items[i], items[j] = items[j], items[i]
				}
			}
		}

		for _, item := range items {
			toolResult := ToolResult{
				ToolCallID: item.tc.ID,
				Content:    item.result,
				IsError:    item.isErr,
			}
			sink.OnToolResult(convID, toolResult)

			// Save tool message
			s.history.SaveToolMessage(convID, item.tc.ID, item.result)

			// Append tool result to messages
			messages = append(messages, ChatMessage{
				Role:       "tool",
				Content:    item.result,
				ToolCallID: item.tc.ID,
			})
		}

		// If cancelled during tool execution, stop after saving results
		if cancelled {
			sink.OnError(convID, fmt.Errorf("对话已中断"))
			return
		}

		// Loop protection: check for consecutive errors and duplicate calls
		allFailed := true
		for _, item := range items {
			if !item.isErr {
				allFailed = false
				break
			}
		}
		if allFailed {
			consecutiveErrors++
		} else {
			consecutiveErrors = 0
		}
		if consecutiveErrors >= maxConsecutiveErrors {
			// Inject a system hint to stop retrying
			messages = append(messages, ChatMessage{
				Role:    "system",
				Content: fmt.Sprintf("工具已连续失败 %d 次，请停止重试，向用户说明失败原因和可能的解决方案。", consecutiveErrors),
			})
			consecutiveErrors = 0
		}

		// Detect duplicate single tool call (same tool + same args)
		if len(toolCalls) == 1 {
			sig := toolCalls[0].Function.Name + ":" + toolCalls[0].Function.Arguments
			if sig == lastCallSig {
				messages = append(messages, ChatMessage{
					Role:    "system",
					Content: "检测到重复的工具调用（相同工具和参数），请不要重复执行相同的操作，向用户说明当前情况。",
				})
				lastCallSig = ""
			} else {
				lastCallSig = sig
			}
		} else {
			lastCallSig = ""
		}

		// Continue loop - will call LLM again with tool results
		allTools = buildAllTools()
	}

	// If we exhausted rounds
	sink.OnError(convID, fmt.Errorf("工具调用轮次超过上限 (%d)", maxRounds))
}

// DeleteConversation removes a conversation and cleans up all associated resources:
// database records (messages, summaries, queue) and in-memory undo backups.
func (s *Service) DeleteConversation(convID string) error {
	// Clean up pending queue items for this conversation
	if _, err := database.DeletePendingAIQueueByConversation(convID); err != nil {
		log.Printf("[ai] 清理队列失败 conv=%s: %v", convID, err)
	}
	// Clean up in-memory undo backups
	s.tools.ClearBackups(convID)
	// Delete DB records (messages, summaries, conversation)
	return database.DeleteConversation(convID)
}

// Cleanup is a no-op now. The sandbox container is user-managed.
func (s *Service) Cleanup() {
	// Sandbox container lifecycle is managed by the user, not by us.
}

// loadAIConfig reads multi-provider AI configuration from preferences and resolves
// the provider+model for the target conversation.
func loadAIConfig(convID, providerID, model string) (*AIConfig, error) {
	multi, err := loadMultiConfig()
	if err != nil {
		return nil, err
	}
	return resolveConversationConfig(multi, convID, providerID, model)
}

func resolveConversationConfig(multi *AIMultiConfig, convID, providerID, model string) (*AIConfig, error) {
	if len(multi.Providers) == 0 {
		return nil, fmt.Errorf("AI 配置不完整，没有供应商")
	}

	provider, resolvedModel, err := resolveConversationSelection(multi, convID)
	if err != nil {
		return nil, err
	}
	if convID == "" && providerID != "" && model != "" {
		for i := range multi.Providers {
			if multi.Providers[i].ID == providerID {
				provider = &multi.Providers[i]
				resolvedModel = model
				break
			}
		}
	}
	return buildProviderConfig(provider, resolvedModel)
}

func resolveConversationSelection(multi *AIMultiConfig, convID string) (*AIProvider, string, error) {
	defaultProvider, defaultModel, err := getDefaultConversationModel(multi)
	if err != nil {
		return nil, "", err
	}
	if convID == "" {
		return defaultProvider, defaultModel, nil
	}

	conv, err := database.GetConversation(convID)
	if err != nil {
		return nil, "", err
	}
	if conv == nil {
		return nil, "", fmt.Errorf("对话不存在: %s", convID)
	}

	provider := defaultProvider
	if conv.ProviderID != "" {
		for i := range multi.Providers {
			if multi.Providers[i].ID == conv.ProviderID {
				provider = &multi.Providers[i]
				break
			}
		}
	}

	model := conv.Model
	if model == "" {
		if provider.ID == defaultProvider.ID {
			model = defaultModel
		} else if len(provider.Models) > 0 {
			model = provider.Models[0]
		}
	}
	if model == "" {
		return nil, "", fmt.Errorf("供应商 %s 没有配置模型", provider.Name)
	}
	for _, candidate := range provider.Models {
		if candidate == model {
			return provider, model, nil
		}
	}
	return nil, "", fmt.Errorf("供应商 %s 中未找到模型: %s", provider.Name, model)
}

func getDefaultConversationModel(multi *AIMultiConfig) (*AIProvider, string, error) {
	if len(multi.Providers) == 0 {
		return nil, "", fmt.Errorf("AI 配置不完整，没有供应商")
	}
	provider := &multi.Providers[0]
	if provider.BaseURL == "" || provider.APIKey == "" {
		return nil, "", fmt.Errorf("供应商 %s 配置不完整，需要 baseUrl 和 apiKey", provider.Name)
	}
	if len(provider.Models) == 0 || provider.Models[0] == "" {
		return nil, "", fmt.Errorf("供应商 %s 没有配置模型", provider.Name)
	}
	return provider, provider.Models[0], nil
}

func buildProviderConfig(provider *AIProvider, model string) (*AIConfig, error) {
	if provider == nil {
		return nil, fmt.Errorf("AI 配置不完整，没有供应商")
	}
	if provider.BaseURL == "" || provider.APIKey == "" {
		return nil, fmt.Errorf("供应商 %s 配置不完整，需要 baseUrl 和 apiKey", provider.Name)
	}
	if model == "" {
		return nil, fmt.Errorf("供应商 %s 没有配置模型", provider.Name)
	}

	apiFormat := provider.APIFormat
	if apiFormat == "" {
		apiFormat = APIFormatOpenAI
	}

	return &AIConfig{
		ProviderID:     provider.ID,
		ProviderName:   provider.Name,
		BaseURL:        provider.BaseURL,
		APIKey:         provider.APIKey,
		Model:          model,
		APIFormat:      apiFormat,
		Proxy:          provider.Proxy,
		MaxTokens:      provider.MaxTokens,
		MaxInputTokens: provider.MaxInputTokens,
		MaxToolRounds:  provider.MaxToolRounds,
		RPM:            provider.RPM,
		RecentMessages: provider.RecentMessages,
	}, nil
}

func genID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
