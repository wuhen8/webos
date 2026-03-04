package ai

// actions.go — unified action layer.
// Both slash commands (commands.go) and AI tools (tools.go) call these functions.
// Actions return structured results; the caller decides how to present them.

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

// ActionError is returned when an action fails.
type ActionError struct {
	Message string
}

func (e *ActionError) Error() string { return e.Message }

func actionErr(msg string) *ActionError { return &ActionError{Message: msg} }

// TaskInfo is a structured view of a background task.
type TaskInfo struct {
	ID           string   `json:"id"`
	Type         string   `json:"type"`
	Title        string   `json:"title"`
	Category     string   `json:"category,omitempty"`
	Status       string   `json:"status"`
	Message      string   `json:"message"`
	CreatedAt    int64    `json:"createdAt"`
	DoneAt       int64    `json:"doneAt,omitempty"`
	Progress     *float64 `json:"progress,omitempty"`
	ItemCurrent  int64    `json:"itemCurrent,omitempty"`
	ItemTotal    int64    `json:"itemTotal,omitempty"`
	BytesCurrent int64   `json:"bytesCurrent,omitempty"`
	BytesTotal   int64    `json:"bytesTotal,omitempty"`
	Duration     string   `json:"duration,omitempty"`
}


// CompressResult holds the outcome of a context compression.
type CompressResult struct {
	TotalMessages    int `json:"totalMessages"`
	TotalTokens      int `json:"totalTokens"`
	CompressedCount  int `json:"compressedCount"`
	CompressedTokens int `json:"compressedTokens"`
	SummaryTokens    int `json:"summaryTokens"`
	KeptMessages     int `json:"keptMessages"`
}

// ---------------------------------------------------------------------------
// Task actions
// ---------------------------------------------------------------------------

func taskInfoFromService(t service.BackgroundTask) TaskInfo {
	now := time.Now().UnixMilli()
	dur := ""
	if t.Status == service.TaskRunning {
		d := time.Duration(now-t.CreatedAt) * time.Millisecond
		dur = d.Round(time.Second).String()
	} else if t.DoneAt > 0 {
		d := time.Duration(t.DoneAt-t.CreatedAt) * time.Millisecond
		dur = d.Round(time.Second).String()
	}
	return TaskInfo{
		ID:           t.ID,
		Type:         t.Type,
		Title:        t.Title,
		Category:     t.Category,
		Status:       string(t.Status),
		Message:      t.Message,
		CreatedAt:    t.CreatedAt,
		DoneAt:       t.DoneAt,
		Progress:     t.Progress,
		ItemCurrent:  t.ItemCurrent,
		ItemTotal:    t.ItemTotal,
		BytesCurrent: t.BytesCurrent,
		BytesTotal:   t.BytesTotal,
		Duration:     dur,
	}
}

// ActionListTasks returns all background tasks, optionally filtered by status.
func ActionListTasks(statusFilter string) []TaskInfo {
	tasks := service.GetTaskManager().GetAll()
	result := make([]TaskInfo, 0, len(tasks))
	for _, t := range tasks {
		if statusFilter != "" && string(t.Status) != statusFilter {
			continue
		}
		result = append(result, taskInfoFromService(t))
	}
	return result
}

// ActionGetTask returns a single task by ID, or nil if not found.
func ActionGetTask(taskID string) *TaskInfo {
	for _, t := range service.GetTaskManager().GetAll() {
		if t.ID == taskID {
			info := taskInfoFromService(t)
			return &info
		}
	}
	return nil
}

// ActionCancelTask cancels a running task. Returns true if cancelled.
func ActionCancelTask(taskID string) bool {
	return service.GetTaskManager().Cancel(taskID)
}

// ActionSubmitBackgroundTask submits a shell command as a background task.
// Returns the new task ID.
func ActionSubmitBackgroundTask(title, command string) string {
	sysExec := service.NewSystemService()
	return service.GetTaskManager().Submit("ai_background", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		stdout, stderr, exitCode, err := sysExec.Exec(command)
		if err != nil {
			return "", err
		}
		if exitCode != 0 {
			return "", fmt.Errorf("exit %d: %s", exitCode, stderr)
		}
		if len(stdout) > 500 {
			stdout = stdout[:500] + "..."
		}
		return stdout, nil
	})
}
// ---------------------------------------------------------------------------
// Context compression
// ---------------------------------------------------------------------------

// ActionCompress compresses the conversation context. Returns result or error.
func ActionCompress(convID string) (*CompressResult, error) {
	if convID == "" {
		return nil, actionErr("当前没有活跃对话，无法压缩。")
	}

	cfg, err := loadAIConfig()
	if err != nil {
		return nil, actionErr("AI 未配置: " + err.Error())
	}

	historyRows, err := database.ListMessages(convID)
	if err != nil {
		return nil, actionErr("加载历史失败: " + err.Error())
	}
	if len(historyRows) == 0 {
		return nil, actionErr("对话历史为空，无需压缩。")
	}

	history := rowsToMessages(historyRows)

	totalTokens := 0
	for _, msg := range history {
		totalTokens += EstimateMessageTokens(msg)
	}

	recentN := cfg.RecentMessages
	if recentN <= 0 {
		recentN = defaultRecentMessages
	}

	splitPoint := findSafeSplitPoint(history, recentN)
	if splitPoint == 0 {
		return nil, actionErr(fmt.Sprintf("消息数不足（共 %d 条，保留最近 %d 条），无需压缩。", len(history), recentN))
	}

	var splitMsgID int64
	if splitPoint > 0 && splitPoint <= len(historyRows) {
		splitMsgID = historyRows[splitPoint-1].ID
	}

	var toCompress []ChatMessage
	existingSummary, _ := database.GetLatestSummary(convID)

	if existingSummary != nil && existingSummary.UpToMsgID > 0 {
		prevEnd := 0
		for i, row := range historyRows {
			if row.ID > existingSummary.UpToMsgID {
				prevEnd = i
				break
			}
			if i == len(historyRows)-1 {
				prevEnd = len(historyRows)
			}
		}
		if prevEnd >= splitPoint {
			return nil, actionErr("已有摘要覆盖了所有早期消息，无需再次压缩。")
		}
		toCompress = append(toCompress, ChatMessage{
			Role:    "assistant",
			Content: "[之前的对话摘要]\n" + existingSummary.Content,
		})
		toCompress = append(toCompress, history[prevEnd:splitPoint]...)
		log.Printf("[ai] 增量压缩对话 %s: 上次摘要 + %d 条新消息", convID, splitPoint-prevEnd)
	} else {
		toCompress = history[:splitPoint]
		log.Printf("[ai] 首次压缩对话 %s: %d 条早期消息", convID, len(toCompress))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	summaryContent, err := GenerateSummary(ctx, *cfg, toCompress)
	if err != nil {
		return nil, actionErr("摘要生成失败: " + err.Error())
	}

	if err := database.InsertSummary(convID, summaryContent, splitMsgID); err != nil {
		log.Printf("[ai] 保存摘要失败: %v", err)
	}

	summaryTokens := EstimateTokens(summaryContent)
	earlyTokens := 0
	for _, msg := range toCompress {
		earlyTokens += EstimateMessageTokens(msg)
	}

	return &CompressResult{
		TotalMessages:    len(history),
		TotalTokens:      totalTokens,
		CompressedCount:  len(toCompress),
		CompressedTokens: earlyTokens,
		SummaryTokens:    summaryTokens,
		KeptMessages:     len(history) - splitPoint,
	}, nil
}

// ---------------------------------------------------------------------------
// Scheduled job actions
// ---------------------------------------------------------------------------

// ActionListScheduledJobs returns all scheduled jobs.
func ActionListScheduledJobs() []service.JobStatus {
	return service.GetScheduler().GetAllStatus()
}

// ActionCreateScheduledJob creates a new scheduled job. Returns the job ID.
func ActionCreateScheduledJob(name, jobType, cronExpr, configJSON string, silent bool, scheduleType string, runAtStr string, fileSvc service.FileCopier) (string, error) {
	if name == "" {
		return "", actionErr("name 不能为空")
	}
	if jobType == "" {
		jobType = "shell"
	}
	if scheduleType == "" {
		scheduleType = "cron"
	}
	var runAt int64
	if scheduleType == "once" {
		if runAtStr == "" {
			return "", actionErr("一次性任务必须指定 run_at")
		}
		var err error
		runAt, err = parseRunAt(runAtStr)
		if err != nil {
			return "", actionErr("run_at 格式错误: " + err.Error())
		}
		if runAt < time.Now().UnixMilli() {
			return "", actionErr("run_at 必须是未来的时间")
		}
		cronExpr = ""
	} else {
		if cronExpr == "" {
			return "", actionErr("cron_expr 不能为空")
		}
		if _, err := service.ParseCron(cronExpr); err != nil {
			return "", actionErr(fmt.Sprintf("无效的 cron 表达式 '%s': %v", cronExpr, err))
		}
	}
	jobID := "ai_" + genID()[:12]
	if err := service.DBCreateJob(jobID, name, jobType, configJSON, cronExpr, true, silent, scheduleType, runAt); err != nil {
		return "", actionErr("创建失败: " + err.Error())
	}
	job := service.ScheduledJob{
		ID:           jobID,
		Name:         name,
		CronExpr:     cronExpr,
		Run:          service.MakeJobRunFunc(jobID, jobType, configJSON, silent, service.NewSystemService(), fileSvc),
		Silent:       silent,
		Enabled:      true,
		JobType:      jobType,
		Config:       configJSON,
		ScheduleType: scheduleType,
		RunAt:        runAt,
	}
	service.GetScheduler().AddJob(job)
	return jobID, nil
}

// ActionUpdateScheduledJob updates an existing scheduled job.
func ActionUpdateScheduledJob(jobID, name, jobType, cronExpr, configJSON string, silent bool, scheduleType string, runAtStr string, fileSvc service.FileCopier) error {
	if jobID == "" {
		return actionErr("job_id 不能为空")
	}
	if jobType == "" {
		jobType = "shell"
	}
	if scheduleType == "" {
		scheduleType = "cron"
	}
	var runAt int64
	if scheduleType == "once" {
		if name == "" {
			return actionErr("name 不能为空")
		}
		if runAtStr != "" {
			var err error
			runAt, err = parseRunAt(runAtStr)
			if err != nil {
				return actionErr("run_at 格式错误: " + err.Error())
			}
		}
		cronExpr = ""
	} else {
		if name == "" || cronExpr == "" {
			return actionErr("name 和 cron_expr 不能为空")
		}
		if _, err := service.ParseCron(cronExpr); err != nil {
			return actionErr(fmt.Sprintf("无效的 cron 表达式 '%s': %v", cronExpr, err))
		}
	}
	if err := service.DBUpdateJob(jobID, name, jobType, configJSON, cronExpr, true, silent, scheduleType, runAt); err != nil {
		return actionErr("更新失败: " + err.Error())
	}
	runFn := service.MakeJobRunFunc(jobID, jobType, configJSON, silent, service.NewSystemService(), fileSvc)
	sched := service.GetScheduler()
	sched.UpdateJob(jobID, name, cronExpr, jobType, configJSON, runFn)
	sched.SetSilent(jobID, silent)
	sched.SetOnceSchedule(jobID, scheduleType, runAt)
	return nil
}

// ActionDeleteScheduledJob removes a scheduled job.
func ActionDeleteScheduledJob(jobID string) error {
	if jobID == "" {
		return actionErr("job_id 不能为空")
	}
	service.DBDeleteJob(jobID)
	service.GetScheduler().RemoveJob(jobID)
	return nil
}

// ActionRunScheduledJob triggers immediate execution of a job.
func ActionRunScheduledJob(jobID string) error {
	if jobID == "" {
		return actionErr("job_id 不能为空")
	}
	service.GetScheduler().RunNow(jobID)
	return nil
}

// ActionEnableScheduledJob enables a job.
func ActionEnableScheduledJob(jobID string) error {
	if jobID == "" {
		return actionErr("job_id 不能为空")
	}
	service.GetScheduler().EnableJob(jobID)
	return nil
}

// ActionDisableScheduledJob disables a job.
func ActionDisableScheduledJob(jobID string) error {
	if jobID == "" {
		return actionErr("job_id 不能为空")
	}
	service.GetScheduler().DisableJob(jobID)
	return nil
}

// parseRunAt parses a run_at string into Unix milliseconds.
// Supports relative formats: "+30s", "+5m", "+2h"
// Supports absolute format: "2006-01-02 15:04"
func parseRunAt(s string) (int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("空字符串")
	}
	// Relative time: +Ns, +Nm, +Nh
	if strings.HasPrefix(s, "+") {
		body := s[1:]
		if len(body) < 2 {
			return 0, fmt.Errorf("无效的相对时间: %s", s)
		}
		unit := body[len(body)-1]
		numStr := body[:len(body)-1]
		var n int
		if _, err := fmt.Sscanf(numStr, "%d", &n); err != nil || n <= 0 {
			return 0, fmt.Errorf("无效的数值: %s", numStr)
		}
		var d time.Duration
		switch unit {
		case 's':
			d = time.Duration(n) * time.Second
		case 'm':
			d = time.Duration(n) * time.Minute
		case 'h':
			d = time.Duration(n) * time.Hour
		default:
			return 0, fmt.Errorf("不支持的时间单位: %c（支持 s/m/h）", unit)
		}
		return time.Now().Add(d).UnixMilli(), nil
	}
	// Absolute time: try with seconds first, then without
	t, err := time.ParseInLocation("2006-01-02 15:04:05", s, time.Local)
	if err != nil {
		t, err = time.ParseInLocation("2006-01-02 15:04", s, time.Local)
		if err != nil {
			return 0, fmt.Errorf("无法解析时间 '%s'，支持格式: +30s, +5m, +2h, 2006-01-02 15:04:05", s)
		}
	}
	return t.UnixMilli(), nil
}
