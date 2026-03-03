package ai

import (
	"encoding/json"
	"runtime"

	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// SystemContext is the unified interface for perceiving and subscribing to system state.
// AI assistant chat UI and future flow panel both consume this.
type SystemContext interface {
	Snapshot() SystemSnapshot
	Subscribe(id string, sink ChatSink)
	Unsubscribe(id string)
}

type SystemSnapshot struct {
	Executor ExecutorSnapshot `json:"executor"`
	Tasks    []TaskInfo       `json:"tasks"`
	Jobs     []JobSnapshot    `json:"jobs"`
	Health   HealthSnapshot   `json:"health"`
	Storage  []StorageNode    `json:"storage"`
	Queue    []QueueItem      `json:"queue"`
}

type ExecutorSnapshot struct {
	State            string `json:"state"`
	RunningConvID    string `json:"runningConvId"`
	RunningConvTitle string `json:"runningConvTitle"`
	ActiveConvID     string `json:"activeConvId"`
	QueueSize        int    `json:"queueSize"`
}

type JobSnapshot struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Cron      string `json:"cron"`
	CronDesc  string `json:"cronDesc"`
	Enabled   bool   `json:"enabled"`
	Status    string `json:"status"`
	LastRunAt int64  `json:"lastRunAt,omitempty"`
	NextRunAt int64  `json:"nextRunAt,omitempty"`
}

type HealthSnapshot struct {
	Goroutines   int     `json:"goroutines"`
	MemAllocMB   float64 `json:"memAllocMB"`
	MemSysMB     float64 `json:"memSysMB"`
	NumCPU       int     `json:"numCPU"`
	TasksRunning int     `json:"tasksRunning"`
}

type StorageNode struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type QueueItem struct {
	ID     int64  `json:"id"`
	ConvID string `json:"convId"`
	Text   string `json:"text"`
}

// --- Default implementation ---

type defaultSystemContext struct {
	executorStatusFn func() ExecutorStatus
	sink             *BroadcastSink
}

func NewSystemContext(executorStatusFn func() ExecutorStatus, sink *BroadcastSink) SystemContext {
	return &defaultSystemContext{executorStatusFn: executorStatusFn, sink: sink}
}

func (sc *defaultSystemContext) Subscribe(id string, sink ChatSink) {
	sc.sink.Add(id, sink)
}

func (sc *defaultSystemContext) Unsubscribe(id string) {
	sc.sink.Remove(id)
}

func (sc *defaultSystemContext) Snapshot() SystemSnapshot {
	es := sc.executorStatusFn()
	tasks := ActionListTasks("")

	var jobs []JobSnapshot
	for _, j := range service.GetScheduler().GetAllStatus() {
		jobs = append(jobs, JobSnapshot{
			ID: j.ID, Name: j.Name, Cron: j.CronExpr, CronDesc: j.CronDesc,
			Enabled: j.Enabled, Status: j.LastStatus,
			LastRunAt: j.LastRunAt, NextRunAt: j.NextRunAt,
		})
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	var storage []StorageNode
	if nodes, err := database.ListStorageNodes(); err == nil {
		for _, n := range nodes {
			storage = append(storage, StorageNode{ID: n.ID, Name: n.Name, Type: n.Type})
		}
	}

	var queue []QueueItem
	if rows, err := database.ListPendingAIQueue(); err == nil {
		for _, r := range rows {
			t := r.Content
			if len(t) > 100 {
				t = t[:100] + "..."
			}
			queue = append(queue, QueueItem{ID: r.ID, ConvID: r.ConvID, Text: t})
		}
	}

	return SystemSnapshot{
		Executor: ExecutorSnapshot{
			State: es.State, RunningConvID: es.RunningConvID,
			RunningConvTitle: es.RunningConvTitle, ActiveConvID: es.ActiveConvID,
			QueueSize: es.QueueSize,
		},
		Tasks: tasks, Jobs: jobs,
		Health: HealthSnapshot{
			Goroutines:   runtime.NumGoroutine(),
			MemAllocMB:   float64(m.Alloc) / 1024 / 1024,
			MemSysMB:     float64(m.Sys) / 1024 / 1024,
			NumCPU:       runtime.NumCPU(),
			TasksRunning: service.GetTaskManager().RunningCount(),
		},
		Storage: storage, Queue: queue,
	}
}

func snapshotJSON(sc SystemContext) string {
	data, _ := json.MarshalIndent(sc.Snapshot(), "", "  ")
	return string(data)
}
