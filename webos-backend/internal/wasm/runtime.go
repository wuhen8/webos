// Package wasm provides a sandboxed WebAssembly runtime for wasm apps.
// Reactor 模式：main 初始化后返回，模块常驻内存，宿主通过导出函数推送事件。
package wasm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"webos-backend/internal/config"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

// ProcState represents the state of a wasm process.
type ProcState string

const (
	ProcRunning  ProcState = "running"
	ProcStopped  ProcState = "stopped"
	ProcFailed   ProcState = "failed"
	ProcStarting ProcState = "starting"
)

// ProcInfo holds status info for a managed wasm process.
type ProcInfo struct {
	AppID string    `json:"appId"`
	Name  string    `json:"name"`
	State ProcState `json:"state"`
	Error string    `json:"error,omitempty"`
}

// proc is an internal handle for a running wasm reactor process.
type proc struct {
	appID   string
	name    string
	state   ProcState
	lastErr string
	mod     api.Module   // 模块引用，常驻内存
	onEvent api.Function // 缓存 on_event 导出函数
	engine  wazero.Runtime
	mu      sync.Mutex // 保护 on_event 调用（wasm 单线程）
	stopCh  chan struct{}          // 关闭信号
	ctx     context.Context        // 进程级 context，stop 时取消
	cancel  context.CancelFunc
}

// Runtime manages all wasm processes.
type Runtime struct {
	mu     sync.RWMutex
	procs  map[string]*proc // appId → proc
	ctx    context.Context
	cancel context.CancelFunc

	// 生命周期回调，由 handler 包设置
	OnProcStart func(appID string) // 进程启动后调用（注册 sink 等）
	OnProcStop  func(appID string) // 进程停止前调用（注销 sink 等）
}

var (
	globalRuntime *Runtime
	rtOnce        sync.Once
)

func GetRuntime() *Runtime {
	rtOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		globalRuntime = &Runtime{
			procs:  make(map[string]*proc),
			ctx:    ctx,
			cancel: cancel,
		}
	})
	return globalRuntime
}

func WebAppsDir() string {
	return filepath.Join(config.DataDir(), "webapps")
}

func loadManifest(appID string) (*AppManifest, error) {
	data, err := os.ReadFile(filepath.Join(WebAppsDir(), appID, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var m AppManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// StartProc starts a wasm app in Reactor mode.
// 流程：创建 runtime → 注册宿主模块 → InstantiateModule(空启动) → _initialize → 缓存 on_event
func (r *Runtime) StartProc(appID string) error {
	r.mu.Lock()
	if p, ok := r.procs[appID]; ok && p.state == ProcRunning {
		r.mu.Unlock()
		return fmt.Errorf("app %s is already running", appID)
	}

	manifest, err := loadManifest(appID)
	if err != nil {
		r.mu.Unlock()
		return fmt.Errorf("load manifest: %w", err)
	}
	if manifest.WasmModule == "" {
		r.mu.Unlock()
		return fmt.Errorf("app %s has no wasmModule", appID)
	}

	wasmBytes, err := os.ReadFile(filepath.Join(WebAppsDir(), appID, manifest.WasmModule))
	if err != nil {
		r.mu.Unlock()
		return fmt.Errorf("load wasm: %w", err)
	}

	p := &proc{
		appID:  appID,
		name:   manifest.Name,
		state:  ProcStarting,
		stopCh: make(chan struct{}),
	}
	p.ctx, p.cancel = context.WithCancel(r.ctx)
	r.procs[appID] = p
	r.mu.Unlock()

	log.Printf("[WASM] starting reactor: %s", appID)

	// 每个 wasm 进程独立的 wazero runtime，完全隔离
	engine := wazero.NewRuntime(r.ctx)
	wasi_snapshot_preview1.MustInstantiate(r.ctx, engine)

	if err := registerHostModule(r.ctx, engine, appID, manifest.Permissions); err != nil {
		engine.Close(context.Background())
		r.setProcState(p, ProcFailed, err.Error())
		return fmt.Errorf("register host module: %w", err)
	}

	compiled, err := engine.CompileModule(r.ctx, wasmBytes)
	if err != nil {
		engine.Close(context.Background())
		r.setProcState(p, ProcFailed, "compile: "+err.Error())
		return fmt.Errorf("compile: %w", err)
	}

	// Reactor 模式：WithStartFunctions() 空启动，不自动运行 _start
	mod, err := engine.InstantiateModule(r.ctx, compiled,
		wazero.NewModuleConfig().
			WithName(appID).
			WithStartFunctions(). // 空 — 不自动运行 _start
			WithStdout(newAppLogger(appID, "stdout")).
			WithStderr(newAppLogger(appID, "stderr")).
			WithArgs(appID),
	)
	if err != nil {
		engine.Close(context.Background())
		r.setProcState(p, ProcFailed, "instantiate: "+err.Error())
		return fmt.Errorf("instantiate: %w", err)
	}

	// 手动调 _initialize（Go reactor 模式的初始化入口）
	if initFn := mod.ExportedFunction("_initialize"); initFn != nil {
		if _, err := initFn.Call(r.ctx); err != nil {
			mod.Close(context.Background())
			engine.Close(context.Background())
			r.setProcState(p, ProcFailed, "_initialize: "+err.Error())
			return fmt.Errorf("_initialize: %w", err)
		}
	}

	// _initialize 完成后缓存 shared buffer 地址
	InitSharedBuf(mod)

	// 缓存导出函数
	onEvent := mod.ExportedFunction("on_event")

	p.mod = mod
	p.onEvent = onEvent
	p.engine = engine
	r.setProcState(p, ProcRunning, "")

	// 通知 handler 层注册事件 sink
	if r.OnProcStart != nil {
		r.OnProcStart(appID)
	}

	// 如果 manifest 声明了 pollInterval，启动定时器推 tick 事件
	if manifest.PollInterval > 0 && p.onEvent != nil {
		go r.tickLoop(p, time.Duration(manifest.PollInterval)*time.Millisecond)
	}

	log.Printf("[WASM] reactor ready: %s (on_event=%v)", appID, onEvent != nil)
	return nil
}

// tickLoop 定时推 tick 事件给 wasm 进程（用于 Telegram 轮询等场景）
func (r *Runtime) tickLoop(p *proc, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	tickEvent := []byte(`{"type":"tick"}`)
	for {
		select {
		case <-ticker.C:
			r.PushEvent(p.appID, tickEvent)
		case <-p.stopCh:
			return
		}
	}
}

// PushEvent 向 wasm 进程推送事件，调用导出的 on_event(ptr, size)。
// 线程安全 — 内部加锁保证 wasm 单线程执行。
func (r *Runtime) PushEvent(appID string, data []byte) {
	r.mu.RLock()
	p, ok := r.procs[appID]
	r.mu.RUnlock()
	if !ok || p.onEvent == nil || p.state != ProcRunning {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.mod == nil || p.state != ProcRunning {
		return
	}

	needed := uint32(len(data))

	// 用缓存的 shared buffer 地址
	var ptr uint32
	if v, ok := sharedBufCache.Load(appID); ok {
		info := v.(sharedBufInfo)
		if needed <= info.cap {
			ptr = info.ptr
		}
	}

	if ptr == 0 {
		// fallback: 用内存 1/4 处
		mem := p.mod.Memory()
		size := mem.Size()
		ptr = size/4 + 4096
		if ptr+needed > size {
			if _, ok := mem.Grow(1); !ok {
				log.Printf("[WASM:%s] PushEvent: memory grow failed", appID)
				return
			}
		}
	}

	if !p.mod.Memory().Write(ptr, data) {
		log.Printf("[WASM:%s] PushEvent: memory write failed", appID)
		return
	}

	if _, err := p.onEvent.Call(p.ctx, uint64(ptr), uint64(needed)); err != nil {
		log.Printf("[WASM:%s] PushEvent error: %v", appID, err)
	}
}

func (r *Runtime) setProcState(p *proc, state ProcState, errMsg string) {
	r.mu.Lock()
	p.state = state
	p.lastErr = errMsg
	r.mu.Unlock()
	if errMsg != "" {
		log.Printf("[WASM:%s] state=%s error=%s", p.appID, state, errMsg)
	} else {
		log.Printf("[WASM:%s] state=%s", p.appID, state)
	}
}

// StopProc stops a running wasm reactor process.
func (r *Runtime) StopProc(appID string) {
	r.mu.Lock()
	p, ok := r.procs[appID]
	if !ok || p.state != ProcRunning {
		r.mu.Unlock()
		return
	}
	// 先标记为 stopped，让 PushEvent 提前退出
	p.state = ProcStopped
	r.mu.Unlock()

	// 通知 handler 层注销事件 sink
	if r.OnProcStop != nil {
		r.OnProcStop(appID)
	}

	// 关闭该 app 的所有 WebSocket 连接
	CloseAllWSConns(appID)

	// 取消进程级 context（中断正在进行的 HTTP 请求等）
	if p.cancel != nil {
		p.cancel()
	}

	// 停止定时器
	close(p.stopCh)

	// 关闭模块和引擎
	p.mu.Lock()
	if p.mod != nil {
		p.mod.Close(context.Background())
		p.mod = nil
	}
	if p.engine != nil {
		p.engine.Close(context.Background())
		p.engine = nil
	}
	p.onEvent = nil
	p.mu.Unlock()

	r.setProcState(p, ProcStopped, "")
	log.Printf("[WASM] stopped: %s", appID)
}

// RestartProc stops then starts a process.
func (r *Runtime) RestartProc(appID string) error {
	r.StopProc(appID)
	return r.StartProc(appID)
}

// ListProcs returns status of all managed wasm processes.
func (r *Runtime) ListProcs() []ProcInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]ProcInfo, 0, len(r.procs))
	for _, p := range r.procs {
		list = append(list, ProcInfo{
			AppID: p.appID,
			Name:  p.name,
			State: p.state,
			Error: p.lastErr,
		})
	}
	return list
}

// StartBackgroundApps scans for wasm apps with background:true and starts them.
func (r *Runtime) StartBackgroundApps() {
	entries, err := os.ReadDir(WebAppsDir())
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifest, err := loadManifest(entry.Name())
		if err != nil || manifest.WasmModule == "" || !manifest.Background {
			continue
		}
		if err := r.StartProc(entry.Name()); err != nil {
			log.Printf("[WASM] failed to start %s: %v", entry.Name(), err)
		}
	}
}

// Close shuts down all processes.
func (r *Runtime) Close() {
	r.mu.RLock()
	ids := make([]string, 0, len(r.procs))
	for id := range r.procs {
		ids = append(ids, id)
	}
	r.mu.RUnlock()

	for _, id := range ids {
		r.StopProc(id)
	}
	r.cancel()
}

type appLogger struct {
	appID  string
	stream string
}

func newAppLogger(appID, stream string) *appLogger {
	return &appLogger{appID: appID, stream: stream}
}

func (l *appLogger) Write(p []byte) (int, error) {
	fmt.Printf("[WASM:%s:%s] %s", l.appID, l.stream, string(p))
	return len(p), nil
}
