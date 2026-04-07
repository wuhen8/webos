package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// Re-export types from service for backward compatibility within ai package.
type CommandDef = service.CommandDef
type CommandResult = service.CommandResult

// ListCommands returns all non-hidden command definitions.
func ListCommands() []service.CommandDef {
	return service.ListCommands()
}

// ParseCommand checks if text starts with "/" and parses it into command name + args.
func ParseCommand(text string) (name string, args string, ok bool) {
	return service.ParseCommand(text)
}

// ResolveCommand finds the CommandDef matching the given name or alias.
func ResolveCommand(name string) *service.CommandDef {
	return service.ResolveCommand(name)
}

// InitCommandCallbacks wires up AI-specific callbacks into the service.CommandExecutor.
// Must be called after AI service is initialized.
func InitCommandCallbacks(svc *Service) {
	ce := service.GetCommandExecutor()

	ce.OnSwitchModel = func(convID, ref string) (provName, modelName, switchRef string, err error) {
		return ActionSwitchModel(convID, ref)
	}

	ce.OnListModels = func(convID string) (string, error) {
		models, err := ActionListModels(convID)
		if err != nil {
			return "", err
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
		return sb.String(), nil
	}

	ce.OnGetConfig = func(convID string) (string, error) {
		model, maxTokens, maxToolRounds, skillsDir, providerCount, err := ActionGetConfig(convID)
		if err != nil {
			return "", err
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
		return sb.String(), nil
	}

	ce.OnCompress = func(convID string) (string, error) {
		result, err := ActionCompress(convID)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("上下文压缩完成。\n\n- 压缩前: %d 条消息，约 %d tokens\n- 压缩了 %d 条消息（约 %d tokens）→ 摘要（约 %d tokens）\n- 保留最近 %d 条消息",
			result.TotalMessages, result.TotalTokens, result.CompressedCount, result.CompressedTokens, result.SummaryTokens, result.KeptMessages), nil
	}

	ce.OnGetStatus = func(convID string) (string, error) {
		snap := svc.sysCtx.Snapshot()
		h := snap.Health
		e := snap.Executor
		var sb strings.Builder
		sb.WriteString("**系统状态：**\n\n")
		if cfg, err := loadAIConfig(convID, "", ""); err == nil {
			if convID != "" {
				sb.WriteString(fmt.Sprintf("- 当前会话: `%s`\n", convID))
				sb.WriteString(fmt.Sprintf("- 当前会话模型: `%s / %s`\n", cfg.ProviderName, cfg.Model))
			}
		}
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
		if convID != "" {
			ctxSvc := NewChatService(svc.Executor, svc)
			if ctx, err := ctxSvc.GetContextStatus(convID); err == nil && ctx != nil {
				summaryText := "无"
				if ctx.HasSummary {
					summaryText = fmt.Sprintf("有 (截至消息 #%d)", ctx.SummaryUpToID)
				}
				sb.WriteString("\n**上下文状态：**\n\n")
				sb.WriteString(fmt.Sprintf("- 模型: `%s`\n", ctx.Model))
				sb.WriteString(fmt.Sprintf("- 消息数: `%d`\n", ctx.MessageCount))
				sb.WriteString(fmt.Sprintf("- 上下文 Token: `%d / %d (%d%%)`\n", ctx.ContextTokens, ctx.ContextWindow, ctx.ContextPercent))
				sb.WriteString(fmt.Sprintf("- 摘要: `%s`\n", summaryText))
			}
		}
		return sb.String(), nil
	}
}

// ActionGetConfig returns the current AI config summary.
func ActionGetConfig(convID string) (model string, maxTokens, maxToolRounds int, skillsDir string, providerCount int, err error) {
	cfg, e := loadAIConfig(convID, "", "")
	if e != nil {
		err = fmt.Errorf("AI 未配置: %s", e.Error())
		return
	}
	multi, _ := loadMultiConfig()
	model = cfg.Model
	maxTokens = cfg.MaxTokens
	maxToolRounds = cfg.MaxToolRounds
	skillsDir = config.SkillsDir()
	if multi != nil {
		providerCount = len(multi.Providers)
	}
	return
}

// ModelInfo describes a model within a provider.
type ModelInfo struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Active   bool   `json:"active"`
}

// ActionListModels returns all available models across providers.
func ActionListModels(convID string) ([]ModelInfo, error) {
	multi, err := loadMultiConfig()
	if err != nil {
		return nil, fmt.Errorf("AI 未配置: %s", err.Error())
	}

	selectedProviderID := ""
	selectedModel := ""
	if convID != "" {
		cfg, err := loadAIConfig(convID, "", "")
		if err == nil {
			selectedProviderID = cfg.ProviderID
			selectedModel = cfg.Model
		}
	}

	var result []ModelInfo
	for _, p := range multi.Providers {
		for _, m := range p.Models {
			result = append(result, ModelInfo{
				Provider: p.Name,
				Model:    m,
				Active:   p.ID == selectedProviderID && m == selectedModel,
			})
		}
	}
	return result, nil
}

// ActionSwitchModel resolves a model reference for a conversation.
func ActionSwitchModel(convID, ref string) (providerName, modelName, switchRef string, err error) {
	if ref == "" {
		cfg, e := loadAIConfig(convID, "", "")
		if e != nil {
			err = fmt.Errorf("AI 未配置")
			return
		}
		providerName = cfg.ProviderName
		modelName = cfg.Model
		switchRef = cfg.ProviderID + "/" + cfg.Model
		return
	}

	multi, e := loadMultiConfig()
	if e != nil {
		err = fmt.Errorf("AI 未配置: %s", e.Error())
		return
	}

	var targetProvider *AIProvider
	var targetModel string

	if strings.Contains(ref, "/") {
		parts := strings.SplitN(ref, "/", 2)
		provName := strings.TrimSpace(parts[0])
		modName := strings.TrimSpace(parts[1])
		for i := range multi.Providers {
			if strings.EqualFold(multi.Providers[i].Name, provName) || multi.Providers[i].ID == provName {
				targetProvider = &multi.Providers[i]
				break
			}
		}
		if targetProvider == nil {
			err = fmt.Errorf("未找到供应商: %s", provName)
			return
		}
		found := false
		for _, m := range targetProvider.Models {
			if strings.EqualFold(m, modName) {
				targetModel = m
				found = true
				break
			}
		}
		if !found {
			err = fmt.Errorf("供应商 %s 中未找到模型: %s", targetProvider.Name, modName)
			return
		}
	} else {
		modName := strings.TrimSpace(ref)
		for i := range multi.Providers {
			for _, m := range multi.Providers[i].Models {
				if strings.EqualFold(m, modName) {
					targetProvider = &multi.Providers[i]
					targetModel = m
					break
				}
			}
			if targetProvider != nil {
				break
			}
		}
		if targetProvider == nil {
			err = fmt.Errorf("未找到模型: %s", modName)
			return
		}
	}

	providerName = targetProvider.Name
	modelName = targetModel
	switchRef = targetProvider.ID + "/" + targetModel
	return
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
	if json.Unmarshal([]byte(val), &raw) != nil {
		raw = val
	}
	var multi AIMultiConfig
	if err := json.Unmarshal([]byte(raw), &multi); err != nil {
		return nil, fmt.Errorf("配置格式错误: %v", err)
	}
	return &multi, nil
}
