package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/storage"
)

// ScheduledJob defines a recurring task managed by the Scheduler.
type ScheduledJob struct {
	ID           string
	Name         string
	CronExpr     string // 6-field cron: sec min hour dom month dow
	Run          func()
	Silent       bool // true = don't show toast notification on frontend
	Enabled      bool
	JobType      string // "system" | "shell" | "builtin"
	Config       string // JSON config
	ScheduleType string // "cron" | "once"
	RunAt        int64  // unix ms timestamp for one-time jobs
	CreatedAt    int64  // unix ms timestamp
}

// JobStatus is the public view of a scheduled job.
type JobStatus struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Silent       bool   `json:"silent"`
	Enabled      bool   `json:"enabled"`
	CronExpr     string `json:"cronExpr"`
	CronDesc     string `json:"cronDesc"`
	JobType      string `json:"jobType"`
	Config       string `json:"config"`
	LastRunAt    int64  `json:"lastRunAt"`
	NextRunAt    int64  `json:"nextRunAt"`
	LastStatus   string `json:"lastStatus"`
	LastMessage  string `json:"lastMessage"`
	ScheduleType string `json:"scheduleType"`
	RunAt        int64  `json:"runAt"`
	CreatedAt    int64  `json:"createdAt"`
}

type runningJob struct {
	job         ScheduledJob
	cron        *CronExpr
	timer       *time.Timer
	cancel      context.CancelFunc
	running     bool // guard against overlapping runs
	runMu       sync.Mutex
	lastRunAt   int64
	nextRunAt   int64
	lastStatus  string
	lastMessage string
}

type schedulerSubscriber func(status JobStatus)

// Scheduler manages periodic execution of registered jobs.
type Scheduler struct {
	mu          sync.Mutex
	jobs        map[string]*runningJob
	started     bool
	subscribers map[string]schedulerSubscriber
	subSeq      int
}

var (
	schedulerInstance *Scheduler
	schedulerOnce     sync.Once
)

// GetScheduler returns the singleton Scheduler instance.
func GetScheduler() *Scheduler {
	schedulerOnce.Do(func() {
		schedulerInstance = &Scheduler{
			jobs:        make(map[string]*runningJob),
			subscribers: make(map[string]schedulerSubscriber),
		}
	})
	return schedulerInstance
}

// Register adds a job before Start. For system tasks.
func (s *Scheduler) Register(job ScheduledJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cron, err := ParseCron(job.CronExpr)
	if err != nil {
		log.Printf("[scheduler] invalid cron for job %s: %v", job.ID, err)
		return
	}
	_, cancel := context.WithCancel(context.Background())
	s.jobs[job.ID] = &runningJob{
		job:    job,
		cron:   cron,
		cancel: cancel,
	}
}

// Start launches all registered jobs.
func (s *Scheduler) Start() {
	s.mu.Lock()
	s.started = true
	jobs := make([]*runningJob, 0, len(s.jobs))
	for _, rj := range s.jobs {
		if rj.job.Enabled {
			jobs = append(jobs, rj)
		}
	}
	s.mu.Unlock()

	for _, rj := range jobs {
		s.startJob(rj)
	}
	log.Printf("[scheduler] started %d jobs", len(jobs))
}

// startJob creates a new context and starts the scheduling loop for a job.
// Must be called with the old context already cancelled (or on first start).
func (s *Scheduler) startJob(rj *runningJob) {
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	rj.cancel = cancel
	s.mu.Unlock()

	if rj.job.ScheduleType == "once" {
		s.scheduleOnce(rj, ctx)
	} else {
		s.scheduleNext(rj, ctx)
	}
}

// stopJob cancels the job's context, stopping its scheduling goroutine.
func (s *Scheduler) stopJob(rj *runningJob) {
	s.mu.Lock()
	if rj.cancel != nil {
		rj.cancel()
	}
	s.mu.Unlock()
}

func (s *Scheduler) runOnce(rj *runningJob) {
	rj.runMu.Lock()
	if rj.running {
		rj.runMu.Unlock()
		return
	}
	rj.running = true
	rj.runMu.Unlock()

	go func() {
		defer func() {
			rj.runMu.Lock()
			rj.running = false
			rj.runMu.Unlock()
		}()
		log.Printf("[scheduler] running job: %s", rj.job.Name)
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[scheduler] job %s panicked: %v", rj.job.Name, r)
					s.mu.Lock()
					rj.lastRunAt = time.Now().UnixMilli()
					rj.lastStatus = "failed"
					rj.lastMessage = "panic"
					s.mu.Unlock()
					s.notifyChange(rj)
				}
			}()
			rj.job.Run()
			s.mu.Lock()
			rj.lastRunAt = time.Now().UnixMilli()
			rj.lastStatus = "success"
			rj.lastMessage = ""
			s.mu.Unlock()
			s.notifyChange(rj)
		}()
	}()
}

func (s *Scheduler) scheduleNext(rj *runningJob, ctx context.Context) {
	now := time.Now()
	next := rj.cron.Next(now)
	delay := next.Sub(now)
	if delay < 0 {
		delay = 1 * time.Second
	}

	s.mu.Lock()
	rj.nextRunAt = next.UnixMilli()
	s.mu.Unlock()

	rj.timer = time.NewTimer(delay)
	go func() {
		select {
		case <-ctx.Done():
			rj.timer.Stop()
			return
		case <-rj.timer.C:
			s.runOnce(rj)
			// Schedule the next run (reuse same ctx)
			s.scheduleNext(rj, ctx)
		}
	}()
}

// scheduleOnce schedules a one-time job. After execution, the job is automatically removed.
func (s *Scheduler) scheduleOnce(rj *runningJob, ctx context.Context) {
	now := time.Now()
	target := time.UnixMilli(rj.job.RunAt)
	delay := target.Sub(now)
	if delay < 0 {
		// Already past the target time, run immediately
		delay = 0
	}

	s.mu.Lock()
	rj.nextRunAt = rj.job.RunAt
	s.mu.Unlock()
	s.notifyChange(rj)

	rj.timer = time.NewTimer(delay)
	go func() {
		select {
		case <-ctx.Done():
			rj.timer.Stop()
			return
		case <-rj.timer.C:
			s.runOnce(rj)
			// One-time job: auto-remove after execution
			jobID := rj.job.ID
			// Small delay to let runOnce's goroutine start and update status
			time.AfterFunc(2*time.Second, func() {
				DBDeleteJob(jobID)
				s.RemoveJob(jobID)
				log.Printf("[scheduler] one-time job %s completed and removed", jobID)
			})
		}
	}()
}

// AddJob adds a user job at runtime and starts its timer immediately.
func (s *Scheduler) AddJob(job ScheduledJob) {
	if job.ScheduleType == "" {
		job.ScheduleType = "cron"
	}

	var cron *CronExpr
	if job.ScheduleType == "cron" {
		var err error
		cron, err = ParseCron(job.CronExpr)
		if err != nil {
			log.Printf("[scheduler] invalid cron for job %s: %v", job.ID, err)
			return
		}
	}

	_, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	rj := &runningJob{
		job:    job,
		cron:   cron,
		cancel: cancel,
	}
	s.jobs[job.ID] = rj
	started := s.started
	s.mu.Unlock()

	if started && job.Enabled {
		s.startJob(rj)
	}
}

// RemoveJob stops and removes a job by ID.
func (s *Scheduler) RemoveJob(id string) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if ok {
		delete(s.jobs, id)
		if rj.cancel != nil {
			rj.cancel()
		}
	}
	s.mu.Unlock()
}

// EnableJob enables a job and starts its timer.
func (s *Scheduler) EnableJob(id string) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	rj.job.Enabled = true
	started := s.started
	// Cancel old scheduling goroutine before starting new one
	if rj.cancel != nil {
		rj.cancel()
	}
	s.mu.Unlock()
	if started {
		s.startJob(rj)
	}
	s.notifyChange(rj)
}

// DisableJob disables a job and stops its timer.
func (s *Scheduler) DisableJob(id string) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	rj.job.Enabled = false
	if rj.cancel != nil {
		rj.cancel()
	}
	s.mu.Unlock()
	s.notifyChange(rj)
}

// RunNow triggers immediate execution of a job.
func (s *Scheduler) RunNow(id string) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	s.mu.Unlock()
	if ok {
		s.runOnce(rj)
	}
}

// UpdateJob updates a running job's properties.
func (s *Scheduler) UpdateJob(id string, name string, cronExpr string, jobType string, config string, run func()) {
	cron, err := ParseCron(cronExpr)
	if err != nil {
		log.Printf("[scheduler] invalid cron for job %s: %v", id, err)
		return
	}

	s.mu.Lock()
	rj, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	rj.job.Name = name
	rj.job.CronExpr = cronExpr
	rj.cron = cron
	rj.job.JobType = jobType
	rj.job.Config = config
	if run != nil {
		rj.job.Run = run
	}
	enabled := rj.job.Enabled
	started := s.started
	// Cancel old scheduling goroutine
	if rj.cancel != nil {
		rj.cancel()
	}
	s.mu.Unlock()

	// Restart with new cron
	if started && enabled {
		s.startJob(rj)
	}
	s.notifyChange(rj)
}

// GetAllStatus returns status of all jobs, sorted by creation time.
func (s *Scheduler) GetAllStatus() []JobStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]JobStatus, 0, len(s.jobs))
	for _, rj := range s.jobs {
		result = append(result, s.jobStatus(rj))
	}
	// Sort by creation time (oldest first)
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt < result[j].CreatedAt
	})
	return result
}

func (s *Scheduler) jobStatus(rj *runningJob) JobStatus {
	desc := ""
	if rj.cron != nil {
		desc = rj.cron.Describe()
	}
	schedType := rj.job.ScheduleType
	if schedType == "" {
		schedType = "cron"
	}
	return JobStatus{
		ID:           rj.job.ID,
		Name:         rj.job.Name,
		Silent:       rj.job.Silent,
		Enabled:      rj.job.Enabled,
		CronExpr:     rj.job.CronExpr,
		CronDesc:     desc,
		JobType:      rj.job.JobType,
		Config:       rj.job.Config,
		LastRunAt:    rj.lastRunAt,
		NextRunAt:    rj.nextRunAt,
		LastStatus:   rj.lastStatus,
		LastMessage:  rj.lastMessage,
		ScheduleType: schedType,
		RunAt:        rj.job.RunAt,
		CreatedAt:    rj.job.CreatedAt,
	}
}

// SetSilent updates the silent flag on a job.
func (s *Scheduler) SetSilent(id string, silent bool) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if ok {
		rj.job.Silent = silent
	}
	s.mu.Unlock()
	if ok {
		s.notifyChange(rj)
	}
}

// SetOnceSchedule updates the schedule type and run_at on a job.
func (s *Scheduler) SetOnceSchedule(id string, scheduleType string, runAt int64) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if ok {
		rj.job.ScheduleType = scheduleType
		rj.job.RunAt = runAt
	}
	s.mu.Unlock()
}

// SetJobResult allows external code to update last run status (used by handler).
func (s *Scheduler) SetJobResult(id string, status string, message string) {
	s.mu.Lock()
	rj, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	rj.lastRunAt = time.Now().UnixMilli()
	rj.lastStatus = status
	rj.lastMessage = message
	s.mu.Unlock()
	s.notifyChange(rj)
}

// Subscribe registers a listener for job status changes.
func (s *Scheduler) Subscribe(id string, handler schedulerSubscriber) {
	s.mu.Lock()
	s.subscribers[id] = handler
	s.mu.Unlock()
}

// Unsubscribe removes a listener.
func (s *Scheduler) Unsubscribe(id string) {
	s.mu.Lock()
	delete(s.subscribers, id)
	s.mu.Unlock()
}

func (s *Scheduler) notifyChange(rj *runningJob) {
	s.mu.Lock()
	status := s.jobStatus(rj)
	subs := make([]schedulerSubscriber, 0, len(s.subscribers))
	for _, fn := range s.subscribers {
		subs = append(subs, fn)
	}
	s.mu.Unlock()
	for _, fn := range subs {
		fn(status)
	}
}

// Stop signals all job goroutines to exit.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	for _, rj := range s.jobs {
		if rj.cancel != nil {
			rj.cancel()
		}
	}
	s.mu.Unlock()
}

// ==================== DB persistence helpers ====================

func DBCreateJob(id, name, jobType, cfg string, cronExpr string, enabled bool, silent bool, scheduleType string, runAt int64) error {
	now := time.Now().UnixMilli()
	en := 0
	if enabled {
		en = 1
	}
	si := 0
	if silent {
		si = 1
	}
	if scheduleType == "" {
		scheduleType = "cron"
	}
	_, err := database.DB().Exec(
		`INSERT INTO scheduled_jobs (id, name, job_type, config, cron_expr, enabled, silent, schedule_type, run_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, name, jobType, cfg, cronExpr, en, si, scheduleType, runAt, now, now,
	)
	return err
}

func DBUpdateJob(id, name, jobType, cfg string, cronExpr string, enabled bool, silent bool, scheduleType string, runAt int64) error {
	now := time.Now().UnixMilli()
	en := 0
	if enabled {
		en = 1
	}
	si := 0
	if silent {
		si = 1
	}
	if scheduleType == "" {
		scheduleType = "cron"
	}
	_, err := database.DB().Exec(
		`UPDATE scheduled_jobs SET name=?, job_type=?, config=?, cron_expr=?, enabled=?, silent=?, schedule_type=?, run_at=?, updated_at=? WHERE id=?`,
		name, jobType, cfg, cronExpr, en, si, scheduleType, runAt, now, id,
	)
	return err
}

func DBDeleteJob(id string) error {
	_, err := database.DB().Exec(`DELETE FROM scheduled_jobs WHERE id=?`, id)
	return err
}

func DBUpdateJobStatus(id string, status string, message string) {
	now := time.Now().UnixMilli()
	database.DB().Exec(
		`UPDATE scheduled_jobs SET last_run_at=?, last_status=?, last_message=?, updated_at=? WHERE id=?`,
		now, status, message, now, id,
	)
}

// ==================== Job run function factory ====================

type shellConfig struct {
	Command string `json:"command"`
}

type commandConfig struct {
	Command string `json:"command"` // slash command text, e.g. "notify 定时备份完成" or "status"
}

type builtinConfig struct {
	Operation string   `json:"operation"`
	NodeID    string   `json:"nodeId,omitempty"`
	DstNodeID string   `json:"dstNodeId,omitempty"`
	Paths     []string `json:"paths,omitempty"`
	Path      string   `json:"path,omitempty"`
	To        string   `json:"to,omitempty"`
	Output    string   `json:"output,omitempty"`
	Dest      string   `json:"dest,omitempty"`
}

// SystemExecer is the interface for executing shell commands (satisfied by SystemService).
type SystemExecer interface {
	Exec(command string) (stdout, stderr string, exitCode int, err error)
}

// FileCopier is the interface for file operations needed by scheduled jobs.
type FileCopier interface {
	CopyAcross(srcNode, srcPath, dstNode, dstPath string, progress storage.ProgressFunc) error
	Copy(nodeID, srcPath, dstPath string, progress storage.ProgressFunc) (string, error)
	Compress(nodeID string, paths []string, output string, onProgress ProgressCallback) error
	Extract(nodeID, archivePath, dest, password string, onProgress ProgressCallback) error
}

// CleanStaleUploadsFn is set by the handler package to avoid circular imports.
var CleanStaleUploadsFn func()

// MakeJobRunFunc creates a Run function based on job type, config JSON, and silent flag.
func MakeJobRunFunc(jobID, jobType, cfg string, silent bool, systemSvc SystemExecer, fileSvc FileCopier) func() {
	submitFn := GetTaskManager().Submit
	if silent {
		submitFn = GetTaskManager().SubmitSilent
	}

	switch jobType {
	case "shell":
		var sc shellConfig
		json.Unmarshal([]byte(cfg), &sc)
		return func() {
			submitFn("scheduled_shell", "定时: "+sc.Command, func(ctx context.Context, r *ProgressReporter) (string, error) {
				stdout, stderr, exitCode, err := systemSvc.Exec(sc.Command)
				sched := GetScheduler()
				if err != nil {
					DBUpdateJobStatus(jobID, "failed", err.Error())
					sched.SetJobResult(jobID, "failed", err.Error())
					return "", err
				}
				if exitCode != 0 {
					msg := fmt.Sprintf("exit %d: %s", exitCode, stderr)
					DBUpdateJobStatus(jobID, "failed", msg)
					sched.SetJobResult(jobID, "failed", msg)
					return "", fmt.Errorf("%s", msg)
				}
				msg := stdout
				if len(msg) > 200 {
					msg = msg[:200]
				}
				DBUpdateJobStatus(jobID, "success", msg)
				sched.SetJobResult(jobID, "success", msg)
				return "完成", nil
			})
		}
	case "builtin":
		var bc builtinConfig
		json.Unmarshal([]byte(cfg), &bc)
		return makeBuiltinRun(jobID, bc, submitFn, fileSvc)
	case "command":
		var cc commandConfig
		json.Unmarshal([]byte(cfg), &cc)
		return func() {
			cmdText := strings.TrimPrefix(cc.Command, "/")
			submitFn("scheduled_command", "定时: /"+cmdText, func(ctx context.Context, r *ProgressReporter) (string, error) {
				ce := GetCommandExecutor()
				name, args, ok := ParseCommand("/" + cmdText)
				if !ok {
					msg := "无效的命令: " + cmdText
					DBUpdateJobStatus(jobID, "failed", msg)
					GetScheduler().SetJobResult(jobID, "failed", msg)
					return "", fmt.Errorf("%s", msg)
				}
				result := ce.ExecuteCommandForClient("", name, args, "")
				if result.IsError {
					DBUpdateJobStatus(jobID, "failed", result.Text)
					GetScheduler().SetJobResult(jobID, "failed", result.Text)
					return "", fmt.Errorf("%s", result.Text)
				}
				// Handle side effects (e.g. model switch persistence)
				ce.HandleCommandResult("", result)
				msg := result.Text
				if len(msg) > 200 {
					msg = msg[:200]
				}
				DBUpdateJobStatus(jobID, "success", msg)
				GetScheduler().SetJobResult(jobID, "success", msg)
				return "完成", nil
			})
		}
	default:
		return func() {}
	}
}

func makeBuiltinRun(jobID string, bc builtinConfig, submitFn func(string, string, func(context.Context, *ProgressReporter) (string, error), ...SubmitOption) string, fileSvc FileCopier) func() {
	reportResult := func(status, message string) {
		DBUpdateJobStatus(jobID, status, message)
		GetScheduler().SetJobResult(jobID, status, message)
	}

	switch bc.Operation {
	case "rebuild-index-local":
		return func() {
			nodes, err := database.ListStorageNodes()
			if err != nil {
				reportResult("error", err.Error())
				return
			}
			for _, node := range nodes {
				if node.Type == "local" {
					n := node
					submitFn("index", "定时: 本地索引 "+n.ID, func(ctx context.Context, r *ProgressReporter) (string, error) {
						if NodeHasIndex(n.ID) {
							IncrementalIndexLocal(ctx, n.ID)
						} else {
							BuildFullIndex(ctx, n.ID, n.Type)
						}
						reportResult("success", "索引完成")
						return "索引完成", nil
					})
				}
			}
		}
	case "rebuild-index-s3":
		return func() {
			nodes, err := database.ListStorageNodes()
			if err != nil {
				reportResult("error", err.Error())
				return
			}
			for _, node := range nodes {
				if node.Type == "s3" {
					n := node
					submitFn("index", "定时: S3索引 "+n.ID, func(ctx context.Context, r *ProgressReporter) (string, error) {
						BuildFullIndex(ctx, n.ID, n.Type)
						reportResult("success", "S3索引完成")
						return "S3索引完成", nil
					})
				}
			}
		}
	case "clean-uploads":
		return func() {
			submitFn("maintenance", "定时: 清理过期上传", func(ctx context.Context, r *ProgressReporter) (string, error) {
				if CleanStaleUploadsFn != nil {
					CleanStaleUploadsFn()
				}
				reportResult("success", "清理完成")
				return "清理完成", nil
			})
		}
	case "copy":
		return func() {
			paths := bc.Paths
			if len(paths) == 0 {
				reportResult("failed", "未指定源路径")
				return
			}
			srcNode := bc.NodeID
			dstNode := bc.DstNodeID
			if dstNode == "" {
				dstNode = srcNode
			}
			to := bc.To
			title := fmt.Sprintf("定时: 复制 %d 个项目", len(paths))
			crossStorage := srcNode != dstNode
			submitFn("fs.copy", title, func(ctx context.Context, r *ProgressReporter) (string, error) {
				total := int64(len(paths))
				for i, p := range paths {
					progress := storage.ProgressFunc(func(written, size int64) {
						itemProgress := float64(0)
						if size > 0 {
							itemProgress = float64(written) / float64(size)
						}
						overall := (float64(i) + itemProgress) / float64(total)
						r.Report(overall, int64(i+1), total, written, size, filepath.Base(p))
					})
					if crossStorage {
						if err := fileSvc.CopyAcross(srcNode, p, dstNode, to, progress); err != nil {
							reportResult("failed", err.Error())
							return "", err
						}
					} else {
						if _, err := fileSvc.Copy(srcNode, p, to, progress); err != nil {
							reportResult("failed", err.Error())
							return "", err
						}
					}
				}
				msg := fmt.Sprintf("已复制 %d 个项目", len(paths))
				reportResult("success", msg)
				return msg, nil
			})
		}
	case "compress":
		return func() {
			if len(bc.Paths) == 0 || bc.Output == "" {
				reportResult("failed", "未指定路径或输出文件名")
				return
			}
			submitFn("fs.compress", "定时: 压缩 "+filepath.Base(bc.Output), func(ctx context.Context, r *ProgressReporter) (string, error) {
				if err := fileSvc.Compress(bc.NodeID, bc.Paths, bc.Output, nil); err != nil {
					reportResult("failed", err.Error())
					return "", err
				}
				reportResult("success", bc.Output)
				return bc.Output, nil
			})
		}
	case "extract":
		return func() {
			if bc.Path == "" {
				reportResult("failed", "未指定压缩文件路径")
				return
			}
			dest := bc.Dest
			if dest == "" {
				dest = filepath.Dir(bc.Path)
			}
			submitFn("fs.extract", "定时: 解压 "+filepath.Base(bc.Path), func(ctx context.Context, r *ProgressReporter) (string, error) {
				if err := fileSvc.Extract(bc.NodeID, bc.Path, dest, "", nil); err != nil {
					reportResult("failed", err.Error())
					return "", err
				}
				reportResult("success", dest)
				return dest, nil
			})
		}
	default:
		return func() {
			log.Printf("[scheduler] unknown builtin operation: %s", bc.Operation)
		}
	}
}

// SeedDefaultJobs inserts default scheduled jobs into the DB if they don't exist yet.
func SeedDefaultJobs() {
	defaults := []struct {
		id, name, jobType, config, cronExpr string
		silent                              bool
	}{
		{"default-index-local", "本地索引", "builtin", `{"operation":"rebuild-index-local"}`, "0 0 3 * * *", true},
		{"default-index-s3", "S3索引", "builtin", `{"operation":"rebuild-index-s3"}`, "0 0 3 * * *", true},
		{"default-upload-cleaner", "清理过期上传", "builtin", `{"operation":"clean-uploads"}`, "0 */30 * * * *", true},
	}
	for _, d := range defaults {
		var count int
		row := database.DB().QueryRow(`SELECT COUNT(*) FROM scheduled_jobs WHERE id=?`, d.id)
		if err := row.Scan(&count); err != nil || count > 0 {
			continue
		}
		if err := DBCreateJob(d.id, d.name, d.jobType, d.config, d.cronExpr, true, d.silent, "cron", 0); err != nil {
			log.Printf("[scheduler] failed to seed default job %s: %v", d.id, err)
		}
	}
}

// LoadPersistedJobs loads user-defined jobs from DB and registers them with the scheduler.
func LoadPersistedJobs(systemSvc SystemExecer, fileSvc FileCopier) {
	rows, err := database.DB().Query(
		`SELECT id, name, job_type, config, cron_expr, enabled, silent, last_run_at, last_status, last_message, schedule_type, run_at, created_at FROM scheduled_jobs`,
	)
	if err != nil {
		log.Printf("[scheduler] failed to load persisted jobs: %v", err)
		return
	}
	defer rows.Close()

	sched := GetScheduler()
	count := 0
	for rows.Next() {
		var id, name, jobType, cfg, cronExpr string
		var enabled, silent int
		var lastRunAt *int64
		var lastStatus, lastMessage *string
		var scheduleType string
		var runAt, createdAt int64
		if err := rows.Scan(&id, &name, &jobType, &cfg, &cronExpr, &enabled, &silent, &lastRunAt, &lastStatus, &lastMessage, &scheduleType, &runAt, &createdAt); err != nil {
			log.Printf("[scheduler] scan job row: %v", err)
			continue
		}
		if scheduleType == "" {
			scheduleType = "cron"
		}
		// Skip one-time jobs whose target time has already passed
		if scheduleType == "once" && runAt > 0 && runAt < time.Now().UnixMilli() {
			DBDeleteJob(id)
			continue
		}
		isSilent := silent == 1
		job := ScheduledJob{
			ID:           id,
			Name:         name,
			CronExpr:     cronExpr,
			Run:          MakeJobRunFunc(id, jobType, cfg, isSilent, systemSvc, fileSvc),
			Silent:       isSilent,
			Enabled:      enabled == 1,
			JobType:      jobType,
			Config:       cfg,
			ScheduleType: scheduleType,
			RunAt:        runAt,
			CreatedAt:    createdAt,
		}
		sched.AddJob(job)
		count++
	}
	if count > 0 {
		log.Printf("[scheduler] loaded %d persisted jobs", count)
	}
}
