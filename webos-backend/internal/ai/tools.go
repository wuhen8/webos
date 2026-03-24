package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"webos-backend/internal/config"
	"webos-backend/internal/service"
	"webos-backend/internal/storage"
)

// Context keys for passing sink and toolCallID to tool executors.
type sinkContextKey struct{}
type toolCallIDContextKey struct{}

// activateSkillToolDef is the tool definition for on-demand skill activation.
var activateSkillToolDef = ToolDef{
	Type: "function",
	Function: ToolFuncDef{
		Name:        "activate_skill",
		Description: "激活一个扩展技能（skill）。激活后会返回该技能的详细指令作为上下文。注意：优先使用内置工具（shell、read_file 等），只有内置工具无法完成任务时才激活技能。",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"skill_name": map[string]interface{}{
					"type":        "string",
					"description": "要激活的技能名称（从 search_skills 结果或系统提示中的技能列表获取）",
				},
			},
			"required": []string{"skill_name"},
		},
	},
}

// searchSkillsToolDef is the tool definition for searching available skills.
var searchSkillsToolDef = ToolDef{
	Type: "function",
	Function: ToolFuncDef{
		Name:        "search_skills",
		Description: "搜索可用的扩展技能（skill）。技能是外部扩展能力，不同于内置工具。仅在内置工具（shell、read_file、write_file 等）无法完成用户需求时使用。不要对每个请求都搜索技能。根据关键词匹配技能名称和描述，返回匹配的技能列表。找到合适的技能后，用 activate_skill 激活。",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"keyword": map[string]interface{}{
					"type":        "string",
					"description": "搜索关键词，匹配技能名称和描述",
				},
			},
			"required": []string{"keyword"},
		},
	},
}

// ExecMode determines where shell commands are executed.
type ExecMode string

const (
	ModeHost    ExecMode = "host"
	ModeSandbox ExecMode = "sandbox"
)

// ToolRegistry holds all registered tools and their executors.
type ToolRegistry struct {
	defs      []ToolDef
	executors map[string]func(ctx context.Context, convID string, args json.RawMessage) (string, error)
	fileSvc   *service.FileService
	sandbox   *Sandbox
	sysCtx    SystemContext

	// File backup store: convID -> []fileBackup (ordered, most recent last)
	backupMu sync.Mutex
	backups  map[string][]fileBackup
}

// fileBackup stores the original content of a file before modification.
type fileBackup struct {
	NodeID  string
	Path    string
	Content []byte // nil means the file did not exist (was newly created)
	Tool    string // "write_file" or "edit_file"
}

// NewToolRegistry creates a registry with all built-in tools.
func NewToolRegistry(fileSvc *service.FileService, sandbox *Sandbox, sysCtx SystemContext) *ToolRegistry {
	r := &ToolRegistry{
		executors: make(map[string]func(ctx context.Context, convID string, args json.RawMessage) (string, error)),
		fileSvc:   fileSvc,
		sandbox:   sandbox,
		sysCtx:    sysCtx,
		backups:   make(map[string][]fileBackup),
	}
	r.registerAll()
	return r
}

// resolveNodeID returns the given nodeID if non-empty, otherwise falls back
// to the only registered storage node. Returns an error message if it cannot
// be resolved.
func resolveNodeID(nodeID string) (string, string) {
	if nodeID != "" {
		return nodeID, ""
	}
	if def := storage.DefaultNodeID(); def != "" {
		return def, ""
	}
	return "", "错误: 无法确定默认存储节点，请指定 node_id"
}

// resolveFilePath ensures relative paths are based on DataDir instead of storage root.
// Absolute paths (starting with /) are returned as-is.
func resolveFilePath(p string) string {
	if p == "" || filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(config.DataDir(), p)
}

const maxBackupsPerConv = 50

// saveBackup saves the current file content before modification.
func (r *ToolRegistry) saveBackup(convID, nodeID, path, tool string) {
	content, err := r.fileSvc.Read(nodeID, path)
	backup := fileBackup{NodeID: nodeID, Path: path, Tool: tool}
	if err == nil {
		backup.Content = content
	}
	// err != nil means file doesn't exist yet — Content stays nil

	r.backupMu.Lock()
	list := append(r.backups[convID], backup)
	if len(list) > maxBackupsPerConv {
		list = list[len(list)-maxBackupsPerConv:]
	}
	r.backups[convID] = list
	r.backupMu.Unlock()
}

// ClearBackups removes all backups for a conversation.
func (r *ToolRegistry) ClearBackups(convID string) {
	r.backupMu.Lock()
	delete(r.backups, convID)
	r.backupMu.Unlock()
}

// Defs returns the tool definitions for the API request.
func (r *ToolRegistry) Defs() []ToolDef {
	return r.defs
}

// Execute runs a tool by name with the given arguments JSON.
func (r *ToolRegistry) Execute(ctx context.Context, convID, name string, args json.RawMessage) (string, error) {
	fn, ok := r.executors[name]
	if !ok {
		return "", nil
	}
	if !json.Valid(args) {
		return fmt.Sprintf("工具参数 JSON 不完整，无法执行 %s", name), nil
	}
	return fn(ctx, convID, args)
}

func (r *ToolRegistry) register(name, description string, params interface{}, fn func(ctx context.Context, convID string, args json.RawMessage) (string, error)) {
	r.defs = append(r.defs, ToolDef{
		Type: "function",
		Function: ToolFuncDef{
			Name:        name,
			Description: description,
			Parameters:  params,
		},
	})
	r.executors[name] = fn
}

func (r *ToolRegistry) registerAll() {
	r.registerShell()
	r.registerReadFile()
	r.registerWriteFile()
	r.registerEditFile()
	r.registerUndoFile()
	r.registerListFiles()
	r.registerDownloadToSandbox()
	r.registerUploadFromSandbox()
	r.registerOpenUI()
	r.registerSendFile()
	r.registerBackgroundTask()
	r.registerQueryTasks()
	r.registerScheduledJobs()
	r.registerSystemManage()
	r.registerStringSearch()
}

func (r *ToolRegistry) registerShell() {
	r.register("shell", `执行 shell 命令。必须通过 mode 参数指定执行环境：
- host：直接在服务器上执行，可以管理 Docker、systemctl、操作文件系统等
- sandbox：在隔离的 Docker 容器中执行，适合运行不信任的代码、安装临时依赖等`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "要执行的 shell 命令",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "超时秒数，默认120",
			},
			"mode": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"host", "sandbox"},
				"description": "执行环境：host（宿主机）或 sandbox（沙箱容器）",
			},
			"shell": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"sh", "bash"},
				"description": "sandbox 模式下使用的 shell，默认 sh。需要 bash 特性（如 {1..10}）时选 bash",
			},
		},
		"required": []string{"command", "mode"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Command string `json:"command"`
			Timeout int    `json:"timeout"`
			Mode    string `json:"mode"`
			Shell   string `json:"shell"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.Timeout <= 0 {
			p.Timeout = 120
		}

		var mode ExecMode
		if p.Mode == "sandbox" {
			mode = ModeSandbox
		} else {
			mode = ModeHost
		}

		// Build onOutput callback from context-injected sink
		var onOutput func(stream, data string)
		if sink, ok := ctx.Value(sinkContextKey{}).(ChatSink); ok {
			if tcID, ok := ctx.Value(toolCallIDContextKey{}).(string); ok {
				onOutput = func(stream, data string) {
					sink.OnShellOutput(convID, tcID, ShellOutput{Stream: stream, Data: data})
				}
			}
		}

		var result *ExecResult
		var err error

		if mode == ModeSandbox {
			result, err = r.sandbox.Shell(ctx, p.Command, p.Timeout, onOutput, p.Shell)
		} else {
			result, err = hostShell(ctx, p.Command, p.Timeout, onOutput)
		}

		if err != nil {
			return "执行失败: " + err.Error(), nil
		}
		out, _ := json.Marshal(result)
		return string(out), nil
	})
}

// hostShell executes a command directly on the host machine.
func hostShell(parent context.Context, command string, timeout int, onOutput func(stream, data string)) (*ExecResult, error) {
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeout)*time.Second)
	defer cancel()

	shell := service.UserShell()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// On Windows, cmd.exe uses /c, PowerShell uses -Command
		if strings.Contains(strings.ToLower(shell), "powershell") || strings.Contains(strings.ToLower(shell), "pwsh") {
			cmd = exec.CommandContext(ctx, shell, "-Command", command)
		} else {
			cmd = exec.CommandContext(ctx, shell, "/c", command)
		}
	} else {
		cmd = exec.CommandContext(ctx, shell, "-c", command)
	}
	setProcAttr(cmd)

	var stdout, stderr bytes.Buffer

	if onOutput != nil {
		// Stream output line-by-line via pipes while also collecting full output
		stdoutPR, stdoutPW := io.Pipe()
		stderrPR, stderrPW := io.Pipe()
		defer stdoutPW.Close()
		defer stderrPW.Close()
		cmd.Stdout = io.MultiWriter(&stdout, stdoutPW)
		cmd.Stderr = io.MultiWriter(&stderr, stderrPW)

		var scanWg sync.WaitGroup
		scanWg.Add(2)
		go func() {
			defer scanWg.Done()
			scanner := bufio.NewScanner(stdoutPR)
			scanner.Buffer(make([]byte, 64*1024), 256*1024)
			for scanner.Scan() {
				line := scanner.Bytes()
				if runtime.GOOS == "windows" {
					onOutput("stdout", service.DecodeWindowsOutput(append([]byte(nil), line...))+"\n")
				} else {
					onOutput("stdout", scanner.Text()+"\n")
				}
			}
		}()
		go func() {
			defer scanWg.Done()
			scanner := bufio.NewScanner(stderrPR)
			scanner.Buffer(make([]byte, 64*1024), 256*1024)
			for scanner.Scan() {
				line := scanner.Bytes()
				if runtime.GOOS == "windows" {
					onOutput("stderr", service.DecodeWindowsOutput(append([]byte(nil), line...))+"\n")
				} else {
					onOutput("stderr", scanner.Text()+"\n")
				}
			}
		}()

		// Context cancellation watcher: close pipes and kill process when context is cancelled.
		cancelDone := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				stdoutPW.Close()
				stderrPW.Close()
				if cmd.Process != nil {
					killProcess(cmd)
				}
			case <-cancelDone:
			}
		}()
		defer close(cancelDone)

		if err := cmd.Start(); err != nil {
			return nil, err
		}

		cmdDone := make(chan error, 1)
		go func() {
			cmdDone <- cmd.Wait()
		}()

		select {
		case err := <-cmdDone:
			stdoutPW.Close()
			stderrPW.Close()
			scanWg.Wait()

			exitCode := 0
			if err != nil {
				if exitErr, ok := err.(*exec.ExitError); ok {
					exitCode = exitErr.ExitCode()
				} else if ctx.Err() != nil {
					if parent.Err() != nil {
						return &ExecResult{Stderr: "已取消", ExitCode: -1}, nil
					}
					return &ExecResult{Stderr: "执行超时", ExitCode: -1}, nil
				} else {
					return nil, err
				}
			}

			var outStr, errStr string
			if runtime.GOOS == "windows" {
				outStr = service.DecodeWindowsOutput(stdout.Bytes())
				errStr = service.DecodeWindowsOutput(stderr.Bytes())
			} else {
				outStr = stdout.String()
				errStr = stderr.String()
			}
			const maxLen = 50000
			if len(outStr) > maxLen {
				outStr = outStr[:maxLen] + "\n... (输出已截断)"
			}
			if len(errStr) > maxLen {
				errStr = errStr[:maxLen] + "\n... (输出已截断)"
			}
			return &ExecResult{Stdout: outStr, Stderr: errStr, ExitCode: exitCode}, nil

		case <-ctx.Done():
			select {
			case <-cmdDone:
			case <-time.After(1 * time.Second):
			}
			scanWg.Wait()

			if parent.Err() != nil {
				return &ExecResult{Stderr: "已取消", ExitCode: -1}, nil
			}
			return &ExecResult{Stderr: "执行超时", ExitCode: -1}, nil
		}
	}

	// No streaming callback — original behavior
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if ctx.Err() != nil {
			if parent.Err() != nil {
				return &ExecResult{Stderr: "已取消", ExitCode: -1}, nil
			}
			return &ExecResult{Stderr: "执行超时", ExitCode: -1}, nil
		} else {
			return nil, err
		}
	}

	var outStr, errStr string
	if runtime.GOOS == "windows" {
		outStr = service.DecodeWindowsOutput(stdout.Bytes())
		errStr = service.DecodeWindowsOutput(stderr.Bytes())
	} else {
		outStr = stdout.String()
		errStr = stderr.String()
	}

	const maxLen = 50000
	if len(outStr) > maxLen {
		outStr = outStr[:maxLen] + "\n... (输出已截断)"
	}
	if len(errStr) > maxLen {
		errStr = errStr[:maxLen] + "\n... (输出已截断)"
	}

	return &ExecResult{
		Stdout:   outStr,
		Stderr:   errStr,
		ExitCode: exitCode,
	}, nil
}

func (r *ToolRegistry) registerDownloadToSandbox() {
	r.register("download_to_sandbox", `将存储节点中的文件或文件夹下载到沙箱容器内，以便在沙箱模式下的代码中直接访问。仅在沙箱模式下有意义。
支持三种用法：
1. 单文件: src_path="file.txt", container_path="/workspace/file.txt"
2. 多文件: src_paths=["a.txt","b.txt"], container_path="/workspace/"（目标为目录）
3. 文件夹: src_path="mydir", container_path="/workspace/mydir"（自动递归下载整个目录）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID",
			},
			"src_path": map[string]interface{}{
				"type":        "string",
				"description": "存储节点中的源文件或文件夹路径（单个）",
			},
			"src_paths": map[string]interface{}{
				"type":        "array",
				"items":       map[string]interface{}{"type": "string"},
				"description": "存储节点中的多个源文件路径（批量下载时使用，与 src_path 二选一）",
			},
			"container_path": map[string]interface{}{
				"type":        "string",
				"description": "容器内的目标路径。下载多文件时应为目录路径（以/结尾）",
			},
		},
		"required": []string{"node_id", "container_path"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			NodeID        string   `json:"node_id"`
			SrcPath       string   `json:"src_path"`
			SrcPaths      []string `json:"src_paths"`
			ContainerPath string   `json:"container_path"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.NodeID == "" {
			return "错误: 必须指定 node_id", nil
		}

		driver, err := storage.GetDriver(p.NodeID)
		if err != nil {
			return fmt.Sprintf("存储节点 %s 不存在: %v", p.NodeID, err), nil
		}

		ctx := context.Background()

		// Collect all source paths
		var paths []string
		if len(p.SrcPaths) > 0 {
			for _, sp := range p.SrcPaths {
				paths = append(paths, resolveFilePath(sp))
			}
		} else if p.SrcPath != "" {
			paths = []string{resolveFilePath(p.SrcPath)}
		} else {
			return "错误: 必须指定 src_path 或 src_paths", nil
		}

		var results []string
		var errCount int

		for _, srcPath := range paths {
			// Check if it's a directory
			info, statErr := driver.Stat(srcPath)
			if statErr != nil {
				results = append(results, fmt.Sprintf("✗ %s: %v", srcPath, statErr))
				errCount++
				continue
			}

			if info.IsDir {
				// Recursively download directory
				count, dlErr := r.downloadDirToSandbox(ctx, driver, srcPath, p.ContainerPath, filepath.Base(srcPath))
				if dlErr != nil {
					results = append(results, fmt.Sprintf("✗ %s/: %v", srcPath, dlErr))
					errCount++
				} else {
					results = append(results, fmt.Sprintf("✓ %s/ → %s (%d 个文件)", srcPath, p.ContainerPath, count))
				}
			} else {
				// Single file
				content, readErr := driver.Read(srcPath)
				if readErr != nil {
					results = append(results, fmt.Sprintf("✗ %s: %v", srcPath, readErr))
					errCount++
					continue
				}
				dstPath := p.ContainerPath
				// If multiple files or container_path looks like a directory, put file inside it
				if len(paths) > 1 || strings.HasSuffix(dstPath, "/") {
					dstPath = filepath.Join(dstPath, filepath.Base(srcPath))
				}
				if copyErr := r.sandbox.CopyFileIn(ctx, content, dstPath); copyErr != nil {
					results = append(results, fmt.Sprintf("✗ %s: %v", srcPath, copyErr))
					errCount++
				} else {
					results = append(results, fmt.Sprintf("✓ %s → %s", srcPath, dstPath))
				}
			}
		}

		summary := strings.Join(results, "\n")
		if errCount > 0 {
			return fmt.Sprintf("下载完成（%d 失败）:\n%s", errCount, summary), nil
		}
		return fmt.Sprintf("下载完成:\n%s", summary), nil
	})
}

// downloadDirToSandbox recursively downloads a directory from storage to the sandbox container.
func (r *ToolRegistry) downloadDirToSandbox(ctx context.Context, driver storage.Driver, srcDir, containerBase, relDir string) (int, error) {
	files, err := driver.List(srcDir)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, f := range files {
		srcPath := filepath.Join(srcDir, f.Name)
		containerPath := filepath.Join(containerBase, relDir, f.Name)

		if f.IsDir {
			n, err := r.downloadDirToSandbox(ctx, driver, srcPath, containerBase, filepath.Join(relDir, f.Name))
			if err != nil {
				return count, err
			}
			count += n
		} else {
			content, err := driver.Read(srcPath)
			if err != nil {
				return count, fmt.Errorf("%s: %w", srcPath, err)
			}
			if err := r.sandbox.CopyFileIn(ctx, content, containerPath); err != nil {
				return count, fmt.Errorf("复制 %s 失败: %w", containerPath, err)
			}
			count++
		}
	}
	return count, nil
}

func (r *ToolRegistry) registerUploadFromSandbox() {
	r.register("upload_from_sandbox", `将沙箱容器内的文件或文件夹上传回存储节点。仅在沙箱模式下有意义。
支持三种用法：
1. 单文件: container_path="/workspace/result.txt", dst_path="output/"
2. 多文件: container_paths=["/workspace/a.txt","/workspace/b.txt"], dst_path="output/"
3. 文件夹: container_path="/workspace/results", dst_path="output/"（自动递归上传整个目录）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"container_path": map[string]interface{}{
				"type":        "string",
				"description": "容器内的源文件或文件夹路径（单个）",
			},
			"container_paths": map[string]interface{}{
				"type":        "array",
				"items":       map[string]interface{}{"type": "string"},
				"description": "容器内的多个源文件路径（批量上传时使用，与 container_path 二选一）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "目标存储节点ID",
			},
			"dst_path": map[string]interface{}{
				"type":        "string",
				"description": "存储节点中的目标目录路径",
			},
		},
		"required": []string{"node_id", "dst_path"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			ContainerPath  string   `json:"container_path"`
			ContainerPaths []string `json:"container_paths"`
			NodeID         string   `json:"node_id"`
			DstPath        string   `json:"dst_path"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.NodeID == "" {
			return "错误: 必须指定 node_id", nil
		}

		driver, err := storage.GetDriver(p.NodeID)
		if err != nil {
			return fmt.Sprintf("存储节点 %s 不存在: %v", p.NodeID, err), nil
		}
		p.DstPath = resolveFilePath(p.DstPath)

		ctx := context.Background()

		// Collect all container paths
		var paths []string
		if len(p.ContainerPaths) > 0 {
			paths = p.ContainerPaths
		} else if p.ContainerPath != "" {
			paths = []string{p.ContainerPath}
		} else {
			return "错误: 必须指定 container_path 或 container_paths", nil
		}

		var results []string
		var errCount int

		for _, cPath := range paths {
			// Check if it's a directory by running stat in the container
			isDir, statErr := r.sandbox.IsDir(ctx, cPath)
			if statErr != nil {
				results = append(results, fmt.Sprintf("✗ %s: %v", cPath, statErr))
				errCount++
				continue
			}

			if isDir {
				count, ulErr := r.uploadDirFromSandbox(ctx, driver, cPath, p.DstPath, filepath.Base(cPath))
				if ulErr != nil {
					results = append(results, fmt.Sprintf("✗ %s/: %v", cPath, ulErr))
					errCount++
				} else {
					results = append(results, fmt.Sprintf("✓ %s/ → %s:%s (%d 个文件)", cPath, p.NodeID, p.DstPath, count))
				}
			} else {
				content, copyErr := r.sandbox.CopyFileOut(ctx, cPath)
				if copyErr != nil {
					results = append(results, fmt.Sprintf("✗ %s: %v", cPath, copyErr))
					errCount++
					continue
				}
				fullPath := filepath.Join(p.DstPath, filepath.Base(cPath))
				if writeErr := driver.Write(fullPath, content); writeErr != nil {
					results = append(results, fmt.Sprintf("✗ %s: %v", cPath, writeErr))
					errCount++
				} else {
					results = append(results, fmt.Sprintf("✓ %s → %s:%s", cPath, p.NodeID, fullPath))
				}
			}
		}

		summary := strings.Join(results, "\n")
		if errCount > 0 {
			return fmt.Sprintf("上传完成（%d 失败）:\n%s", errCount, summary), nil
		}
		return fmt.Sprintf("上传完成:\n%s", summary), nil
	})
}

// uploadDirFromSandbox recursively uploads a directory from the sandbox container to storage.
func (r *ToolRegistry) uploadDirFromSandbox(ctx context.Context, driver storage.Driver, containerDir, dstBase, relDir string) (int, error) {
	// List files in the container directory
	output, err := r.sandbox.ListDir(ctx, containerDir)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, name := range output {
		if name == "" {
			continue
		}
		containerPath := containerDir + "/" + name
		dstPath := filepath.Join(dstBase, relDir, name)

		isDir, err := r.sandbox.IsDir(ctx, containerPath)
		if err != nil {
			return count, fmt.Errorf("%s: %w", containerPath, err)
		}

		if isDir {
			n, err := r.uploadDirFromSandbox(ctx, driver, containerPath, dstBase, filepath.Join(relDir, name))
			if err != nil {
				return count, err
			}
			count += n
		} else {
			content, err := r.sandbox.CopyFileOut(ctx, containerPath)
			if err != nil {
				return count, fmt.Errorf("读取 %s 失败: %w", containerPath, err)
			}
			if err := driver.Write(dstPath, content); err != nil {
				return count, fmt.Errorf("写入 %s 失败: %w", dstPath, err)
			}
			count++
		}
	}
	return count, nil
}

func (r *ToolRegistry) registerReadFile() {
	r.register("read_file", `读取用户文件系统中的文件内容。需要指定存储节点 node_id。
支持通过 start_line 和 end_line 参数读取指定行范围，避免读取整个大文件浪费 token。
返回内容会带行号前缀，方便定位。`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件路径（绝对路径或相对路径，相对路径基于数据目录）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID，参见系统提示中的节点列表",
			},
			"start_line": map[string]interface{}{
				"type":        "integer",
				"description": "起始行号（从 1 开始），不指定则从第一行开始",
			},
			"end_line": map[string]interface{}{
				"type":        "integer",
				"description": "结束行号（包含），不指定则读到最后一行",
			},
		},
		"required": []string{"path"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path      string `json:"path"`
			NodeID    string `json:"node_id"`
			StartLine int    `json:"start_line"`
			EndLine   int    `json:"end_line"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		p.Path = resolveFilePath(p.Path)
		content, err := r.fileSvc.Read(nodeID, p.Path)
		if err != nil {
			return "读取失败: " + err.Error(), nil
		}
		if !utf8.Valid(content) || bytes.ContainsRune(content, 0) {
			return fmt.Sprintf("[二进制文件，无法显示内容，大小: %d 字节]", len(content)), nil
		}

		hasRange := p.StartLine > 0 || p.EndLine > 0

		if !hasRange {
			// No line range: return full content (legacy behavior)
			s := string(content)
			if len(s) > 50000 {
				s = s[:50000] + "\n... (内容已截断，共 " + fmt.Sprintf("%d", len(content)) + " 字节)"
			}
			return s, nil
		}

		// Line range mode: split into lines and extract range
		lines := strings.Split(string(content), "\n")
		totalLines := len(lines)

		start := p.StartLine
		if start <= 0 {
			start = 1
		}
		if start > totalLines {
			return fmt.Sprintf("起始行 %d 超出文件总行数 %d", start, totalLines), nil
		}

		end := p.EndLine
		if end <= 0 || end > totalLines {
			end = totalLines
		}
		if end < start {
			return fmt.Sprintf("结束行 %d 小于起始行 %d", end, start), nil
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("[%s] 第 %d-%d 行（共 %d 行）\n\n", p.Path, start, end, totalLines))

		// Calculate line number width for alignment
		width := len(fmt.Sprintf("%d", end))
		for i := start - 1; i < end; i++ {
			line := lines[i]
			if len(line) > 500 {
				line = line[:500] + "..."
			}
			sb.WriteString(fmt.Sprintf("%*d │ %s\n", width, i+1, line))
		}

		result := sb.String()
		if len(result) > 50000 {
			result = result[:50000] + "\n... (内容已截断)"
		}
		return result, nil
	})
}

func (r *ToolRegistry) registerWriteFile() {
	r.register("write_file", "将内容写入用户文件系统。需要指定存储节点 node_id。", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件路径（绝对路径或相对路径，相对路径基于数据目录）",
			},
			"content": map[string]interface{}{
				"type":        "string",
				"description": "文件内容",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID，参见系统提示中的节点列表",
			},
		},
		"required": []string{"path", "content"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path    string `json:"path"`
			Content string `json:"content"`
			NodeID  string `json:"node_id"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		p.Path = resolveFilePath(p.Path)
		r.saveBackup(convID, nodeID, p.Path, "write_file")
		if err := r.fileSvc.Write(nodeID, p.Path, []byte(p.Content)); err != nil {
			return "写入失败: " + err.Error(), nil
		}
		return "文件已写入: " + p.Path, nil
	})
}

func (r *ToolRegistry) registerEditFile() {
	r.register("edit_file", `对用户文件系统中的文件进行局部编辑。通过精确匹配 old_string 并替换为 new_string 来修改文件内容，无需重写整个文件。
- old_string 必须与文件中的内容完全匹配（包括空格和换行）
- 如果 old_string 在文件中出现多次，默认只替换第一处；设置 replace_all=true 可替换所有匹配
- 如果 old_string 为空字符串，则将 new_string 追加到文件末尾`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件路径（绝对路径或相对路径，相对路径基于数据目录）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID，参见系统提示中的节点列表",
			},
			"old_string": map[string]interface{}{
				"type":        "string",
				"description": "要被替换的原始文本（必须精确匹配文件中的内容）。为空字符串时表示追加模式",
			},
			"new_string": map[string]interface{}{
				"type":        "string",
				"description": "替换后的新文本，或追加模式下要追加的内容",
			},
			"replace_all": map[string]interface{}{
				"type":        "boolean",
				"description": "是否替换所有匹配项，默认 false 只替换第一处",
			},
		},
		"required": []string{"path", "old_string", "new_string"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path       string `json:"path"`
			NodeID     string `json:"node_id"`
			OldString  string `json:"old_string"`
			NewString  string `json:"new_string"`
			ReplaceAll bool   `json:"replace_all"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		p.Path = resolveFilePath(p.Path)

		// Read existing content
		content, err := r.fileSvc.Read(nodeID, p.Path)
		if err != nil {
			return "读取失败: " + err.Error(), nil
		}
		original := string(content)

		var updated string
		if p.OldString == "" {
			// Append mode
			updated = original + p.NewString
		} else {
			// Replace mode
			if !strings.Contains(original, p.OldString) {
				return "错误: old_string 在文件中未找到，请确认内容是否完全匹配（包括空格和换行）", nil
			}
			if p.ReplaceAll {
				updated = strings.ReplaceAll(original, p.OldString, p.NewString)
			} else {
				updated = strings.Replace(original, p.OldString, p.NewString, 1)
			}
		}

		r.saveBackup(convID, nodeID, p.Path, "edit_file")
		if err := r.fileSvc.Write(nodeID, p.Path, []byte(updated)); err != nil {
			return "写入失败: " + err.Error(), nil
		}

		if p.OldString == "" {
			return "内容已追加到: " + p.Path, nil
		}
		count := strings.Count(original, p.OldString)
		if p.ReplaceAll {
			return fmt.Sprintf("文件已编辑: %s（替换了 %d 处匹配）", p.Path, count), nil
		}
		return fmt.Sprintf("文件已编辑: %s（替换了第 1 处匹配，共 %d 处）", p.Path, count), nil
	})
}

func (r *ToolRegistry) registerUndoFile() {
	r.register("undo_file", `撤销本次对话中对文件的修改。按时间倒序逐步回退 write_file 和 edit_file 的操作。
- 不指定 path 时，撤销最近一次文件修改
- 指定 path 时，撤销该文件的最近一次修改
- 指定 steps 可一次撤销多步（默认 1）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "要撤销的文件路径（可选，不指定则撤销最近一次修改）",
			},
			"steps": map[string]interface{}{
				"type":        "integer",
				"description": "撤销步数，默认 1",
			},
		},
		"required": []string{},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path  string `json:"path"`
			Steps int    `json:"steps"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.Steps <= 0 {
			p.Steps = 1
		}

		r.backupMu.Lock()
		defer r.backupMu.Unlock()

		backups := r.backups[convID]
		if len(backups) == 0 {
			return "没有可撤销的操作", nil
		}

		var results []string
		restored := 0
		for i := 0; i < p.Steps; i++ {
			// Find the backup to restore (search from end)
			idx := -1
			for j := len(backups) - 1; j >= 0; j-- {
				if p.Path == "" || backups[j].Path == p.Path {
					idx = j
					break
				}
			}
			if idx < 0 {
				break
			}

			b := backups[idx]
			// Remove this backup from the list
			backups = append(backups[:idx], backups[idx+1:]...)

			if b.Content == nil {
				// File didn't exist before — delete it
				driver, err := storage.GetDriver(b.NodeID)
				if err == nil {
					err = driver.Delete(b.Path)
				}
				if err != nil {
					results = append(results, fmt.Sprintf("✗ 删除 %s 失败: %v", b.Path, err))
				} else {
					results = append(results, fmt.Sprintf("✓ 已删除 %s（文件原本不存在）", b.Path))
				}
			} else {
				// Restore original content
				if err := r.fileSvc.Write(b.NodeID, b.Path, b.Content); err != nil {
					results = append(results, fmt.Sprintf("✗ 恢复 %s 失败: %v", b.Path, err))
				} else {
					results = append(results, fmt.Sprintf("✓ 已恢复 %s", b.Path))
				}
			}
			restored++
		}

		r.backups[convID] = backups

		if restored == 0 {
			return "没有找到匹配的可撤销操作", nil
		}
		return fmt.Sprintf("已撤销 %d 步:\n%s", restored, strings.Join(results, "\n")), nil
	})
}

func (r *ToolRegistry) registerListFiles() {
	r.register("list_files", "列出指定目录下的文件和文件夹。需要指定存储节点 node_id。", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "目录路径（绝对路径或相对路径，相对路径基于数据目录）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID，参见系统提示中的节点列表",
			},
		},
		"required": []string{"path"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path   string `json:"path"`
			NodeID string `json:"node_id"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		p.Path = resolveFilePath(p.Path)
		files, err := r.fileSvc.List(nodeID, p.Path)
		if err != nil {
			return "列出失败: " + err.Error(), nil
		}
		var lines []string
		for _, f := range files {
			prefix := "📄"
			if f.IsDir {
				prefix = "📁"
			}
			lines = append(lines, prefix+" "+f.Name)
		}
		if len(lines) == 0 {
			return "目录为空", nil
		}
		return strings.Join(lines, "\n"), nil
	})
}

func (r *ToolRegistry) registerOpenUI() {
	r.register("open_ui", `在 WebOS 前端浏览器界面中打开应用或文件。此工具仅操作 WebOS Web 桌面（浏览器中运行的 Web 应用），不控制宿主机操作系统的桌面、窗口或本地程序。
如需操作宿主机系统桌面（如打开本地软件、控制系统窗口），请使用 shell 工具或相关 skill，不要使用此工具。

操作类型：
- open_app：在 WebOS 桌面打开指定 Web 应用，可通过 options 传递启动参数（透传给前端 defaultAppData）
- open_path：在 WebOS 桌面打开指定的文件或目录（自动判断类型）

常用 app_id 及其 options：
  fileManager  — { "initialPath": "/home" }
  terminal     — { "initialCommand": "htop" }
  editor       — （无需 options，用 open_path 打开文件更方便）
  video        — { "playlist": [{"label":"第1集","url":"https://example.com/ep1.m3u8"},{"label":"第2集","url":"https://example.com/ep2.m3u8"}] }  支持 m3u8/mp4 等格式，单视频也用数组包一项即可。如果收到 vod_play_url 格式如 "第01集$url#第02集$url"，需先按 # 分割再按 $ 分割转成 playlist 数组
  musicPlayer  — { "directTrack": { "url": "https://...", "title": "歌曲名", "nodeId": "local_1" } }
  webview      — { "src": "https://example.com" }
  settings     — （无需 options）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"open_app", "open_path"},
				"description": "要执行的 UI 操作类型",
			},
			"app_id": map[string]interface{}{
				"type":        "string",
				"description": "应用ID（open_app 时必填）",
			},
			"options": map[string]interface{}{
				"type":        "object",
				"description": "传递给应用的启动参数（open_app 时可选），不同应用接受不同参数，见上方说明",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件或目录路径（open_path 时必填）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID（默认自动解析）",
			},
		},
		"required": []string{"action"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Action  string                 `json:"action"`
			AppID   string                 `json:"app_id"`
			Options map[string]interface{} `json:"options"`
			Path    string                 `json:"path"`
			NodeID  string                 `json:"node_id"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}

		switch p.Action {
		case "open_app":
			if p.AppID == "" {
				return "错误: open_app 需要指定 app_id", nil
			}
		case "open_path":
			if p.Path == "" {
				return "错误: open_path 需要指定 path", nil
			}
			p.Path = resolveFilePath(p.Path)
			if p.NodeID == "" {
				p.NodeID, _ = resolveNodeID("")
			}
		default:
			return "错误: 不支持的 action: " + p.Action, nil
		}

		sink, ok := ctx.Value(sinkContextKey{}).(ChatSink)
		if !ok {
			return "错误: 无法推送 UI 操作", nil
		}

		params := map[string]interface{}{}
		if p.AppID != "" {
			params["appId"] = p.AppID
		}
		if p.Options != nil {
			params["options"] = p.Options
		}
		if p.Path != "" {
			params["path"] = p.Path
		}
		if p.NodeID != "" {
			params["nodeId"] = p.NodeID
		}

		if p.Action == "open_path" {
			isDir := false
			driver, err := storage.GetDriver(p.NodeID)
			if err == nil {
				if info, statErr := driver.Stat(p.Path); statErr == nil {
					isDir = info.IsDir
				}
			}
			if isDir {
				params["pathType"] = "directory"
			} else {
				params["pathType"] = "file"
			}
		}

		sink.OnUIAction(convID, UIAction{
			Action: p.Action,
			Params: params,
		})

		switch p.Action {
		case "open_app":
			return "已打开应用: " + p.AppID, nil
		case "open_path":
			return "已打开: " + p.Path, nil
		}
		return "已执行", nil
	})
}

func (r *ToolRegistry) registerSendFile() {
	r.register("send_file", `向用户发送文件或图片。文件会通过当前客户端的方式投递给用户（Web 端显示文件卡片，Telegram 端发送文件/图片消息等）。
- 支持发送任意文件类型，图片会自动识别并以图片形式展示
- 需要指定存储节点 node_id 和文件路径
- 可附加说明文字 caption`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件路径（绝对路径或相对路径）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID",
			},
			"caption": map[string]interface{}{
				"type":        "string",
				"description": "附加说明文字（可选）",
			},
		},
		"required": []string{"path"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Path    string `json:"path"`
			NodeID  string `json:"node_id"`
			Caption string `json:"caption"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		p.Path = resolveFilePath(p.Path)

		info, err := r.fileSvc.StatBasic(nodeID, p.Path)
		if err != nil {
			return "文件不存在: " + err.Error(), nil
		}
		if info.IsDir {
			return "错误: 不能发送目录，请指定具体文件", nil
		}

		// Detect mime type from extension
		ext := strings.ToLower(filepath.Ext(p.Path))
		mimeType := ""
		if m, ok := imageExts[ext]; ok {
			mimeType = m
		} else {
			// Common file types
			mimeMap := map[string]string{
				".pdf":  "application/pdf",
				".zip":  "application/zip",
				".tar":  "application/x-tar",
				".gz":   "application/gzip",
				".mp4":  "video/mp4",
				".mp3":  "audio/mpeg",
				".wav":  "audio/wav",
				".txt":  "text/plain",
				".json": "application/json",
				".csv":  "text/csv",
				".md":   "text/markdown",
				".html": "text/html",
				".xml":  "text/xml",
				".doc":  "application/msword",
				".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				".xls":  "application/vnd.ms-excel",
				".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			}
			if m, ok := mimeMap[ext]; ok {
				mimeType = m
			} else {
				mimeType = "application/octet-stream"
			}
		}

		sink, ok := ctx.Value(sinkContextKey{}).(ChatSink)
		if !ok {
			return "错误: 无法发送文件（sink 不可用）", nil
		}

		sink.OnMediaAttachment(convID, MediaAttachment{
			NodeID:   nodeID,
			Path:     p.Path,
			FileName: info.Name,
			MimeType: mimeType,
			Size:     info.Size,
			Caption:  p.Caption,
		})

		sizeStr := fmt.Sprintf("%.1f KB", float64(info.Size)/1024)
		if info.Size > 1024*1024 {
			sizeStr = fmt.Sprintf("%.1f MB", float64(info.Size)/(1024*1024))
		}
		return fmt.Sprintf("已发送文件: %s (%s, %s)", info.Name, sizeStr, mimeType), nil
	})
}

func (r *ToolRegistry) registerBackgroundTask() {
	r.register("submit_background_task", `提交一个后台任务。适合耗时操作（编译、下载、批量处理等）。
任务会立即返回任务ID，在后台异步执行，执行结果通过系统通知推送给用户。
注意：此工具在宿主机上执行命令，不经过沙箱。`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title": map[string]interface{}{
				"type":        "string",
				"description": "任务标题，用户可见的描述",
			},
			"command": map[string]interface{}{
				"type":        "string",
				"description": "要在后台执行的 shell 命令",
			},
		},
		"required": []string{"title", "command"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Title   string `json:"title"`
			Command string `json:"command"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.Title == "" || p.Command == "" {
			return "错误: title 和 command 不能为空", nil
		}
		taskID := ActionSubmitBackgroundTask(p.Title, p.Command)
		return fmt.Sprintf("后台任务已提交，任务ID: %s\n用户会在任务完成后收到通知。", taskID), nil
	})
}

func (r *ToolRegistry) registerQueryTasks() {
	r.register("query_tasks", `查询后台任务的状态和进度。支持以下操作：
- list：列出所有后台任务（最近50个）
- get：查询指定任务的详细状态
- cancel：取消正在运行的任务

任务状态：running（运行中）、success（成功）、failed（失败）、cancelled（已取消）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"list", "get", "cancel"},
				"description": "操作类型",
			},
			"task_id": map[string]interface{}{
				"type":        "string",
				"description": "任务ID（get/cancel 时必填）",
			},
			"status_filter": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"running", "success", "failed", "cancelled"},
				"description": "按状态过滤（list 时可选）",
			},
		},
		"required": []string{"action"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Action       string `json:"action"`
			TaskID       string `json:"task_id"`
			StatusFilter string `json:"status_filter"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}

		switch p.Action {
		case "list":
			tasks := ActionListTasks(p.StatusFilter)
			if len(tasks) == 0 {
				if p.StatusFilter != "" {
					return fmt.Sprintf("没有状态为 %s 的任务。", p.StatusFilter), nil
				}
				return "当前没有后台任务。", nil
			}
			data, _ := json.MarshalIndent(tasks, "", "  ")
			return string(data), nil

		case "get":
			if p.TaskID == "" {
				return "错误: get 需要 task_id", nil
			}
			t := ActionGetTask(p.TaskID)
			if t == nil {
				return fmt.Sprintf("未找到任务 %s", p.TaskID), nil
			}
			data, _ := json.MarshalIndent(t, "", "  ")
			return string(data), nil

		case "cancel":
			if p.TaskID == "" {
				return "错误: cancel 需要 task_id", nil
			}
			if ActionCancelTask(p.TaskID) {
				return fmt.Sprintf("任务 %s 已取消", p.TaskID), nil
			}
			return fmt.Sprintf("无法取消任务 %s（可能已完成或不存在）", p.TaskID), nil

		default:
			return "错误: 不支持的 action: " + p.Action, nil
		}
	})
}

func (r *ToolRegistry) registerScheduledJobs() {
	r.register("manage_scheduled_jobs", `管理系统定时任务。支持以下操作：
- list：列出所有定时任务及状态
- create：创建新的定时任务（周期性或一次性）
- update：更新已有定时任务
- delete：删除定时任务
- run：立即执行一次指定任务
- enable：启用任务
- disable：禁用任务

支持三种任务类型（job_type）：
- "shell"（默认）：执行 Linux shell 命令，command 填 shell 命令
- "command"：执行 WebOS 系统命令，command 填命令内容（无需 / 前缀）。重要的可用命令：
  · "ai @<客户端ID> <消息>" — AI 自驱动入口，给 AI 发一条消息，并将回复定向发到指定客户端。
    用途：定时触发 AI 主动行为、自动化巡检、多步骤自动化流程，并把结果发到目标端。
    例如：command="ai @weixin-ai-bot 检查服务器状态，如果异常则通知管理员"
  · "ai <消息>" — 仅触发 AI 执行，不回传到任何客户端。适合纯后台处理、写文件、执行自动化流程。
  · "notify <消息>" — 广播系统通知到所有已连接客户端（Web/Telegram/飞书等）
  · "notify @<客户端ID> <消息>" — 定向推送到指定客户端
  · 其他命令：status、jobs、conv list 等所有斜杠命令均可使用
- "builtin"：执行系统内置操作，需要设置 operation 字段，可选参数通过 node_id/dst_node_id/paths/path/to/output/dest 传入

builtin 可用的 operation：
- "rebuild-index-local"：重建所有本地存储节点的文件索引
- "rebuild-index-s3"：重建所有 S3 存储节点的文件索引
- "clean-uploads"：清理过期的上传会话
- "copy"：定时复制文件，需要 node_id、paths、to，跨节点还需 dst_node_id
- "compress"：定时压缩文件，需要 node_id、paths、output
- "extract"：定时解压文件，需要 node_id、path，可选 dest

支持两种调度类型（schedule_type）：
- "cron"（默认）：周期性任务，需要 cron_expr
- "once"：一次性任务，需要 run_at，执行完后自动删除

Cron 表达式为 6 字段格式：秒 分 时 日 月 周
示例：
- "0 0 3 * * *" = 每天凌晨 3:00
- "0 */30 * * * *" = 每 30 分钟
- "0 0 9,18 * * *" = 每天 9:00 和 18:00

场景判断：
- 用户说"每天/每周/每小时..."等含重复语义 → schedule_type="cron"
- 用户说"3点提醒我/下午帮我/5分钟后..."等一次性语义 → schedule_type="once"
- 用户要求发通知、提醒、广播等 → job_type="command", command="notify ..."
- 用户要求 AI 定时做某事（巡检、汇报、检查、分析等）且需要把结果发到某个端 → job_type="command", command="ai @<客户端ID> <具体指令>"
- 用户要求 AI 定时做某事但不需要给任何客户端回消息 → job_type="command", command="ai <具体指令>"
- 用户要求执行脚本、系统命令等 → job_type="shell"
- 用户要求索引、清理、备份文件等系统维护 → job_type="builtin"

示例：
- "每天3点重建索引" → cron + builtin, operation="rebuild-index-local"
- "3点提醒我修 bug" → once + command, command="notify 该修 bug 了"
- "每天早上检查服务器状态并发到微信" → cron + command, command="ai @weixin-ai-bot 检查系统状态，如有异常通知我"
- "5分钟后帮我分析日志但不用回消息" → once + command, command="ai 分析最近的系统日志，总结异常"
- "每小时清理过期上传" → cron + builtin, operation="clean-uploads"
- "5分钟后执行备份脚本" → once + shell, run_at="+5m"
- "每天把 photos 复制到备份节点" → cron + builtin, operation="copy"`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"list", "create", "update", "delete", "run", "enable", "disable"},
				"description": "要执行的操作",
			},
			"job_id": map[string]interface{}{
				"type":        "string",
				"description": "任务ID（update/delete/run/enable/disable 时必填）",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "任务名称（create/update 时使用）",
			},
			"job_type": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"shell", "command", "builtin"},
				"description": "任务类型：shell=Linux 命令（默认），command=WebOS 斜杠命令，builtin=系统内置操作",
			},
			"schedule_type": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"cron", "once"},
				"description": "调度类型：cron=周期性（默认），once=一次性执行后自动删除",
			},
			"cron_expr": map[string]interface{}{
				"type":        "string",
				"description": "Cron 表达式，6字段：秒 分 时 日 月 周（schedule_type=cron 时使用）",
			},
			"run_at": map[string]interface{}{
				"type":        "string",
				"description": "一次性任务的执行时间。支持：'+30s'/'+5m'/'+2h'/'+1h28m'/'+1h28m2s'（相对）或 '2026-03-02 20:30'（绝对）",
			},
			"command": map[string]interface{}{
				"type":        "string",
				"description": "shell 或 command 类型的命令内容。job_type=shell 时为 Linux 命令；job_type=command 时为 WebOS 命令，如 'notify 你好'、'ai @weixin-ai-bot 检查服务器状态'、'ai 分析日志并写入文件'、'notify @telegram 提醒消息'（无需 / 前缀）",
			},
			"operation": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"rebuild-index-local", "rebuild-index-s3", "clean-uploads", "copy", "compress", "extract"},
				"description": "builtin 操作名称（job_type=builtin 时必填）",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点 ID（builtin 的 copy/compress/extract 操作使用）",
			},
			"dst_node_id": map[string]interface{}{
				"type":        "string",
				"description": "目标存储节点 ID（builtin copy 跨节点复制时使用）",
			},
			"paths": map[string]interface{}{
				"type":        "array",
				"items":       map[string]interface{}{"type": "string"},
				"description": "文件路径列表（builtin copy/compress 使用）",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "单个文件路径（builtin extract 使用）",
			},
			"to": map[string]interface{}{
				"type":        "string",
				"description": "目标路径（builtin copy 使用）",
			},
			"output": map[string]interface{}{
				"type":        "string",
				"description": "输出文件路径（builtin compress 使用）",
			},
			"dest": map[string]interface{}{
				"type":        "string",
				"description": "解压目标目录（builtin extract 使用，默认为压缩文件所在目录）",
			},
			"silent": map[string]interface{}{
				"type":        "boolean",
				"description": "是否静默执行，不弹出前端通知（默认 false）",
			},
		},
		"required": []string{"action"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Action       string   `json:"action"`
			JobID        string   `json:"job_id"`
			Name         string   `json:"name"`
			JobType      string   `json:"job_type"`
			ScheduleType string   `json:"schedule_type"`
			CronExpr     string   `json:"cron_expr"`
			RunAt        string   `json:"run_at"`
			Command      string   `json:"command"`
			Operation    string   `json:"operation"`
			NodeID       string   `json:"node_id"`
			DstNodeID    string   `json:"dst_node_id"`
			Paths        []string `json:"paths"`
			Path         string   `json:"path"`
			To           string   `json:"to"`
			Output       string   `json:"output"`
			Dest         string   `json:"dest"`
			Silent       bool     `json:"silent"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		if p.JobType == "" {
			p.JobType = "shell"
		}
		if p.ScheduleType == "" {
			p.ScheduleType = "cron"
		}

		// Build config JSON based on job_type
		buildConfig := func() string {
			switch p.JobType {
			case "builtin":
				cfg := map[string]interface{}{"operation": p.Operation}
				if p.NodeID != "" {
					cfg["nodeId"] = p.NodeID
				}
				if p.DstNodeID != "" {
					cfg["dstNodeId"] = p.DstNodeID
				}
				if len(p.Paths) > 0 {
					cfg["paths"] = p.Paths
				}
				if p.Path != "" {
					cfg["path"] = p.Path
				}
				if p.To != "" {
					cfg["to"] = p.To
				}
				if p.Output != "" {
					cfg["output"] = p.Output
				}
				if p.Dest != "" {
					cfg["dest"] = p.Dest
				}
				b, _ := json.Marshal(cfg)
				return string(b)
			default: // shell, command
				b, _ := json.Marshal(map[string]string{"command": p.Command})
				return string(b)
			}
		}

		switch p.Action {
		case "list":
			jobs := ActionListScheduledJobs()
			if len(jobs) == 0 {
				return "当前没有定时任务。", nil
			}
			data, _ := json.MarshalIndent(jobs, "", "  ")
			return string(data), nil

		case "create":
			configJSON := buildConfig()
			jobID, err := ActionCreateScheduledJob(p.Name, p.JobType, p.CronExpr, configJSON, p.Silent, p.ScheduleType, p.RunAt, r.fileSvc)
			if err != nil {
				return "错误: " + err.Error(), nil
			}
			detail := p.Command
			if p.JobType == "builtin" {
				detail = p.Operation
			}
			if p.ScheduleType == "once" {
				return fmt.Sprintf("一次性任务已创建:\n- ID: %s\n- 名称: %s\n- 类型: %s\n- 执行时间: %s\n- 内容: %s", jobID, p.Name, p.JobType, p.RunAt, detail), nil
			}
			return fmt.Sprintf("定时任务已创建:\n- ID: %s\n- 名称: %s\n- 类型: %s\n- 计划: %s\n- 内容: %s", jobID, p.Name, p.JobType, p.CronExpr, detail), nil

		case "update":
			configJSON := buildConfig()
			if err := ActionUpdateScheduledJob(p.JobID, p.Name, p.JobType, p.CronExpr, configJSON, p.Silent, p.ScheduleType, p.RunAt, r.fileSvc); err != nil {
				return "错误: " + err.Error(), nil
			}
			return fmt.Sprintf("定时任务 %s 已更新", p.JobID), nil

		case "delete":
			if err := ActionDeleteScheduledJob(p.JobID); err != nil {
				return "错误: " + err.Error(), nil
			}
			return fmt.Sprintf("定时任务 %s 已删除", p.JobID), nil

		case "run":
			if err := ActionRunScheduledJob(p.JobID); err != nil {
				return "错误: " + err.Error(), nil
			}
			return fmt.Sprintf("定时任务 %s 已触发立即执行", p.JobID), nil

		case "enable":
			if err := ActionEnableScheduledJob(p.JobID); err != nil {
				return "错误: " + err.Error(), nil
			}
			return fmt.Sprintf("定时任务 %s 已启用", p.JobID), nil

		case "disable":
			if err := ActionDisableScheduledJob(p.JobID); err != nil {
				return "错误: " + err.Error(), nil
			}
			return fmt.Sprintf("定时任务 %s 已禁用", p.JobID), nil

		default:
			return "错误: 不支持的 action: " + p.Action, nil
		}
	})
}

func (r *ToolRegistry) registerSystemManage() {
	// Build dynamic command list for the tool description
	var descBuilder strings.Builder
	descBuilder.WriteString("执行斜杠命令。可用命令：\n")
	for _, c := range service.GetCommandRegistry() {
		if c.Hidden {
			continue
		}
		descBuilder.WriteString(fmt.Sprintf("- /%s", c.Name))
		if c.Args != "" {
			descBuilder.WriteString(fmt.Sprintf(" %s", c.Args))
		}
		descBuilder.WriteString(fmt.Sprintf("：%s\n", c.Description))
	}
	descBuilder.WriteString("\n直接传入命令名和参数即可执行，与用户手动输入 /xxx 效果一致。")

	r.register("system_manage", descBuilder.String(), map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "斜杠命令名称（不含 / 前缀），例如：help, status, model, models, config, compress, reset, tasks, cancel, conv list, conv switch, conv new, notify, restart, stop",
			},
			"args": map[string]interface{}{
				"type":        "string",
				"description": "命令参数（可选），例如 /model 需要传模型引用，/cancel 需要传任务ID",
			},
		},
		"required": []string{"command"},
	}, func(ctx context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Command string `json:"command"`
			Args    string `json:"args"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}

		ce := service.GetCommandExecutor()
		result := ce.ExecuteCommand(convID, p.Command, p.Args)

		// Handle side effects
		if result.ClearHistory || result.StopChat || result.SwitchModel != "" {
			ce.HandleCommandResult(convID, result)
		}

		if result.IsError {
			return "错误: " + result.Text, nil
		}
		return result.Text, nil
	})
}

func (r *ToolRegistry) registerStringSearch() {
	r.register("string_search", `在文件或目录中搜索文本内容（类似 grep）。支持正则表达式，返回匹配的文件名、行号和上下文。
- 指定文件时搜索该文件，指定目录时递归搜索目录下所有文本文件
- 自动跳过二进制文件和超大文件（>50MB）
- 可通过 include 参数过滤文件类型（如 *.go、*.js）`, map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"pattern": map[string]interface{}{
				"type":        "string",
				"description": "搜索模式，支持正则表达式（如 \"func.*Search\" 或普通字符串 \"TODO\"）",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文件或目录路径（绝对路径或相对路径，相对路径基于数据目录）",
			},
			"context_lines": map[string]interface{}{
				"type":        "integer",
				"description": "匹配行前后显示的上下文行数，默认 2",
			},
			"include": map[string]interface{}{
				"type":        "string",
				"description": "文件名 glob 过滤，如 \"*.go\"、\"*.js\"，仅在搜索目录时生效",
			},
			"max_results": map[string]interface{}{
				"type":        "integer",
				"description": "最大匹配条数，默认 100，上限 500",
			},
			"node_id": map[string]interface{}{
				"type":        "string",
				"description": "存储节点ID，参见系统提示中的节点列表",
			},
		},
		"required": []string{"pattern", "path"},
	}, func(_ context.Context, convID string, args json.RawMessage) (string, error) {
		var p struct {
			Pattern      string `json:"pattern"`
			Path         string `json:"path"`
			ContextLines int    `json:"context_lines"`
			Include      string `json:"include"`
			MaxResults   int    `json:"max_results"`
			NodeID       string `json:"node_id"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}

		if p.ContextLines <= 0 {
			p.ContextLines = 2
		}
		if p.ContextLines > 10 {
			p.ContextLines = 10
		}
		if p.MaxResults <= 0 {
			p.MaxResults = 100
		}
		if p.MaxResults > 500 {
			p.MaxResults = 500
		}

		re, err := regexp.Compile(p.Pattern)
		if err != nil {
			return fmt.Sprintf("正则表达式编译失败: %v", err), nil
		}

		nodeID, errMsg := resolveNodeID(p.NodeID)
		if errMsg != "" {
			return errMsg, nil
		}
		searchPath := resolveFilePath(p.Path)

		type matchResult struct {
			File      string
			LineNum   int
			MatchLine string
			CtxBefore []string
			CtxAfter  []string
		}

		var results []matchResult
		var skippedBinary int
		var skippedLarge int
		const maxFileSize = 50 * 1024 * 1024 // 50MB
		const maxDepth = 20

		// searchFile searches a single file and appends matches to results.
		searchFile := func(filePath string) bool {
			info, err := r.fileSvc.StatBasic(nodeID, filePath)
			if err != nil {
				return true
			}
			if info.IsDir {
				return true
			}
			if info.Size > maxFileSize {
				skippedLarge++
				return true
			}

			content, err := r.fileSvc.Read(nodeID, filePath)
			if err != nil {
				return true
			}

			// Skip binary files
			if !utf8.Valid(content) || bytes.ContainsRune(content, 0) {
				skippedBinary++
				return true
			}

			lines := strings.Split(string(content), "\n")
			for i, line := range lines {
				if re.MatchString(line) {
					m := matchResult{
						File:    filePath,
						LineNum: i + 1,
					}
					// Truncate long match lines
					if len(line) > 500 {
						m.MatchLine = line[:500] + "..."
					} else {
						m.MatchLine = line
					}
					// Context before
					start := i - p.ContextLines
					if start < 0 {
						start = 0
					}
					for j := start; j < i; j++ {
						l := lines[j]
						if len(l) > 300 {
							l = l[:300] + "..."
						}
						m.CtxBefore = append(m.CtxBefore, l)
					}
					// Context after
					end := i + p.ContextLines
					if end >= len(lines) {
						end = len(lines) - 1
					}
					for j := i + 1; j <= end; j++ {
						l := lines[j]
						if len(l) > 300 {
							l = l[:300] + "..."
						}
						m.CtxAfter = append(m.CtxAfter, l)
					}
					results = append(results, m)
					if len(results) >= p.MaxResults {
						return false // stop
					}
				}
			}
			return true
		}

		// walkDir recursively walks a directory up to maxDepth.
		var walkDir func(dir string, depth int) bool
		walkDir = func(dir string, depth int) bool {
			if depth > maxDepth {
				return true
			}
			files, err := r.fileSvc.List(nodeID, dir)
			if err != nil {
				return true
			}
			for _, f := range files {
				fullPath := filepath.Join(dir, f.Name)
				if f.IsDir {
					if !walkDir(fullPath, depth+1) {
						return false
					}
					continue
				}
				// Apply include filter
				if p.Include != "" {
					matched, _ := filepath.Match(p.Include, f.Name)
					if !matched {
						continue
					}
				}
				if !searchFile(fullPath) {
					return false
				}
			}
			return true
		}

		// Determine if path is file or directory
		stat, err := r.fileSvc.StatBasic(nodeID, searchPath)
		if err != nil {
			return "路径不存在或无法访问: " + err.Error(), nil
		}

		if stat.IsDir {
			walkDir(searchPath, 0)
		} else {
			searchFile(searchPath)
		}

		if len(results) == 0 {
			msg := fmt.Sprintf("未找到匹配 \"%s\" 的内容", p.Pattern)
			if skippedBinary > 0 || skippedLarge > 0 {
				msg += fmt.Sprintf("（跳过: %d 个二进制文件, %d 个超大文件）", skippedBinary, skippedLarge)
			}
			return msg, nil
		}

		// Format output
		var sb strings.Builder
		truncated := len(results) >= p.MaxResults
		sb.WriteString(fmt.Sprintf("找到 %d 条匹配", len(results)))
		if truncated {
			sb.WriteString(fmt.Sprintf("（已达上限 %d，可能还有更多）", p.MaxResults))
		}
		if skippedBinary > 0 || skippedLarge > 0 {
			sb.WriteString(fmt.Sprintf("（跳过: %d 个二进制文件, %d 个超大文件）", skippedBinary, skippedLarge))
		}
		sb.WriteString("\n\n")

		lastFile := ""
		for _, m := range results {
			if m.File != lastFile {
				if lastFile != "" {
					sb.WriteString("\n")
				}
				sb.WriteString("📄 " + m.File + "\n")
				lastFile = m.File
			}
			// Context before
			for j, l := range m.CtxBefore {
				lineNum := m.LineNum - len(m.CtxBefore) + j
				sb.WriteString(fmt.Sprintf("  %d  │ %s\n", lineNum, l))
			}
			// Match line
			sb.WriteString(fmt.Sprintf("  %d ▶│ %s\n", m.LineNum, m.MatchLine))
			// Context after
			for j, l := range m.CtxAfter {
				lineNum := m.LineNum + 1 + j
				sb.WriteString(fmt.Sprintf("  %d  │ %s\n", lineNum, l))
			}
			sb.WriteString("  ───┼────\n")
		}

		return sb.String(), nil
	})
}
