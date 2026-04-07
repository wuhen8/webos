package service

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"runtime"
	"sort"
	"strconv"
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
	SwitchModel  string // /model <ref>: switch conversation model
	ConversationID     string // conversation selected/created by command
	ConversationAction string // "created" or "switched"
	SwitchConversation bool   // whether the client should update its current conversation binding
	RoutePolicy        string // "directed", "broadcast", or "unowned"
	OwnerClientID      string // logical client/app owner for directed command results
}

// commandRegistry holds all registered slash commands.
var commandRegistry []CommandDef

func init() {
	commandRegistry = []CommandDef{
		{Name: "help", Description: "显示所有可用的斜杠命令", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30},
		{Name: "reset", Aliases: []string{"clear"}, Description: "清空当前对话历史，开始新对话", Category: "chat", CategoryLabel: "💬 对话", CategoryOrder: 10},
		{Name: "model", Description: "切换当前使用的 AI 模型", Category: "config", CategoryLabel: "⚙️ 配置", CategoryOrder: 20, Args: "<供应商名/模型名>"},
		{Name: "models", Description: "列出所有可用的模型", Category: "config", CategoryLabel: "⚙️ 配置", CategoryOrder: 20},
		{Name: "stop", Description: "停止当前正在进行的 AI 生成", Category: "chat", CategoryLabel: "💬 对话", CategoryOrder: 10},
		{Name: "config", Description: "显示当前 AI 配置摘要", Category: "config", CategoryLabel: "⚙️ 配置", CategoryOrder: 20},
		{Name: "tasks", Aliases: []string{"t"}, Description: "列出所有后台任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30},
		{Name: "cancel", Description: "取消指定任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "<任务ID>"},
		{Name: "restart", Description: "重启服务（延迟500ms后退出，由 systemctl 重启）", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30},
		{Name: "status", Description: "系统健康状态", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30},
		{Name: "compress", Description: "手动压缩当前对话上下文（生成摘要替代早期消息）", Category: "chat", CategoryLabel: "💬 对话", CategoryOrder: 10},
		{Name: "conv list", Description: "列出所有对话", Category: "conv", CategoryLabel: "📋 会话管理", CategoryOrder: 15},
		{Name: "conv switch", Description: "切换当前聊天绑定的对话", Category: "conv", CategoryLabel: "📋 会话管理", CategoryOrder: 15, Args: "<id>"},
		{Name: "conv new", Description: "创建新对话", Category: "conv", CategoryLabel: "📋 会话管理", CategoryOrder: 15},
		{Name: "conv rename", Description: "重命名指定对话或当前对话", Category: "conv", CategoryLabel: "📋 会话管理", CategoryOrder: 15, Args: "<id> <新名称>"},
		{Name: "notify", Description: "系统通知：广播到所有客户端（Web/Telegram/飞书），@客户端ID 可定向推送，list 查看已连接客户端", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "[list | <消息> | @客户端ID <消息>]"},
		{Name: "jobs", Description: "列出所有定时任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30},
		{Name: "job run", Description: "立即执行指定定时任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "<任务ID>"},
		{Name: "job enable", Description: "启用指定定时任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "<任务ID>"},
		{Name: "job disable", Description: "禁用指定定时任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "<任务ID>"},
		{Name: "job delete", Description: "删除指定定时任务", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "<任务ID>"},
		{Name: "ai", Description: "AI 自驱动入口：/ai @客户端ID <消息> 可将 AI 回复定向发到指定客户端；不写 @客户端ID 时仅执行，不回传到任何客户端，适合定时任务和外部 CLI", Category: "chat", CategoryLabel: "💬 对话", CategoryOrder: 10, Args: "[@客户端ID] <消息内容>"},
		{Name: "guard", Description: "IP 访问审批：管理 IP 白名单，支持批量操作（空格分隔多个 IP 或 ID）", Category: "system", CategoryLabel: "🔧 系统", CategoryOrder: 30, Args: "[status|on|off|list|approve <IP或ID ...>|reject <IP或ID ...>|remove <IP或ID ...>|cidr ...]"},
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
func ParseCommand(text string) (name string, args string, ok bool) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/") {
		return "", "", false
	}
	body := text[1:]
	if body == "" {
		return "", "", false
	}
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

// ---------------------------------------------------------------------------
// CommandExecutor — executes slash commands with injected AI callbacks
// ---------------------------------------------------------------------------

// NotifySink abstracts the broadcast notification system for /notify command.
type NotifySink interface {
	SinkIDs() []string
	SendToSystemEvent(sinkID, msgType string, data interface{}) bool
	OnSystemEvent(msgType string, data interface{})
}

// CommandExecutor executes slash commands.
// AI-specific commands are handled via injected callbacks.
type CommandExecutor struct {
	// AI callbacks (injected by ai package)
	OnSwitchModel func(convID, ref string) (provName, modelName, switchRef string, err error)
	OnListModels  func(convID string) (text string, err error)
	OnGetConfig   func(convID string) (text string, err error)
	OnCompress    func(convID string) (text string, err error)
	OnGetStatus   func(convID string) (text string, err error)
	OnAISend      func(convID, message, clientID string) (accepted bool, reason string) // 给 AI 发消息
	OnStop        func(convID string)

	// System dependencies
	NotifySink NotifySink
}

var globalCommandExecutor *CommandExecutor

// GetCommandExecutor returns the singleton CommandExecutor.
func GetCommandExecutor() *CommandExecutor {
	if globalCommandExecutor == nil {
		globalCommandExecutor = &CommandExecutor{}
	}
	return globalCommandExecutor
}

// ExecuteCommand runs a slash command and returns the result.
func (ce *CommandExecutor) ExecuteCommand(convID, cmdName, cmdArgs string) CommandResult {
	return ce.ExecuteCommandForClient(convID, cmdName, cmdArgs, "")
}

// ExecuteCommandForClient runs a slash command with an optional client identity.
// clientID is only used by commands that need to route follow-up events back to a caller, such as /ai.
func (ce *CommandExecutor) ExecuteCommandForClient(convID, cmdName, cmdArgs, clientID string) CommandResult {
	var result CommandResult
	switch cmdName {
	case "help":
		result = ce.cmdHelp()
	case "reset", "clear":
		result = CommandResult{Text: "对话已重置。", ClearHistory: true}
	case "host", "sandbox", "mode":
		result = CommandResult{Text: "全局执行模式已移除。AI 现在通过 shell 工具的 mode 参数自主选择执行环境（host/sandbox）。"}
	case "model":
		result = ce.cmdModel(convID, cmdArgs)
	case "models":
		result = ce.cmdModels(convID)
	case "stop":
		result = CommandResult{Text: "已停止生成。", StopChat: true}
	case "config":
		result = ce.cmdConfig(convID)
	case "tasks", "t":
		result = ce.cmdTasks()
	case "cancel":
		result = ce.cmdCancel(cmdArgs)
	case "restart":
		result = ce.cmdRestart()
	case "status":
		result = ce.cmdStatus(convID)
	case "compress":
		result = ce.cmdCompress(convID)
	case "conv":
		result = ce.cmdConv(cmdArgs)
	case "notify":
		result = ce.cmdNotify(cmdArgs)
	case "ai":
		result = ce.cmdAI(convID, cmdArgs, clientID)
	case "jobs":
		result = ce.cmdJobs()
	case "job":
		result = ce.cmdJob(cmdArgs)
	case "guard":
		result = ce.cmdGuard(cmdArgs)
	default:
		result = CommandResult{
			Text:    fmt.Sprintf("未知命令: /%s\n输入 /help 查看可用命令。", cmdName),
			IsError: true,
		}
	}
	if clientID != "" {
		result.RoutePolicy = "directed"
		result.OwnerClientID = clientID
	} else {
		result.RoutePolicy = "unowned"
	}
	return result
}

// HandleCommandResult processes the side effects of a CommandResult.
func (ce *CommandExecutor) HandleCommandResult(convID string, result CommandResult) {
	if result.StopChat && ce.OnStop != nil {
		ce.OnStop(convID)
	}
	if result.SwitchModel != "" && convID != "" {
		ce.applySwitchModel(convID, result.SwitchModel)
	}
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

func (ce *CommandExecutor) cmdHelp() CommandResult {
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

func (ce *CommandExecutor) cmdModel(convID, args string) CommandResult {
	if ce.OnSwitchModel == nil {
		return CommandResult{Text: "AI 未配置。", IsError: true}
	}
	if args == "" {
		_, modelName, _, err := ce.OnSwitchModel(convID, "")
		if err != nil {
			return CommandResult{Text: err.Error(), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("当前会话模型: **%s**\n\n使用 `/model <供应商名/模型名>` 切换模型，或 `/models` 查看所有可用模型。", modelName)}
	}
	provName, modelName, ref, err := ce.OnSwitchModel(convID, args)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{
		Text:        fmt.Sprintf("已切换到: **%s / %s**", provName, modelName),
		SwitchModel: ref,
	}
}

func (ce *CommandExecutor) cmdModels(convID string) CommandResult {
	if ce.OnListModels == nil {
		return CommandResult{Text: "AI 未配置。", IsError: true}
	}
	text, err := ce.OnListModels(convID)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{Text: text}
}

func (ce *CommandExecutor) cmdConfig(convID string) CommandResult {
	if ce.OnGetConfig == nil {
		return CommandResult{Text: "AI 未配置。", IsError: true}
	}
	text, err := ce.OnGetConfig(convID)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{Text: text}
}

func (ce *CommandExecutor) cmdTasks() CommandResult {
	tasks := GetTaskManager().GetAll()
	if len(tasks) == 0 {
		return CommandResult{Text: "当前没有后台任务。"}
	}
	now := time.Now().UnixMilli()
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**后台任务 (%d)：**\n\n", len(tasks)))
	sb.WriteString("| ID | 标题 | 类别 | 状态 | 运行时长 | 信息 |\n")
	sb.WriteString("|---|---|---|---|---|---|\n")
	for _, t := range tasks {
		category := t.Category
		if category == "" {
			category = "-"
		}
		message := t.Message
		if len(message) > 40 {
			message = message[:40] + "..."
		}
		dur := ""
		if t.Status == TaskRunning {
			d := time.Duration(now-t.CreatedAt) * time.Millisecond
			dur = d.Round(time.Second).String()
		} else if t.DoneAt > 0 {
			d := time.Duration(t.DoneAt-t.CreatedAt) * time.Millisecond
			dur = d.Round(time.Second).String()
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s | %s | %s |\n",
			t.ID, t.Title, category, string(t.Status), dur, message))
	}
	sb.WriteString("\n使用 `/cancel <ID>` 取消运行中的任务。")
	return CommandResult{Text: sb.String()}
}

func (ce *CommandExecutor) cmdCancel(args string) CommandResult {
	id := strings.TrimSpace(args)
	if id == "" {
		return CommandResult{Text: "用法: `/cancel <任务ID>`\n使用 `/tasks` 查看任务列表。", IsError: true}
	}
	if GetTaskManager().Cancel(id) {
		return CommandResult{Text: fmt.Sprintf("已取消任务 `%s`。", id)}
	}
	return CommandResult{Text: fmt.Sprintf("任务 `%s` 不存在或已结束。", id), IsError: true}
}

func (ce *CommandExecutor) cmdRestart() CommandResult {
	go func() {
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()
	return CommandResult{Text: "服务将在 500ms 后重启..."}
}

func (ce *CommandExecutor) cmdCompress(convID string) CommandResult {
	if ce.OnCompress == nil {
		return CommandResult{Text: "AI 未配置，无法压缩。", IsError: true}
	}
	text, err := ce.OnCompress(convID)
	if err != nil {
		return CommandResult{Text: err.Error(), IsError: true}
	}
	return CommandResult{Text: text}
}

func (ce *CommandExecutor) cmdStatus(convID string) CommandResult {
	if ce.OnGetStatus != nil {
		text, err := ce.OnGetStatus(convID)
		if err != nil {
			return CommandResult{Text: err.Error(), IsError: true}
		}
		return CommandResult{Text: text}
	}
	// Fallback: basic system status without AI info
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	var sb strings.Builder
	sb.WriteString("**系统状态：**\n\n")
	sb.WriteString(fmt.Sprintf("- Go 协程: `%d`\n", runtime.NumGoroutine()))
	sb.WriteString(fmt.Sprintf("- 后台任务运行中: `%d`\n", GetTaskManager().RunningCount()))
	sb.WriteString(fmt.Sprintf("- 内存: `%.1f MB` (Sys: `%.1f MB`)\n", float64(m.Alloc)/1024/1024, float64(m.Sys)/1024/1024))
	sb.WriteString(fmt.Sprintf("- CPU 核心: `%d`\n", runtime.NumCPU()))
	jobs := GetScheduler().GetAllStatus()
	if len(jobs) > 0 {
		sb.WriteString(fmt.Sprintf("- 定时任务: `%d` 个\n", len(jobs)))
	}
	return CommandResult{Text: sb.String()}
}

func (ce *CommandExecutor) cmdConv(args string) CommandResult {
	parts := strings.SplitN(args, " ", 2)
	sub := strings.TrimSpace(parts[0])
	subArgs := ""
	if len(parts) > 1 {
		subArgs = strings.TrimSpace(parts[1])
	}
	switch sub {
	case "list":
		return ce.cmdConvList()
	case "switch":
		return ce.cmdConvSwitch(subArgs)
	case "new":
		return ce.cmdConvNew()
	case "rename":
		return ce.cmdConvRename(subArgs)
	default:
		return CommandResult{Text: "用法: /conv list | /conv switch <id> | /conv new | /conv rename <id> <新名称>", IsError: true}
	}
}

func (ce *CommandExecutor) cmdConvList() CommandResult {
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

func (ce *CommandExecutor) cmdConvSwitch(args string) CommandResult {
	convID := strings.TrimSpace(args)
	if convID == "" {
		return CommandResult{Text: "用法: /conv switch <id>", IsError: true}
	}
	convs, err := database.ListConversations()
	if err != nil {
		return CommandResult{Text: "查询对话失败: " + err.Error(), IsError: true}
	}
	for _, c := range convs {
		if c.ID == convID {
			return CommandResult{
				Text:               "已切换到对话: `" + convID + "`",
				ConversationID:     convID,
				ConversationAction: "switched",
				SwitchConversation: true,
			}
		}
	}
	return CommandResult{Text: "对话不存在: " + convID, IsError: true}
}

func (ce *CommandExecutor) cmdConvNew() CommandResult {
	convID := genCommandID()
	title := "新对话"

	providerID, model, err := defaultConversationSelection()
	if err != nil {
		return CommandResult{Text: "创建对话失败: " + err.Error(), IsError: true}
	}
	if err := database.CreateConversation(convID, title, providerID, model); err != nil {
		return CommandResult{Text: "创建对话失败: " + err.Error(), IsError: true}
	}
	return CommandResult{
		Text:               fmt.Sprintf("已创建新对话: `%s`", convID),
		ConversationID:     convID,
		ConversationAction: "created",
		SwitchConversation: true,
	}
}

func (ce *CommandExecutor) cmdConvRename(args string) CommandResult {
	args = strings.TrimSpace(args)
	if args == "" {
		return CommandResult{Text: "用法: /conv rename <id> <新名称>", IsError: true}
	}

	parts := strings.Fields(args)
	if len(parts) < 2 {
		return CommandResult{Text: "用法: /conv rename <id> <新名称>", IsError: true}
	}
	convID := parts[0]
	newTitle := strings.TrimSpace(strings.TrimPrefix(args, convID))
	if newTitle == "" {
		return CommandResult{Text: "用法: /conv rename <id> <新名称>", IsError: true}
	}

	if _, err := database.GetConversation(convID); err != nil {
		return CommandResult{Text: "查询对话失败: " + err.Error(), IsError: true}
	}
	if err := database.UpdateConversationTitle(convID, newTitle); err != nil {
		return CommandResult{Text: "重命名失败: " + err.Error(), IsError: true}
	}

	return CommandResult{Text: fmt.Sprintf("已将对话 `%s` 重命名为: %s", convID, newTitle)}
}

func (ce *CommandExecutor) cmdAI(convID, args, clientID string) CommandResult {
	args = strings.TrimSpace(args)
	if args == "" {
		return CommandResult{Text: "用法: /ai [@sinkId] <消息内容>", IsError: true}
	}
	if ce.OnAISend == nil {
		return CommandResult{Text: "AI 未初始化。", IsError: true}
	}

	targetClientID := ""
	if strings.HasPrefix(args, "@") {
		parts := strings.SplitN(args, " ", 2)
		targetClientID = strings.TrimPrefix(parts[0], "@")
		if targetClientID == "" || len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
			return CommandResult{Text: "用法: /ai [@sinkId] <消息内容>", IsError: true}
		}
		args = strings.TrimSpace(parts[1])
	}

	accepted, reason := ce.OnAISend(convID, args, targetClientID)
	if !accepted {
		return CommandResult{Text: fmt.Sprintf("消息发送失败: %s", reason), IsError: true}
	}
	if targetClientID != "" {
		return CommandResult{Text: fmt.Sprintf("已发送给 AI（目标 `%s`）: %s", targetClientID, args)}
	}
	return CommandResult{Text: fmt.Sprintf("已发送给 AI（无回传目标）: %s", args)}
}

func (ce *CommandExecutor) cmdNotify(args string) CommandResult {
	args = strings.TrimSpace(args)
	if ce.NotifySink == nil {
		return CommandResult{Text: "通知系统未初始化。", IsError: true}
	}

	if args == "" || args == "list" {
		ids := ce.NotifySink.SinkIDs()
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
		if !ce.NotifySink.SendToSystemEvent(target, "system.notify", data) {
			return CommandResult{Text: fmt.Sprintf("客户端 `%s` 不存在或已断开", target), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("已发送通知到 `%s`: %s", target, msg)}
	}

	data["message"] = args
	ce.NotifySink.OnSystemEvent("system.notify", data)
	return CommandResult{Text: fmt.Sprintf("已广播通知: %s", args)}
}

func (ce *CommandExecutor) cmdJobs() CommandResult {
	jobs := GetScheduler().GetAllStatus()
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

func (ce *CommandExecutor) cmdGuard(args string) CommandResult {
	fwSvc := GetFirewallService()
	guard := fwSvc.Guard()
	args = strings.TrimSpace(args)

	if args == "" || args == "status" {
		status := "❌ 未启用"
		if fwSvc.IsEnabled() {
			status = "✅ 已启用"
		}
		return CommandResult{Text: fmt.Sprintf("防火墙状态: %s", status)}
	}

	parts := strings.SplitN(args, " ", 2)
	sub := parts[0]
	subArgs := ""
	if len(parts) > 1 {
		subArgs = strings.TrimSpace(parts[1])
	}

	switch sub {
	case "on":
		if fwSvc.IsEnabled() {
			return CommandResult{Text: "防火墙已经是启用状态。"}
		}
		if err := fwSvc.Enable(); err != nil {
			return CommandResult{Text: fmt.Sprintf("启用失败: %v", err), IsError: true}
		}
		return CommandResult{Text: "✅ 防火墙已启用（含 IP 审批）"}

	case "off":
		if err := fwSvc.Disable(); err != nil {
			return CommandResult{Text: fmt.Sprintf("停用失败: %v", err), IsError: true}
		}
		return CommandResult{Text: "✅ 防火墙已停用"}

	case "list":
		records, err := guard.ListIPs()
		if err != nil {
			return CommandResult{Text: fmt.Sprintf("查询失败: %v", err), IsError: true}
		}
		if len(records) == 0 {
			return CommandResult{Text: "当前没有 IP 记录。"}
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("**IP 记录 (%d)：**\n\n", len(records)))
		sb.WriteString("| ID | IP | 状态 | 归属地 | 过期时间 |\n")
		sb.WriteString("|---|---|---|---|---|\n")
		for _, r := range records {
			st := r.Status
			switch st {
			case "pending":
				st = "⏳ 待审批"
			case "approved":
				st = "✅ 已放行"
			case "rejected":
				st = "❌ 已拒绝"
			}
			expires := "永久"
			if r.ExpiresAt > 0 {
				expires = time.Unix(r.ExpiresAt, 0).Format("01-02 15:04")
			}
			loc := r.Location
			if loc == "" {
				loc = "-"
			}
			sb.WriteString(fmt.Sprintf("| %d | `%s` | %s | %s | %s |\n", r.ID, r.IP, st, loc, expires))
		}
		sb.WriteString("\n命令: `/guard approve|reject|remove <ID>`")
		return CommandResult{Text: sb.String()}

	case "approve":
		if subArgs == "" {
			return CommandResult{Text: "用法: /guard approve <IP或ID ...>", IsError: true}
		}
		ttl := int64(604800)
		if v := database.FWConfigGet("guard_default_ttl"); v != "" {
			if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
				ttl = parsed
			}
		}
		args := strings.Fields(subArgs)
		var ids []int64
		for _, a := range args {
			rec, err := resolveIPArg(a)
			if err != nil {
				return CommandResult{Text: fmt.Sprintf("查找失败 %s: %v", a, err), IsError: true}
			}
			ids = append(ids, rec.ID)
		}
		ok, errs := guard.BatchApproveIPs(ids, ttl)
		if len(errs) > 0 {
			return CommandResult{Text: fmt.Sprintf("放行 %d 个，失败: %s", ok, strings.Join(errs, "; ")), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("✅ 已放行 %d 个 IP", ok)}

	case "reject":
		if subArgs == "" {
			return CommandResult{Text: "用法: /guard reject <IP或ID ...>", IsError: true}
		}
		args := strings.Fields(subArgs)
		var ids []int64
		for _, a := range args {
			rec, err := resolveIPArg(a)
			if err != nil {
				return CommandResult{Text: fmt.Sprintf("查找失败 %s: %v", a, err), IsError: true}
			}
			ids = append(ids, rec.ID)
		}
		ok, errs := guard.BatchRejectIPs(ids)
		if len(errs) > 0 {
			return CommandResult{Text: fmt.Sprintf("拒绝 %d 个，失败: %s", ok, strings.Join(errs, "; ")), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("✅ 已拒绝 %d 个 IP", ok)}

	case "remove":
		if subArgs == "" {
			return CommandResult{Text: "用法: /guard remove <IP或ID ...>", IsError: true}
		}
		args := strings.Fields(subArgs)
		var removeIDs []int64
		for _, a := range args {
			rec, err := resolveIPArg(a)
			if err != nil {
				return CommandResult{Text: fmt.Sprintf("查找失败 %s: %v", a, err), IsError: true}
			}
			removeIDs = append(removeIDs, rec.ID)
		}
		ok, errs := guard.BatchRemoveIPs(removeIDs)
		if len(errs) > 0 {
			return CommandResult{Text: fmt.Sprintf("删除 %d 个，失败: %s", ok, strings.Join(errs, "; ")), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("✅ 已删除 %d 个 IP", ok)}

	case "cidr":
		return ce.cmdGuardCIDR(subArgs)

	default:
		return CommandResult{
			Text:    "用法: /guard [status|on|off|list|approve <IP或ID ...>|reject <IP或ID ...>|remove <IP或ID ...>|cidr ...]",
			IsError: true,
		}
	}
}

// resolveIPArg resolves a CLI argument via the service layer.
func resolveIPArg(arg string) (*database.IPRecord, error) {
	return GetFirewallService().Guard().ResolveIPArg(arg)
}

func (ce *CommandExecutor) cmdGuardCIDR(args string) CommandResult {
	guard := GetFirewallService().Guard()
	parts := strings.SplitN(args, " ", 2)
	sub := strings.TrimSpace(parts[0])
	subArgs := ""
	if len(parts) > 1 {
		subArgs = strings.TrimSpace(parts[1])
	}

	switch sub {
	case "list", "":
		cidrs, err := guard.ListCIDRs()
		if err != nil {
			return CommandResult{Text: fmt.Sprintf("查询失败: %v", err), IsError: true}
		}
		if len(cidrs) == 0 {
			return CommandResult{Text: "当前没有白名单网段。"}
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("**白名单网段 (%d)：**\n\n", len(cidrs)))
		sb.WriteString("| ID | 网段 | 备注 | 自动 |\n")
		sb.WriteString("|---|---|---|---|\n")
		for _, c := range cidrs {
			auto := ""
			if c.AutoAdded {
				auto = "🔵 自动"
			}
			note := c.Note
			if note == "" {
				note = "-"
			}
			sb.WriteString(fmt.Sprintf("| %d | `%s` | %s | %s |\n", c.ID, c.CIDR, note, auto))
		}
		sb.WriteString("\n命令: `/guard cidr add <CIDR> [备注]` | `/guard cidr remove <ID>`")
		return CommandResult{Text: sb.String()}

	case "add":
		if subArgs == "" {
			return CommandResult{Text: "用法: /guard cidr add <CIDR> [备注]", IsError: true}
		}
		addParts := strings.SplitN(subArgs, " ", 2)
		cidr := addParts[0]
		note := ""
		if len(addParts) > 1 {
			note = strings.TrimSpace(addParts[1])
		}
		if err := guard.AddCIDR(cidr, note); err != nil {
			return CommandResult{Text: fmt.Sprintf("添加失败: %v", err), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("✅ 已添加白名单网段: %s", cidr)}

	case "remove":
		if subArgs == "" {
			return CommandResult{Text: "用法: /guard cidr remove <ID>", IsError: true}
		}
		id := int64(0)
		if _, err := fmt.Sscanf(subArgs, "%d", &id); err != nil || id <= 0 {
			return CommandResult{Text: "ID 必须是正整数", IsError: true}
		}
		if err := guard.RemoveCIDR(id); err != nil {
			return CommandResult{Text: fmt.Sprintf("删除失败: %v", err), IsError: true}
		}
		return CommandResult{Text: fmt.Sprintf("✅ 已删除白名单网段 ID: %d", id)}

	default:
		return CommandResult{
			Text:    "用法: /guard cidr [list|add <CIDR> [备注]|remove <ID>]",
			IsError: true,
		}
	}
}

func (ce *CommandExecutor) cmdJob(args string) CommandResult {
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
		GetScheduler().RunNow(subArgs)
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已触发立即执行", subArgs)}
	case "enable":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job enable <任务ID>", IsError: true}
		}
		GetScheduler().EnableJob(subArgs)
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已启用", subArgs)}
	case "disable":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job disable <任务ID>", IsError: true}
		}
		GetScheduler().DisableJob(subArgs)
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已禁用", subArgs)}
	case "delete":
		if subArgs == "" {
			return CommandResult{Text: "用法: /job delete <任务ID>", IsError: true}
		}
		DBDeleteJob(subArgs)
		GetScheduler().RemoveJob(subArgs)
		return CommandResult{Text: fmt.Sprintf("定时任务 `%s` 已删除", subArgs)}
	default:
		return CommandResult{Text: "用法: /jobs 查看列表 | /job run|enable|disable|delete <ID>", IsError: true}
	}
}

func (ce *CommandExecutor) applySwitchModel(convID, ref string) {
	if convID == "" {
		return
	}
	parts := strings.SplitN(ref, "/", 2)
	if len(parts) != 2 {
		return
	}
	if err := database.UpdateConversationModel(convID, parts[0], parts[1]); err != nil {
		log.Printf("[commands] failed to update conversation model for %s: %v", convID, err)
	}
}

type commandAIProvider struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Models []string `json:"models"`
}

type commandAIMultiConfig struct {
	Providers []commandAIProvider `json:"providers"`
}

func defaultConversationSelection() (string, string, error) {
	db := database.DB()
	var val string
	if err := db.QueryRow("SELECT value FROM preferences WHERE key = 'ai_config'").Scan(&val); err != nil {
		return "", "", fmt.Errorf("请先配置 AI")
	}
	var raw string
	if json.Unmarshal([]byte(val), &raw) != nil {
		raw = val
	}
	var cfg commandAIMultiConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return "", "", fmt.Errorf("AI 配置格式错误: %v", err)
	}
	if len(cfg.Providers) == 0 {
		return "", "", fmt.Errorf("AI 配置不完整，没有供应商")
	}
	provider := cfg.Providers[0]
	if provider.ID == "" {
		return "", "", fmt.Errorf("AI 配置不完整，默认供应商缺少 ID")
	}
	if len(provider.Models) == 0 || strings.TrimSpace(provider.Models[0]) == "" {
		return "", "", fmt.Errorf("供应商 %s 没有配置模型", provider.Name)
	}
	return provider.ID, provider.Models[0], nil
}

// genCommandID generates a random hex ID for conversations.
func genCommandID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// GetCommandRegistry returns the command registry (for tool descriptions etc).
func GetCommandRegistry() []CommandDef {
	return commandRegistry
}
