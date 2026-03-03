package ai

import (
	"archive/tar"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// Sandbox connects to a user-managed, long-running Docker container.
// The container must be pre-created and running. Sandbox does NOT create or destroy it.
type Sandbox struct {
	cli       *client.Client
	available bool

	mu            sync.Mutex
	containerName string // name or ID of the fixed sandbox container
}

// NewSandbox creates a new Sandbox that connects to Docker.
func NewSandbox() *Sandbox {
	s := &Sandbox{
		containerName: getEnvOrDefault("WEBOS_SANDBOX_CONTAINER", "webos-sandbox"),
	}
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return s
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := cli.Ping(ctx); err != nil {
		cli.Close()
		return s
	}
	s.cli = cli
	s.available = true
	return s
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// IsAvailable returns whether Docker is accessible.
func (s *Sandbox) IsAvailable() bool {
	return s.available
}

// ContainerName returns the configured sandbox container name.
func (s *Sandbox) ContainerName() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.containerName
}

// SetContainerName updates the sandbox container name.
func (s *Sandbox) SetContainerName(name string) {
	s.mu.Lock()
	s.containerName = name
	s.mu.Unlock()
}

// checkContainer verifies the sandbox container is running.
func (s *Sandbox) checkContainer(ctx context.Context) (string, error) {
	name := s.ContainerName()
	info, err := s.cli.ContainerInspect(ctx, name)
	if err != nil {
		return "", fmt.Errorf("沙箱容器 '%s' 不存在或无法访问: %w", name, err)
	}
	if !info.State.Running {
		return "", fmt.Errorf("沙箱容器 '%s' 未运行，请先启动它", name)
	}
	return info.ID, nil
}

// Shell runs a shell command in the sandbox container.
// shellBin specifies the shell to use (e.g. "bash", "sh"). Defaults to "sh" if empty.
func (s *Sandbox) Shell(parent context.Context, command string, timeout int, onOutput func(stream, data string), shellBin ...string) (*ExecResult, error) {
	if !s.available {
		return nil, fmt.Errorf("Docker 不可用")
	}

	ctx, cancel := context.WithTimeout(parent, time.Duration(timeout+10)*time.Second)
	defer cancel()

	containerID, err := s.checkContainer(ctx)
	if err != nil {
		return nil, err
	}

	sh := "sh"
	if len(shellBin) > 0 && shellBin[0] != "" {
		sh = shellBin[0]
	}
	execCfg := container.ExecOptions{
		Cmd:          []string{sh, "-c", command},
		WorkingDir:   "/workspace",
		AttachStdout: true,
		AttachStderr: true,
	}
	execResp, err := s.cli.ContainerExecCreate(ctx, containerID, execCfg)
	if err != nil {
		return nil, fmt.Errorf("创建执行失败: %w", err)
	}

	attachResp, err := s.cli.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return nil, fmt.Errorf("连接执行失败: %w", err)
	}
	defer attachResp.Close()

	outputDone := make(chan struct{})
	var stdout, stderr string
	go func() {
		stdout, stderr = demuxOutput(attachResp.Reader, onOutput)
		close(outputDone)
	}()

	select {
	case <-outputDone:
	case <-ctx.Done():
		// Close the attach connection to unblock demuxOutput goroutine and
		// signal the exec process (SIGHUP). Wait briefly for cleanup.
		attachResp.Close()
		<-outputDone
		if parent.Err() != nil {
			return &ExecResult{Stderr: "已取消", ExitCode: -1}, nil
		}
		return &ExecResult{Stderr: "执行超时", ExitCode: -1}, nil
	}

	inspectResp, err := s.cli.ContainerExecInspect(ctx, execResp.ID)
	exitCode := 0
	if err == nil {
		exitCode = inspectResp.ExitCode
	}

	const maxLen = 50000
	if len(stdout) > maxLen {
		stdout = stdout[:maxLen] + "\n... (输出已截断)"
	}
	if len(stderr) > maxLen {
		stderr = stderr[:maxLen] + "\n... (输出已截断)"
	}

	return &ExecResult{
		Stdout:   stdout,
		Stderr:   stderr,
		ExitCode: exitCode,
	}, nil
}

// CopyFileIn copies a file into the sandbox container.
func (s *Sandbox) CopyFileIn(ctx context.Context, content []byte, containerPath string) error {
	if !s.available {
		return fmt.Errorf("Docker 不可用")
	}

	containerID, err := s.checkContainer(ctx)
	if err != nil {
		return err
	}

	// Ensure parent directory exists
	dir := filepath.Dir(containerPath)
	mkdirExec, _ := s.cli.ContainerExecCreate(ctx, containerID, container.ExecOptions{
		Cmd: []string{"mkdir", "-p", dir},
	})
	if mkdirExec.ID != "" {
		s.cli.ContainerExecStart(ctx, mkdirExec.ID, container.ExecStartOptions{})
	}

	return s.copyToContainer(ctx, containerID, containerPath, content)
}

// CopyFileOut copies a file from the sandbox container.
func (s *Sandbox) CopyFileOut(ctx context.Context, containerPath string) ([]byte, error) {
	if !s.available {
		return nil, fmt.Errorf("Docker 不可用")
	}

	containerID, err := s.checkContainer(ctx)
	if err != nil {
		return nil, err
	}

	return s.copyFromContainer(ctx, containerID, containerPath)
}

// IsDir checks whether a path in the sandbox container is a directory.
func (s *Sandbox) IsDir(ctx context.Context, containerPath string) (bool, error) {
	if !s.available {
		return false, fmt.Errorf("Docker 不可用")
	}

	containerID, err := s.checkContainer(ctx)
	if err != nil {
		return false, err
	}

	execCfg := container.ExecOptions{
		Cmd:          []string{"test", "-d", containerPath},
		AttachStdout: true,
		AttachStderr: true,
	}
	execResp, err := s.cli.ContainerExecCreate(ctx, containerID, execCfg)
	if err != nil {
		return false, err
	}
	attachResp, err := s.cli.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return false, err
	}
	io.Copy(io.Discard, attachResp.Reader)
	attachResp.Close()

	inspect, err := s.cli.ContainerExecInspect(ctx, execResp.ID)
	if err != nil {
		return false, err
	}
	return inspect.ExitCode == 0, nil
}

// ListDir lists file and directory names in a container directory.
func (s *Sandbox) ListDir(ctx context.Context, containerPath string) ([]string, error) {
	if !s.available {
		return nil, fmt.Errorf("Docker 不可用")
	}

	containerID, err := s.checkContainer(ctx)
	if err != nil {
		return nil, err
	}

	execCfg := container.ExecOptions{
		Cmd:          []string{"ls", "-1", containerPath},
		AttachStdout: true,
		AttachStderr: true,
	}
	execResp, err := s.cli.ContainerExecCreate(ctx, containerID, execCfg)
	if err != nil {
		return nil, err
	}
	attachResp, err := s.cli.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{})
	if err != nil {
		return nil, err
	}
	defer attachResp.Close()

	stdout, _ := demuxOutput(attachResp.Reader, nil)
	stdout = strings.TrimSpace(stdout)
	if stdout == "" {
		return nil, nil
	}
	return strings.Split(stdout, "\n"), nil
}

// copyToContainer copies a single file into the container.
func (s *Sandbox) copyToContainer(ctx context.Context, containerID, filePath string, content []byte) error {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	hdr := &tar.Header{
		Name: filepath.Base(filePath),
		Mode: 0644,
		Size: int64(len(content)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	if _, err := tw.Write(content); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	dir := filepath.Dir(filePath)
	return s.cli.CopyToContainer(ctx, containerID, dir, &buf, container.CopyToContainerOptions{})
}

// copyFromContainer reads a single file from the container.
func (s *Sandbox) copyFromContainer(ctx context.Context, containerID, filePath string) ([]byte, error) {
	reader, _, err := s.cli.CopyFromContainer(ctx, containerID, filePath)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	tr := tar.NewReader(reader)
	if _, err := tr.Next(); err != nil {
		return nil, fmt.Errorf("读取 tar 头失败: %w", err)
	}
	return io.ReadAll(tr)
}

// demuxOutput reads Docker multiplexed log stream and separates stdout/stderr.
// If onOutput is non-nil, each frame is also pushed to the callback.
func demuxOutput(r io.Reader, onOutput func(stream, data string)) (stdout, stderr string) {
	header := make([]byte, 8)
	var outBuf, errBuf strings.Builder
	for {
		_, err := io.ReadFull(r, header)
		if err != nil {
			break
		}
		streamType := header[0]
		size := uint32(header[4])<<24 | uint32(header[5])<<16 | uint32(header[6])<<8 | uint32(header[7])
		if size == 0 {
			continue
		}
		frame := make([]byte, size)
		_, err = io.ReadFull(r, frame)
		if err != nil {
			break
		}
		switch streamType {
		case 1:
			outBuf.Write(frame)
			if onOutput != nil {
				onOutput("stdout", string(frame))
			}
		case 2:
			errBuf.Write(frame)
			if onOutput != nil {
				onOutput("stderr", string(frame))
			}
		default:
			outBuf.Write(frame)
			if onOutput != nil {
				onOutput("stdout", string(frame))
			}
		}
	}
	return outBuf.String(), errBuf.String()
}
