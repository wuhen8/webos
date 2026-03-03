package ai

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"webos-backend/internal/database"
)

// CommandDef defines a slash command.
type CommandDef struct {
	Name          string   // e.g. "reset"
	Aliases       []string // e.g. ["clear"]
	Description   string   // shown in /help and autocomplete
	Category      string   // "chat", "config", "system"
	CategoryLabel string   // display label, e.g. "💬 对话"
	CategoryOrder int      // sort weight (lower = first)
	Args          string   // argument hint, e.g. "<provider/model>"
	Hidden        bool     // hidden from /help listing
}

// CommandResult is returned after executing a command.
type CommandResult struct {
	Text    string // response text (markdown ok)
	IsError bool
	// Action flags — the handler checks these to decide what to do next.
	ClearHistory bool   // /reset: clear conversation history
	StopChat     bool   // /stop: cancel active generation
	SwitchModel  string // /model <ref>: switch active model
}

// commandRegistry holds all registered slash commands.
var commandRegistry []CommandDef

func init() {
	commandRegistry = []CommandDef{
		{
			Name:          "help",
			Description:   "显示所有可用的斜杠命令",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
		},
		{
			Name:          "reset",
			Aliases:       []string{"clear"},
			Description:   "清空当前对话历史，开始新对话",
			Category:      "chat",
			CategoryLabel: "💬 对话",
			CategoryOrder: 10,
		},
		{
			Name:          "model",
			Description:   "切换当前使用的 AI 模型",
			Category:      "config",
			CategoryLabel: "⚙️ 配置",
			CategoryOrder: 20,
			Args:          "<供应商名/模型名>",
		},
		{
			Name:          "models",
			Description:   "列出所有可用的模型",
			Category:      "config",
			CategoryLabel: "⚙️ 配置",
			CategoryOrder: 20,
		},
		{
			Name:          "stop",
			Description:   "停止当前正在进行的 AI 生成",
			Category:      "chat",
			CategoryLabel: "💬 对话",
			CategoryOrder: 10,
		},
		{
			Name:          "config",
			Description:   "显示当前 AI 配置摘要",
			Category:      "config",
			CategoryLabel: "⚙️ 配置",
			CategoryOrder: 20,
		},
		{
			Name:          "tasks",
			Aliases:       []string{"t"},
			Description:   "列出所有后台任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
		},
		{
			Name:          "cancel",
			Description:   "取消指定任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "<任务ID>",
		},
		{
			Name:          "restart",
			Description:   "重启服务（延迟500ms后退出，由 systemctl 重启）",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
		},
		{
			Name:          "status",
			Description:   "系统健康状态",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
		},
		{
			Name:          "compress",
			Description:   "手动压缩当前对话上下文（生成摘要替代早期消息）",
			Category:      "chat",
			CategoryLabel: "💬 对话",
			CategoryOrder: 10,
		},
		{
			Name:          "conv list",
			Description:   "列出所有对话",
			Category:      "conv",
			CategoryLabel: "📋 会话管理",
			CategoryOrder: 15,
		},
		{
			Name:          "conv switch",
			Description:   "切换活跃对话",
			Category:      "conv",
			CategoryLabel: "📋 会话管理",
			CategoryOrder: 15,
			Args:          "<id>",
		},
		{
			Name:          "conv new",
			Description:   "创建新对话并激活",
			Category:      "conv",
			CategoryLabel: "📋 会话管理",
			CategoryOrder: 15,
		},
		{
			Name:          "notify",
			Description:   "系统通知：list 查看客户端 / 直接发广播 / @id 定向发送",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "[list | <消息> | @客户端ID <消息>]",
		},
		{
			Name:          "jobs",
			Description:   "列出所有定时任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
		},
		{
			Name:          "job run",
			Description:   "立即执行指定定时任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "<任务ID>",
		},
		{
			Name:          "job enable",
			Description:   "启用指定定时任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "<任务ID>",
		},
		{
			Name:          "job disable",
			Description:   "禁用指定定时任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "<任务ID>",
		},
		{
			Name:          "job delete",
			Description:   "删除指定定时任务",
			Category:      "system",
			CategoryLabel: "🔧 系统",
			CategoryOrder: 30,
			Args:          "<任务ID>",
		},
	}
}

// ListCommands returns all non-hidden command definitions.
func ListCommands() []CommandDef {
	var out []CommandDef
	for _, c := range commandRegistry {
		if !c.Hidden {
			out = append(out, c)
		}
	}
	return out
}

// ParseCommand checks if text starts with "/" and parses it into command name + args.
// Returns ("", "", false) if not a command.
func ParseCommand(text string) (name string, args string, ok bool) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/") {
		return "", "", false
	}
	// Strip the leading /
	body := text[1:]
	if body == "" {
		return "", "", false
	}
	// Split into command and args
	parts := strings.SplitN(body, " ", 2)
	name = strings.ToLower(strings.TrimSpace(parts[0]))
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}
	return name, args, true
}

// ResolveCommand finds the CommandDef matching the given name or alias.
func ResolveCommand(name string) *CommandDef {
	for i := range commandRegistry {
		if commandRegistry[i].Name == name {
			return &commandRegistry[i]
		}
		for _, alias := range commandRegistry[i].Aliases {
			if alias == name {
				return &commandRegistry[i]
			}
		}
	}
	return nil
}

// ExecuteCommand runs a slash command and returns the result.
// It does NOT perform side effects like clearing DB or stopping chat —
// those are signaled via flags in CommandResult for the caller to handle.
func (s *Service) ExecuteCommand(convID, cmdName, cmdArgs string) CommandResult {
	// Empty convID → use active conversation
	if convID == "" && s.Executor != nil {
		convID = s.Executor.GetActiveConvID()
	}
	switch cmdName {
	case "help":
		return s.cmdHelp()
	case "reset", "clear":
		return CommandResult{
			Text:         "对话已重置。",
			ClearHistory: true,
		}
	case "host":
		return CommandResult{
			Text: "全局执行模式已移除。AI 现在通过 shell 工具的 mode 参数自主选择执行环境（host/sandbox）。",
		}
	case "sandbox":
		return CommandResult{
			Text: "全局执行模式已移除。AI 现在通过 shell 工具的 mode 参数自主选择执行环境（host/sandbox）。",
		}
	case "mode":
		return CommandResult{Text: "全局执行模式已移除。AI 现在通过 shell 工具的 mode 参数自主选择执行环境（host/sandbox）。"}
	case "model":
		return s.cmdModel(cmdArgs)
	case "models":
		return s.cmdModels()
	case "stop":
		return CommandResult{
			Text:     "已停止生成。",
			StopChat: true,
		}
	case "config":
		return s.cmdConfig()
	case "tasks", "t":
		return s.cmdTasks()
	case "cancel":
		return s.cmdCancel(cmdArgs)
	case "restart":
		return s.cmdRestart()
	case "status":
		return s.cmdStatus()
	case "compress":
		return s.cmdCompress(convID)
	case "conv":
		return s.cmdConv(cmdArgs)
	case "notify":
		return s.cmdNotify(cmdArgs)
	case "jobs":
		return s.cmdJobs()
	case "job":
		return s.cmdJob(cmdArgs)
	default:
		return CommandResult{
			Text:    fmt.Sprintf("未知命令: /%s\n输入 /help 查看可用命令。", cmdName),
			IsError: true,
		}
	}
}

func (s *Service) cmdHelp() CommandResult {
	// Dynamically derive categories from the registry — no hardcoded list needed.
	type catInfo struct {
		label string
		order int
		cmds  []CommandDef
	}
	catMap := make(map[string]*catInfo)
	for _, c := range commandRegistry {
		if c.Hidden {
			continue
		}
		ci, ok := catMap[c.Category]
		if !ok {
			ci = &catInfo{label: c.CategoryLabel, order: c.CategoryOrder}
			if ci.label == "" {
				ci.label = c.Category
			}
			catMap[c.Category] = ci
		}
		ci.cmds = append(ci.cmds, c)
	}

	// Sort categories by order
	cats := make([]string, 0, len(catMap))
	for k := range catMap {
		cats = append(cats, k)
	}
	sort.Slice(cats, func(i, j int) bool {
		return catMap[cats[i]].order < catMap[cats[j]].order
	})

	var sb strings.Builder
	sb.WriteString("**可用命令：**\n\n")
	for _, cat := range cats {
		ci := catMap[cat]
		sort.Slice(ci.cmds, func(i, j int) bool { return ci.cmds[i].Name < ci.cmds[j].Name })
		sb.WriteString(ci.label + "\n")
		for _, c := range ci.cmds {
			sb.WriteString(fmt.Sprintf("  `/%s`", c.Name))
			if c.Args != "" {
				sb.WriteString(fmt.Sprintf(" %s", c.Args))
			}
			sb.WriteString(fmt.Sprintf(" — %s", c.Description))
			if len(c.Aliases) > 0 {
				aliases := make([]string, len(c.Aliases))
				for i, a := range c.Aliases {
					aliases[i] = "/" + a
				}
				sb.WriteString(fmt.Sprintf("（别名: %s）", strings.Join(aliases, ", ")))
			}
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}
	return CommandResult{Text: sb.String()}
}

func (s *Service) cmdModel(args string) CommandResult {
	if args == "" {
		cfg, err := loadAIConfig()
		if err != nil {
			return CommandResult{Text: "AI 未配置。", IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("当前模型: **%s**\n\n使用 `/model <供应商名/模型名>` 切换模型，或 `/models` 查看所有可用模型。", cfg.Model)}
	}

	provName, modelName, ref, err := ActionSwitchModel(args)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{
		Text:        fmt.Sprintf("已切换到: **%s / %s**", provName, modelName),
		SwitchModel: ref,
	}
}

func (s *Service) cmdModels() CommandResult {
	models, err := ActionListModels()
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}

	var sb strings.Builder
	sb.WriteString("**可用模型：**\n\n")
	lastProvider := ""
	for _, m := range models {
		if m.Provider != lastProvider {
			if lastProvider != "" {
				sb.WriteString("\n")
			}
			sb.WriteString(fmt.Sprintf("**%s**\n", m.Provider))
			lastProvider = m.Provider
		}
		marker := "  "
		if m.Active {
			marker = "→ "
		}
		sb.WriteString(fmt.Sprintf("%s`%s`\n", marker, m.Model))
	}
	sb.WriteString("\n使用 `/model <模型名>` 或 `/model <供应商名/模型名>` 切换。")
	return CommandResult{Text: sb.String()}
}

func (s *Service) cmdConfig() CommandResult {
	model, maxTokens, maxToolRounds, skillsDir, providerCount, err := ActionGetConfig()
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	var sb strings.Builder
	sb.WriteString("**当前配置：**\n\n")
	sb.WriteString(fmt.Sprintf("- 模型: `%s`\n", model))
	sb.WriteString(fmt.Sprintf("- Max Tokens: `%d`\n", maxTokens))
	sb.WriteString(fmt.Sprintf("- 工具调用轮次上限: `%d`\n", maxToolRounds))
	sb.WriteString(fmt.Sprintf("- Skills 目录: `%s`\n", skillsDir))
	if providerCount > 0 {
		sb.WriteString(fmt.Sprintf("- 供应商数量: `%d`\n", providerCount))
	}
	return CommandResult{Text: sb.String()}
}

func (s *Service) cmdTasks() CommandResult {
	list := ActionListTasks("")
	if len(list) == 0 {
		return CommandResult{Text: "当前没有后台任务。"}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**后台任务 (%d)：**\n\n", len(list)))
	sb.WriteString("| ID | 标题 | 类别 | 状态 | 运行时长 | 信息 |\n")
	sb.WriteString("|---|---|---|---|---|---|\n")
	for _, t := range list {
		category := t.Category
		if category == "" {
			category = "-"
		}
		message := t.Message
		if len(message) > 40 {
			message = message[:40] + "..."
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s | %s | %s |\n",
			t.ID, t.Title, category, t.Status, t.Duration, message))
	}
	sb.WriteString("\n使用 `/cancel <ID>` 取消运行中的任务。")
	return CommandResult{Text: sb.String()}
}

func (s *Service) cmdCancel(args string) CommandResult {
	id := strings.TrimSpace(args)
	if id == "" {
		return CommandResult{Text: "用法: `/cancel <任务ID>`\n使用 `/tasks` 查看任务列表。", IsError: true}
	}
	if ActionCancelTask(id) {
		return CommandResult{Text: fmt.Sprintf("已取消任务 `%s`。", id)}
	}
	return CommandResult{Text: fmt.Sprintf("任务 `%s` 不存在或已结束。", id), IsError: true}
}

func (s *Service) cmdRestart() CommandResult {
	go func() {
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()
	return CommandResult{Text: "服务将在 500ms 后重启..."}
}


func (s *Service) cmdCompress(convID string) CommandResult {
	result, err := ActionCompress(convID)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{
		Text: fmt.Sprintf("上下文压缩完成。\n\n- 压缩前: %d 条消息，约 %d tokens\n- 压缩了 %d 条消息（约 %d tokens）→ 摘要（约 %d tokens）\n- 保留最近 %d 条消息",
			result.TotalMessages, result.TotalTokens, result.CompressedCount, result.CompressedTokens, result.SummaryTokens, result.KeptMessages),
	}
}


func (s *Service) cmdStatus() CommandResult {
	snap := s.sysCtx.Snapshot()
	h := snap.Health
	e := snap.Executor
	var sb strings.Builder
	sb.WriteString("**系统状态：**\n\n")
	sb.WriteString(fmt.Sprintf("- AI 状态: `%s`\n", e.State))
	if e.RunningConvID != "" {
		sb.WriteString(fmt.Sprintf("- 正在运行: `%s`\n", e.RunningConvTitle))
	}
	if e.QueueSize > 0 {
		sb.WriteString(fmt.Sprintf("- 队列: `%d` 条待处理\n", e.QueueSize))
	}
	sb.WriteString(fmt.Sprintf("- Go 协程: `%d`\n", h.Goroutines))
	sb.WriteString(fmt.Sprintf("- 后台任务运行中: `%d`\n", h.TasksRunning))
	sb.WriteString(fmt.Sprintf("- 内存: `%.1f MB` (Sys: `%.1f MB`)\n", h.MemAllocMB, h.MemSysMB))
	sb.WriteString(fmt.Sprintf("- CPU 核心: `%d`\n", h.NumCPU))
	if len(snap.Storage) > 0 {
		sb.WriteString(fmt.Sprintf("- 存储节点: `%d` 个\n", len(snap.Storage)))
	}
	if len(snap.Jobs) > 0 {
		sb.WriteString(fmt.Sprintf("- 定时任务: `%d` 个\n", len(snap.Jobs)))
	}

	// 上下文状态（激活会话）
	convID := ""
	if s.Executor != nil {
		convID = s.Executor.GetActiveConvID()
	}
	if convID != "" {
		cs := NewChatService(s.Executor, s)
		if ctx, err := cs.GetContextStatus(convID); err == nil && ctx.MessageCount > 0 {
			sb.WriteString("\n**上下文状态：**\n\n")
			sb.WriteString(fmt.Sprintf("- 模型: `%s`\n", ctx.Model))
			sb.WriteString(fmt.Sprintf("- 消息数: `%d`\n", ctx.MessageCount))
			sb.WriteString(fmt.Sprintf("- 上下文 Token: `%d` / `%d` (`%d%%`)\n", ctx.ContextTokens, ctx.ContextWindow, ctx.ContextPercent))
			if ctx.HasSummary {
				sb.WriteString(fmt.Sprintf("- 摘要: 已压缩 (覆盖到消息 #%d)\n", ctx.SummaryUpToID))
			} else {
				sb.WriteString("- 摘要: 无\n")
			}
			if ctx.Compressed {
				sb.WriteString("- 截断: 是 (早期消息已丢弃)\n")
			}
		}
	}

	return CommandResult{Text: sb.String()}
}

// HandleCommandResult processes the side effects of a CommandResult.
// All clients should call this after ExecuteCommand.
func (s *Service) HandleCommandResult(convID string, result CommandResult) {
	if result.StopChat {
		if s.Executor != nil {
			s.Executor.Stop()
		} else {
			s.StopChat(convID)
		}
	}
	if result.SwitchModel != "" {
		s.applySwitchModel(result.SwitchModel)
	}
}

// applySwitchModel persists a model switch to the preferences DB.
// ref format: "providerID/modelName"
func (s *Service) applySwitchModel(ref string) {
	parts := strings.SplitN(ref, "/", 2)
	if len(parts) != 2 {
		return
	}
	multi, err := loadMultiConfig()
	if err != nil {
		return
	}
	multi.ActiveProvider = parts[0]
	multi.ActiveModel = parts[1]
	b, err := json.Marshal(multi)
	if err != nil {
		return
	}
	database.SetPreference("ai_config", string(b))
}

// loadMultiConfig reads the raw multi-provider config from preferences.
func loadMultiConfig() (*AIMultiConfig, error) {
	db := database.DB()
	var val string
	err := db.QueryRow("SELECT value FROM preferences WHERE key = 'ai_config'").Scan(&val)
	if err != nil {
		return nil, fmt.Errorf("请先配置 AI")
	}
	var raw string
	if err := json.Unmarshal([]byte(val), &raw); err != nil {
		raw = val
	}
	var multi AIMultiConfig
	if err := json.Unmarshal([]byte(raw), &multi); err != nil {
		return nil, fmt.Errorf("配置格式错误: %v", err)
	}
	return &multi, nil
}

// cmdConv dispatches /conv subcommands.
func (s *Service) cmdConv(args string) CommandResult {
	parts := strings.SplitN(args, " ", 2)
	sub := strings.TrimSpace(parts[0])
	subArgs := ""
	if len(parts) > 1 {
		subArgs = strings.TrimSpace(parts[1])
	}

	switch sub {
	case "list":
		return s.cmdConvList()
	case "switch":
		return s.cmdConvSwitch(subArgs)
	case "new":
		return s.cmdConvNew()
	default:
		return CommandResult{
			Text:    "用法: /conv list | /conv switch <id> | /conv new",
			IsError: true,
		}
	}
}

// cmdConvList returns all conversations.
func (s *Service) cmdConvList() CommandResult {
	convs, err := database.ListConversations()
	if err != nil {
		return CommandResult{Text: "查询对话列表失败: " + err.Error(), IsError: true}
	}
	if len(convs) == 0 {
		return CommandResult{Text: "暂无对话。"}
	}

	var sb strings.Builder
	sb.WriteString("对话列表：\n\n")
	for _, c := range convs {
		sb.WriteString(fmt.Sprintf("- `%s` %s\n", c.ID, c.Title))
	}
	return CommandResult{Text: sb.String()}
}

// cmdConvSwitch switches the active conversation.
func (s *Service) cmdConvSwitch(args string) CommandResult {
	convID := strings.TrimSpace(args)
	if convID == "" {
		return CommandResult{Text: "用法: /conv switch <id>", IsError: true}
	}

	// Verify conversation exists
	convs, err := database.ListConversations()
	if err != nil {
		return CommandResult{Text: "查询对话失败: " + err.Error(), IsError: true}
	}
	found := false
	for _, c := range convs {
		if c.ID == convID {
			found = true
			break
		}
	}
	if !found {
		return CommandResult{Text: "对话不存在: " + convID, IsError: true}
	}

	if s.Executor != nil {
		result := s.Executor.SwitchConv(convID)
		if !result.OK {
			return CommandResult{
				Text:    fmt.Sprintf("无法切换：「%s」正在运行中，请先发送 /stop 停止", result.RunningConvTitle),
				IsError: true,
			}
		}
	}
	return CommandResult{Text: "已切换到对话: " + convID}
}

// cmdConvNew creates a new conversation and sets it as active.
func (s *Service) cmdConvNew() CommandResult {
	convID := genID()
	title := "新对话"
	if err := database.CreateConversation(convID, title); err != nil {
		return CommandResult{Text: "创建对话失败: " + err.Error(), IsError: true}
	}

	if s.Executor != nil {
		result := s.Executor.SwitchConv(convID)
		if !result.OK {
			return CommandResult{
				Text:    fmt.Sprintf("对话已创建 `%s`，但无法激活：「%s」正在运行中，请先发送 /stop 停止", convID, result.RunningConvTitle),
				IsError: true,
			}
		}
	}
	return CommandResult{Text: fmt.Sprintf("已创建新对话: `%s`", convID)}
}
func (s *Service) cmdNotify(args string) CommandResult {
	args = strings.TrimSpace(args)

	// /notify list — 列出所有已连接的 sink
	if args == "" || args == "list" {
		ids := s.Executor.GetBroadcastSink().SinkIDs()
		sort.Strings(ids)
		if len(ids) == 0 {
			return CommandResult{Text: "当前没有已连接的客户端。"}
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("**已连接客户端 (%d)：**\n\n", len(ids)))
		for _, id := range ids {
			sb.WriteString(fmt.Sprintf("- `%s`\n", id))
		}
		return CommandResult{Text: sb.String()}
	}

	// /notify @sinkId <message> — 定向发送
	sink := s.Executor.GetBroadcastSink()
	data := map[string]string{
		"level":  "info",
		"title":  "系统通知",
		"source": "command",
	}

	if strings.HasPrefix(args, "@") {
		parts := strings.SplitN(args, " ", 2)
		target := strings.TrimPrefix(parts[0], "@")
		if len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
			return CommandResult{Text: "用法: /notify @sinkId <消息内容>", IsError: true}
		}
		msg := strings.TrimSpace(parts[1])
		data["message"] = msg
		if !sink.SendToSystemEvent(target, "system_notify", data) {
			return CommandResult{Text: fmt.Sprintf("客户端 `%s` 不存在或已断开", target), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("已发送通知到 `%s`: %s", target, msg)}
	}

	// /notify <message> — 广播
	data["message"] = args
	sink.OnSystemEvent("system_notify", data)
	return CommandResult{Text: fmt.Sprintf("已广播通知: %s", args)}
}

func (s *Service) cmdJobs() CommandResult {
	jobs := ActionListScheduledJobs()
	if len(jobs) == 0 {
		return CommandResult{Text: "当前没有定时任务。"}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**定时任务 (%d)：**\n\n", len(jobs)))
	sb.WriteString("| ID | 名称 | 类型 | 计划 | 状态 | 启用 |\n")
	sb.WriteString("|---|---|---|---|---|---|\n")
	for _, j := range jobs {
		enabled := "✅"
		if !j.Enabled {
			enabled = "❌"
		}
		schedule := j.CronDesc
		if j.ScheduleType == "once" {
			if j.RunAt > 0 {
				t := time.Unix(j.RunAt/1000, 0)
				schedule = "一次性 " + t.Format("01-02 15:04")
			} else {
				schedule = "一次性"
			}
		}
		if schedule == "" {
			schedule = j.CronExpr
		}
		name := j.Name
		if len(name) > 30 {
			name = name[:30] + "..."
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s | %s | %s |\n",
			j.ID, name, j.ScheduleType, schedule, j.LastStatus, enabled))
	}
	sb.WriteString("\n命令: `/job run|enable|disable|delete <ID>`")
	return CommandResult{Text: sb.String()}
}

func (s *Service) cmdJob(args string) CommandResult {
	parts := strings.SplitN(args, " ", 2)
	sub := strings.TrimSpace(parts[0])
	subArgs := ""
	if len(parts) > 1 {
		subArgs = strings.TrimSpace(parts[1])
	}

	switch sub {
	case "run":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job run <任务ID>", IsError: true}
		}
		if err := ActionRunScheduledJob(subArgs); err != nil {
			return CommandResult{Text: "错误: " + err.Error(), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已触发立即执行", subArgs)}

	case "enable":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job enable <任务ID>", IsError: true}
		}
		if err := ActionEnableScheduledJob(subArgs); err != nil {
			return CommandResult{Text: "错误: " + err.Error(), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已启用", subArgs)}

	case "disable":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job disable <任务ID>", IsError: true}
		}
		if err := ActionDisableScheduledJob(subArgs); err != nil {
			return CommandResult{Text: "错误: " + err.Error(), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已禁用", subArgs)}

	case "delete":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job delete <任务ID>", IsError: true}
		}
		if err := ActionDeleteScheduledJob(subArgs); err != nil {
			return CommandResult{Text: "错误: " + err.Error(), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已删除", subArgs)}

	default:
		return CommandResult{
			Text:    "用法: /jobs 查看列表 | /job run|enable|disable|delete <ID>",
			IsError: true,
		}
	}
}

