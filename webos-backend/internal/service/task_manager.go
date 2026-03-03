package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type TaskStatus string

const (
	TaskRunning   TaskStatus = "running"
	TaskSuccess   TaskStatus = "success"
	TaskFailed    TaskStatus = "failed"
	TaskCancelled TaskStatus = "cancelled"
)

type BackgroundTask struct {
	ID              string     `json:"id"`
	Type            string     `json:"type"`
	Title           string     `json:"title"`
	Category        string     `json:"category,omitempty"`
	Status          TaskStatus `json:"status"`
	Message         string     `json:"message"`
	CreatedAt       int64      `json:"createdAt"`
	DoneAt          int64      `json:"doneAt,omitempty"`
	Progress        *float64   `json:"progress,omitempty"`
	ItemCurrent     int64      `json:"itemCurrent,omitempty"`
	ItemTotal       int64      `json:"itemTotal,omitempty"`
	BytesCurrent    int64      `json:"bytesCurrent,omitempty"`
	BytesTotal      int64      `json:"bytesTotal,omitempty"`
	Cancellable     bool       `json:"cancellable"`
	Silent          bool       `json:"silent,omitempty"`
	RefreshChannels []string   `json:"refreshChannels,omitempty"`
}

// ProgressReporter allows task functions to report progress.
type ProgressReporter struct {
	tm          *TaskManager
	taskID      string
	lastBcast   time.Time
	minInterval time.Duration
}

// Report updates the task progress and broadcasts to listeners (throttled).
func (r *ProgressReporter) Report(progress float64, itemCurrent, itemTotal, bytesCurrent, bytesTotal int64, message string) {
	now := time.Now()
	r.tm.mu.Lock()
	for i := range r.tm.tasks {
		if r.tm.tasks[i].ID == r.taskID {
			p := progress
			r.tm.tasks[i].Progress = &p
			r.tm.tasks[i].ItemCurrent = itemCurrent
			r.tm.tasks[i].ItemTotal = itemTotal
			r.tm.tasks[i].BytesCurrent = bytesCurrent
			r.tm.tasks[i].BytesTotal = bytesTotal
			if message != "" {
				r.tm.tasks[i].Message = message
			}
			break
		}
	}
	r.tm.mu.Unlock()

	if now.Sub(r.lastBcast) >= r.minInterval {
		r.lastBcast = now
		r.tm.mu.Lock()
		var task BackgroundTask
		for _, t := range r.tm.tasks {
			if t.ID == r.taskID {
				task = t
				break
			}
		}
		r.tm.mu.Unlock()
		r.tm.broadcast(task)
	}
}

// Flush forces a broadcast of the current state (used before completion).
func (r *ProgressReporter) Flush() {
	r.tm.mu.Lock()
	var task BackgroundTask
	for _, t := range r.tm.tasks {
		if t.ID == r.taskID {
			task = t
			break
		}
	}
	r.tm.mu.Unlock()
	r.tm.broadcast(task)
}

type taskListener struct {
	handler func(BackgroundTask)
}

type TaskManager struct {
	mu         sync.Mutex
	tasks      []BackgroundTask
	listeners  map[string]*taskListener
	cancellers map[string]context.CancelFunc
	retryFns   map[string]func()
	maxTasks   int
}

var (
	taskMgr     *TaskManager
	taskMgrOnce sync.Once
)

func GetTaskManager() *TaskManager {
	taskMgrOnce.Do(func() {
		taskMgr = &TaskManager{
			tasks:      make([]BackgroundTask, 0),
			listeners:  make(map[string]*taskListener),
			cancellers: make(map[string]context.CancelFunc),
			retryFns:   make(map[string]func()),
			maxTasks:   50,
		}
	})
	return taskMgr
}

func genTaskID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "task_" + hex.EncodeToString(b)
}

// SubmitOption configures optional fields on a submitted task.
type SubmitOption func(*BackgroundTask)

// WithRefreshChannels sets channels the frontend should refresh when the task completes.
func WithRefreshChannels(channels []string) SubmitOption {
	return func(t *BackgroundTask) {
		t.RefreshChannels = channels
	}
}

// Submit creates a background task and runs fn in a goroutine.
// Returns the task ID immediately.
func (tm *TaskManager) Submit(taskType, title string, fn func(ctx context.Context, r *ProgressReporter) (string, error), opts ...SubmitOption) string {
	return tm.submit(taskType, title, false, fn, opts...)
}

// SubmitSilent creates a background task that won't trigger frontend toast notifications.
// The task still appears in the task list panel.
func (tm *TaskManager) SubmitSilent(taskType, title string, fn func(ctx context.Context, r *ProgressReporter) (string, error), opts ...SubmitOption) string {
	return tm.submit(taskType, title, true, fn, opts...)
}

func (tm *TaskManager) submit(taskType, title string, silent bool, fn func(ctx context.Context, r *ProgressReporter) (string, error), opts ...SubmitOption) string {
	task := BackgroundTask{
		ID:          genTaskID(),
		Type:        taskType,
		Title:       title,
		Status:      TaskRunning,
		CreatedAt:   time.Now().UnixMilli(),
		Cancellable: true,
		Silent:      silent,
	}

	for _, opt := range opts {
		opt(&task)
	}

	ctx, cancel := context.WithCancel(context.Background())

	tm.mu.Lock()
	tm.tasks = append(tm.tasks, task)
	if len(tm.tasks) > tm.maxTasks {
		tm.tasks = tm.tasks[len(tm.tasks)-tm.maxTasks:]
		// Clean up retryFns for tasks that were trimmed out.
		activeIDs := make(map[string]bool, len(tm.tasks))
		for _, t := range tm.tasks {
			activeIDs[t.ID] = true
		}
		for id := range tm.retryFns {
			if !activeIDs[id] {
				delete(tm.retryFns, id)
			}
		}
	}
	tm.cancellers[task.ID] = cancel
	tm.retryFns[task.ID] = func() {
		tm.Submit(taskType, title, fn, opts...)
	}
	tm.mu.Unlock()

	tm.broadcast(task)

	reporter := &ProgressReporter{
		tm:          tm,
		taskID:      task.ID,
		minInterval: 200 * time.Millisecond,
	}

	go func() {
		msg, err := fn(ctx, reporter)
		tm.mu.Lock()
		delete(tm.cancellers, task.ID)
		alreadyDone := false
		for i := range tm.tasks {
			if tm.tasks[i].ID == task.ID {
				if tm.tasks[i].Status != TaskRunning {
					alreadyDone = true
					break
				}
				if err != nil {
					tm.tasks[i].Status = TaskFailed
					tm.tasks[i].Message = err.Error()
				} else {
					tm.tasks[i].Status = TaskSuccess
					tm.tasks[i].Message = msg
					p := 1.0
					tm.tasks[i].Progress = &p
				}
				tm.tasks[i].Cancellable = false
				tm.tasks[i].DoneAt = time.Now().UnixMilli()
				task = tm.tasks[i]
				break
			}
		}
		tm.mu.Unlock()
		cancel()
		if !alreadyDone {
			tm.broadcast(task)
		}
	}()

	return task.ID
}

// Cancel cancels a running task by its ID. Returns true if the task was found and cancelled.
func (tm *TaskManager) Cancel(taskID string) bool {
	tm.mu.Lock()
	cancelFn, ok := tm.cancellers[taskID]
	if ok {
		delete(tm.cancellers, taskID)
		cancelFn()
		for i := range tm.tasks {
			if tm.tasks[i].ID == taskID && tm.tasks[i].Status == TaskRunning {
				tm.tasks[i].Status = TaskCancelled
				tm.tasks[i].Message = "已取消"
				tm.tasks[i].Cancellable = false
				tm.tasks[i].DoneAt = time.Now().UnixMilli()
				task := tm.tasks[i]
				tm.mu.Unlock()
				tm.broadcast(task)
				return true
			}
		}
	}
	tm.mu.Unlock()
	return false
}

// Retry re-runs a failed task using its stored retry closure. Returns the new task ID.
func (tm *TaskManager) Retry(taskID string) string {
	tm.mu.Lock()
	retryFn, ok := tm.retryFns[taskID]
	tm.mu.Unlock()
	if !ok {
		return ""
	}
	retryFn()
	tm.mu.Lock()
	newID := ""
	if len(tm.tasks) > 0 {
		newID = tm.tasks[len(tm.tasks)-1].ID
	}
	tm.mu.Unlock()
	return newID
}

// GetAll returns a copy of all tasks.
func (tm *TaskManager) GetAll() []BackgroundTask {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	result := make([]BackgroundTask, len(tm.tasks))
	copy(result, tm.tasks)
	return result
}

// Subscribe registers a listener for task updates. Returns an unsubscribe function.
func (tm *TaskManager) Subscribe(connID string, handler func(BackgroundTask)) func() {
	tm.mu.Lock()
	tm.listeners[connID] = &taskListener{handler: handler}
	tm.mu.Unlock()

	return func() {
		tm.mu.Lock()
		delete(tm.listeners, connID)
		tm.mu.Unlock()
	}
}

// RunningCount returns the number of currently running tasks.
func (tm *TaskManager) RunningCount() int {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	n := 0
	for _, t := range tm.tasks {
		if t.Status == TaskRunning {
			n++
		}
	}
	return n
}

func (tm *TaskManager) broadcast(task BackgroundTask) {
	tm.mu.Lock()
	snapshot := make([]*taskListener, 0, len(tm.listeners))
	for _, l := range tm.listeners {
		snapshot = append(snapshot, l)
	}
	tm.mu.Unlock()

	for _, l := range snapshot {
		l.handler(task)
	}
}
