package wasm

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"webos-backend/internal/storage"
)

// CapabilityRouter routes host capability calls from WASM apps
type CapabilityRouter struct {
	handlers map[string]CapabilityHandler
}

type CapabilityHandler func(appID string, params json.RawMessage) (interface{}, error)

var globalRouter *CapabilityRouter

func init() {
	globalRouter = NewCapabilityRouter()
}

func GetRouter() *CapabilityRouter {
	return globalRouter
}

func NewCapabilityRouter() *CapabilityRouter {
	r := &CapabilityRouter{handlers: make(map[string]CapabilityHandler)}

	// File system
	r.Register("fs.read", fsRead)
	r.Register("fs.write", fsWrite)
	r.Register("fs.list", fsList)
	r.Register("fs.delete", fsDelete)
	r.Register("fs.mkdir", fsMkdir)

	// Process
	r.Register("process.exec", processExec)

	// System
	r.Register("system.info", systemInfo)
	r.Register("system.env", systemEnv)
	r.Register("system.log", systemLog)

	return r
}

func (r *CapabilityRouter) Register(method string, handler CapabilityHandler) {
	r.handlers[method] = handler
}

func (r *CapabilityRouter) Execute(appID, method string, params json.RawMessage) (interface{}, error) {
	handler, ok := r.handlers[method]
	if !ok {
		return nil, fmt.Errorf("unknown capability: %s", method)
	}

	// Simple permission check (currently allows all, can be extended later)
	if !r.CheckPermission(appID, method) {
		return nil, fmt.Errorf("permission denied: %s", method)
	}

	return handler(appID, params)
}

// CheckPermission - simple permission check, currently allows all
// Can be extended to read from database or config
func (r *CapabilityRouter) CheckPermission(appID, method string) bool {
	// TODO: implement fine-grained permission control if needed
	return true
}

// ==================== File System Capabilities ====================

func fsRead(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		return nil, err
	}

	data, err := driver.Read(p.Path)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"content": string(data),
		"size":    len(data),
	}, nil
}

func fsWrite(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID  string `json:"nodeId"`
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		return nil, err
	}

	if err := driver.Write(p.Path, []byte(p.Content)); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"size":    len(p.Content),
	}, nil
}

func fsList(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		return nil, err
	}

	entries, err := driver.List(p.Path)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"entries": entries,
	}, nil
}

func fsDelete(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		return nil, err
	}

	if err := driver.Delete(p.Path); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
	}, nil
}

func fsMkdir(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		return nil, err
	}

	if err := driver.CreateDir(p.Path); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
	}, nil
}

// ==================== Process Capabilities ====================

func processExec(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Command string `json:"command"`
		Timeout int    `json:"timeout"` // seconds, default 30
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if p.Timeout == 0 {
		p.Timeout = 30
	}

	// Parse command
	parts := strings.Fields(p.Command)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	cmd := exec.Command(parts[0], parts[1:]...)

	// Set timeout
	done := make(chan error, 1)
	go func() {
		done <- cmd.Run()
	}()

	select {
	case err := <-done:
		stdout, _ := cmd.Output()
		stderr := ""
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				stderr = string(exitErr.Stderr)
				exitCode = exitErr.ExitCode()
			} else {
				return nil, err
			}
		}
		return map[string]interface{}{
			"stdout":   string(stdout),
			"stderr":   stderr,
			"exitCode": exitCode,
			"success":  exitCode == 0,
		}, nil
	case <-time.After(time.Duration(p.Timeout) * time.Second):
		cmd.Process.Kill()
		return nil, fmt.Errorf("command timeout after %d seconds", p.Timeout)
	}
}

// ==================== System Capabilities ====================

func systemInfo(appID string, params json.RawMessage) (interface{}, error) {
	hostname, _ := os.Hostname()
	wd, _ := os.Getwd()

	return map[string]interface{}{
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
		"hostname":  hostname,
		"cwd":       wd,
		"goVersion": runtime.Version(),
	}, nil
}

func systemEnv(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Key string `json:"key"` // if empty, return all
	}
	json.Unmarshal(params, &p)

	if p.Key != "" {
		return map[string]interface{}{
			"key":   p.Key,
			"value": os.Getenv(p.Key),
		}, nil
	}

	// Return all env vars
	envMap := make(map[string]string)
	for _, e := range os.Environ() {
		pair := strings.SplitN(e, "=", 2)
		if len(pair) == 2 {
			envMap[pair[0]] = pair[1]
		}
	}

	return map[string]interface{}{
		"env": envMap,
	}, nil
}

func systemLog(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	fmt.Printf("[WASM:%s] %s\n", appID, p.Message)
	return map[string]bool{"success": true}, nil
}

