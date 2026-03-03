package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"webos-backend/internal/ai"
	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/service"
)

// ==================== Service singletons ====================

var systemSvc = service.NewSystemService()
var dockerSvc = service.GetDockerService()
var diskSvc = service.NewDiskService()

// ==================== WSConn: per-connection shared state ====================

// WSConn holds all state associated with a single WebSocket connection.
type WSConn struct {
	ConnID    string
	Done      chan struct{}
	WriteJSON func(v interface{}) error

	// Subscriptions (overview, processes, docker_containers, …)
	Subs   map[string]*Subscription
	TickCh chan string // channel name to push

	PushMu  sync.Mutex
	Pushing map[string]bool

	// Terminal sessions
	Sessions map[string]*TerminalSession

	// File system watcher
	FileWatcher *service.FileWatcher
	FsWatches   map[string]string // "nodeId:path" -> absPath

	// Mount watcher
	MountWatcher  *service.MountWatcher
	MountWatching bool

	// Docker log subscription (one active at a time per connection)
	LogSubMu   sync.Mutex
	LogSubDone chan struct{}

	// Cancellable long-running operations, keyed by "type:key" (e.g. "fs_stat:nodeId:path")
	CancelMu sync.Mutex
	Cancels  map[string]context.CancelFunc
}

// Subscription represents a periodic data push subscription.
type Subscription struct {
	Channel  string
	Interval time.Duration
	Ticker   *time.Ticker
}

// TerminalSession holds a single pty session.
type TerminalSession struct {
	Sid  string
	Cmd  *exec.Cmd
	Ptmx *os.File
	Done chan struct{}
	Once sync.Once
}

func (s *TerminalSession) Cleanup() {
	s.Once.Do(func() {
		close(s.Done)
		s.Ptmx.Close()
		s.Cmd.Process.Kill()
		s.Cmd.Wait()
	})
}

// ==================== Handler registry ====================

// Handler is the signature for a domain-specific message handler.
// Protocol-agnostic — used by WebSocket, wasm, and any future protocol adapter.
type Handler func(c *WSConn, raw json.RawMessage)

var (
	handlersMu sync.Mutex
	handlers   = map[string]Handler{}
)

// RegisterHandlers registers one or more message-type → handler mappings.
func RegisterHandlers(m map[string]Handler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	for k, v := range m {
		handlers[k] = v
	}
}

// LookupHandler returns the handler for a given message type, or nil.
func LookupHandler(msgType string) Handler {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	return handlers[msgType]
}

// ==================== wsServerMsg ====================

type wsServerMsg struct {
	Type    string      `json:"type"`
	ReqID   string      `json:"reqId,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

// ==================== Reply helpers ====================

// Reply sends a success response.
func (c *WSConn) Reply(msgType, reqID string, data interface{}) {
	c.WriteJSON(wsServerMsg{Type: msgType, ReqID: reqID, Data: data})
}

// ReplyErr sends an error response.
func (c *WSConn) ReplyErr(msgType, reqID string, err error) {
	c.WriteJSON(wsServerMsg{Type: msgType, ReqID: reqID, Message: err.Error()})
}

// ReplyResult sends data on success or error message on failure.
func (c *WSConn) ReplyResult(msgType, reqID string, data interface{}, err error) {
	if err != nil {
		c.ReplyErr(msgType, reqID, err)
	} else {
		c.Reply(msgType, reqID, data)
	}
}

// ==================== Generic async handler ====================

// wsReq is the interface for all WS request params that carry a ReqID.
type wsReq interface {
	GetReqID() string
}

// baseReq can be embedded in request structs to satisfy wsReq.
type baseReq struct {
	ReqID string `json:"reqId"`
}

func (b baseReq) GetReqID() string { return b.ReqID }

// asyncHandler creates a Handler that unmarshals P, runs fn in a goroutine,
// and sends the result back with the given msgType.
func asyncHandler[P wsReq](msgType string, fn func(c *WSConn, p P) (interface{}, error)) Handler {
	return func(c *WSConn, raw json.RawMessage) {
		var p P
		json.Unmarshal(raw, &p)
		go func() {
			data, err := fn(c, p)
			c.ReplyResult(msgType, p.GetReqID(), data, err)
		}()
	}
}

// errRequired returns a standard "field is required" error.
func errRequired(field string) error {
	return fmt.Errorf("%s is required", field)
}

// ==================== Shared helpers ====================

func clampInterval(ms int) time.Duration {
	switch {
	case ms <= 1000:
		return 1000 * time.Millisecond
	case ms <= 3000:
		return 3000 * time.Millisecond
	case ms <= 5000:
		return 5000 * time.Millisecond
	default:
		return 10000 * time.Millisecond
	}
}

// PushData fetches the latest data for a subscription channel and sends it.
func (c *WSConn) PushData(ch string) {
	c.PushMu.Lock()
	if c.Pushing[ch] {
		c.PushMu.Unlock()
		return
	}
	c.Pushing[ch] = true
	c.PushMu.Unlock()
	defer func() {
		c.PushMu.Lock()
		delete(c.Pushing, ch)
		c.PushMu.Unlock()
	}()

	var resp wsServerMsg
	switch ch {
	case "overview":
		data, err := systemSvc.GetOverview()
		if err != nil {
			resp = wsServerMsg{Type: "error", Message: err.Error()}
		} else {
			resp = wsServerMsg{Type: "overview", Data: data}
		}
	case "processes":
		procs, err := systemSvc.GetProcessList()
		if err != nil {
			resp = wsServerMsg{Type: "error", Message: err.Error()}
		} else {
			resp = wsServerMsg{Type: "processes", Data: map[string]interface{}{
				"processes": procs,
				"total":     len(procs),
			}}
		}
	case "docker_containers":
		if !dockerSvc.IsAvailable() {
			resp = wsServerMsg{Type: "docker_containers", Data: map[string]interface{}{
				"available":  false,
				"containers": []interface{}{},
			}}
		} else {
			containers, err := dockerSvc.ListContainersWithStats()
			if err != nil {
				resp = wsServerMsg{Type: "error", Message: err.Error()}
			} else {
				resp = wsServerMsg{Type: "docker_containers", Data: map[string]interface{}{
					"available":  true,
					"containers": containers,
				}}
			}
		}
	case "docker_images":
		if !dockerSvc.IsAvailable() {
			resp = wsServerMsg{Type: "docker_images", Data: map[string]interface{}{
				"available": false,
				"images":    []interface{}{},
			}}
		} else {
			images, err := dockerSvc.ListImages()
			if err != nil {
				resp = wsServerMsg{Type: "error", Message: err.Error()}
			} else {
				resp = wsServerMsg{Type: "docker_images", Data: map[string]interface{}{
					"available": true,
					"images":    images,
				}}
			}
		}
	case "docker_compose":
		if !dockerSvc.IsAvailable() {
			resp = wsServerMsg{Type: "docker_compose", Data: map[string]interface{}{
				"available": false,
				"projects":  []interface{}{},
			}}
		} else {
			projects, err := dockerSvc.ListComposeProjects()
			if err != nil {
				resp = wsServerMsg{Type: "error", Message: err.Error()}
			} else {
				composeBaseDir := config.ComposeDir()
				scanned, _ := dockerSvc.ScanComposeDir(composeBaseDir)

				// Build appstore dirs map for MergeComposeProjects
				appstoreDirs := make(map[string]bool)
				rows, err := database.DB().Query("SELECT install_dir FROM installed_apps WHERE install_dir != ''")
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var dir string
						if rows.Scan(&dir) == nil {
							appstoreDirs[dir] = true
						}
					}
				}

				projects = service.MergeComposeProjects(projects, scanned, appstoreDirs)
				resp = wsServerMsg{Type: "docker_compose", Data: map[string]interface{}{
					"available": true,
					"projects":  projects,
				}}
			}
		}
	case "docker_networks":
		if !dockerSvc.IsAvailable() {
			resp = wsServerMsg{Type: "docker_networks", Data: map[string]interface{}{
				"available": false,
				"networks":  []interface{}{},
			}}
		} else {
			networks, err := dockerSvc.ListNetworks()
			if err != nil {
				resp = wsServerMsg{Type: "error", Message: err.Error()}
			} else {
				resp = wsServerMsg{Type: "docker_networks", Data: map[string]interface{}{
					"available": true,
					"networks":  networks,
				}}
			}
		}
	case "docker_volumes":
		if !dockerSvc.IsAvailable() {
			resp = wsServerMsg{Type: "docker_volumes", Data: map[string]interface{}{
				"available": false,
				"volumes":  []interface{}{},
			}}
		} else {
			volumes, err := dockerSvc.ListVolumes()
			if err != nil {
				resp = wsServerMsg{Type: "error", Message: err.Error()}
			} else {
				resp = wsServerMsg{Type: "docker_volumes", Data: map[string]interface{}{
					"available": true,
					"volumes":  volumes,
				}}
			}
		}
	case "disks":
		disks, err := diskSvc.GetDisks()
		if err != nil {
			resp = wsServerMsg{Type: "error", Message: err.Error()}
		} else {
			data := map[string]interface{}{
				"os":          runtime.GOOS,
				"disks":       disks,
				"mountPoints": diskSvc.GetMountPoints(),
			}
			if lvmInfo := diskSvc.GetLVMInfo(); lvmInfo != nil {
				data["lvm"] = lvmInfo
			}
			resp = wsServerMsg{Type: "disks", Data: data}
		}
	case "services":
		svcs, err := systemSvc.GetServiceList()
		if err != nil {
			resp = wsServerMsg{Type: "error", Message: err.Error()}
		} else {
			resp = wsServerMsg{Type: "services", Data: map[string]interface{}{
				"services": svcs,
				"total":    len(svcs),
			}}
		}
	case "tasks":
		list := service.GetTaskManager().GetAll()
		resp = wsServerMsg{Type: "tasks", Data: map[string]interface{}{
			"tasks": list,
			"total": len(list),
		}}
	default:
		resp = wsServerMsg{Type: "error", Message: "unknown channel: " + ch}
	}
	c.WriteJSON(resp)
}

// StartTicker starts a periodic push for the given channel.
func (c *WSConn) StartTicker(ch string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-c.Done:
				ticker.Stop()
				return
			case <-ticker.C:
				select {
				case c.TickCh <- ch:
				default:
				}
			}
		}
	}()
	c.Subs[ch] = &Subscription{Channel: ch, Interval: interval, Ticker: ticker}
}

// ==================== AI service singleton ====================

var aiService *ai.Service
var aiExecutor *ai.AIExecutor
var chatSvc *ai.ChatService

// InitAI initializes the AI service and executor.
// Must be called from main() after database.Init() and storage.ReloadDrivers().
func InitAI() {
	aiService = ai.NewService(fileSvc)
	aiExecutor = ai.NewAIExecutor(aiService)
	aiService.Executor = aiExecutor
	aiService.SetSystemContext(ai.NewSystemContext(aiExecutor.Status, aiExecutor.GetBroadcastSink()))
	aiExecutor.Start()
	chatSvc = ai.NewChatService(aiExecutor, aiService)
}

// ==================== Subscribe / Unsubscribe handlers ====================

func init() {
	RegisterHandlers(map[string]Handler{
		"subscribe":   handleSubscribe,
		"unsubscribe": handleUnsubscribe,
		"task_cancel":  handleTaskCancel,
		"task_retry":   handleTaskRetry,
		"task_list":    handleTaskList,
	})
}

func handleSubscribe(c *WSConn, raw json.RawMessage) {
	var p struct {
		Channel  string `json:"channel"`
		Interval int    `json:"interval"`
	}
	json.Unmarshal(raw, &p)

	ch := p.Channel
	interval := clampInterval(p.Interval)
	if old, ok := c.Subs[ch]; ok {
		old.Ticker.Stop()
		delete(c.Subs, ch)
	} else if ch == "docker_containers" {
		dockerSvc.StartStats()
	}
	c.StartTicker(ch, interval)
	go c.PushData(ch)
}

func handleUnsubscribe(c *WSConn, raw json.RawMessage) {
	var p struct {
		Channel string `json:"channel"`
	}
	json.Unmarshal(raw, &p)

	ch := p.Channel
	if ch == "" {
		for k, sub := range c.Subs {
			if k == "docker_containers" {
				dockerSvc.StopStats()
			}
			sub.Ticker.Stop()
			delete(c.Subs, k)
		}
	} else if sub, ok := c.Subs[ch]; ok {
		if ch == "docker_containers" {
			dockerSvc.StopStats()
		}
		sub.Ticker.Stop()
		delete(c.Subs, ch)
	}
}

// ==================== Task handlers ====================

func handleTaskCancel(c *WSConn, raw json.RawMessage) {
	var p struct {
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data != "" {
		service.GetTaskManager().Cancel(p.Data)
	}
}

func handleTaskRetry(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data != "" {
		newID := service.GetTaskManager().Retry(p.Data)
		c.Reply("task_retry", p.ReqID, map[string]string{"newTaskId": newID})
	}
}

func handleTaskList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	c.Reply("task_list", p.ReqID, service.GetTaskManager().GetAll())
}
