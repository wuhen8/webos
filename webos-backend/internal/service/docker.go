package service

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

// DockerService handles Docker business logic via the Docker Engine SDK.
type DockerService struct {
	cli       *client.Client
	available bool

	statsMu    sync.RWMutex
	statsCache map[string]*containerStats // keyed by short ID (12 chars)
	statsStop  chan struct{}
	statsRefs  int

	// streamMu guards per-container streaming goroutines.
	streamMu      sync.Mutex
	streamCancel  map[string]context.CancelFunc // containerID -> cancel
	streamRunning bool

	// containerCacheMu guards the container list cache.
	containerCacheMu     sync.RWMutex
	containerCache       []ContainerDTO
	containerCacheExpiry time.Time

	// composeCacheMu guards the compose project list cache.
	composeCacheMu     sync.RWMutex
	composeCache       []ComposeProjectDTO
	composeCacheExpiry time.Time

	// composeCmd is the detected compose command: "docker compose" or "docker-compose".
	composeCmd     string
	composeCmdOnce sync.Once
}

// MountDTO is the typed data contract for a container mount sent to the frontend.
type MountDTO struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Driver      string `json:"driver"`
	RW          bool   `json:"rw"`
}

// ContainerDTO is the typed data contract for a container sent to the frontend.
type ContainerDTO struct {
	ID             string     `json:"id"`
	ShortID        string     `json:"shortId"`
	Name           string     `json:"name"`
	Image          string     `json:"image"`
	Command        string     `json:"command"`
	State          string     `json:"state"`
	Status         string     `json:"status"`
	CreatedAt      int64      `json:"createdAt"`
	Ports          string     `json:"ports"`
	Networks       string     `json:"networks"`
	ComposeProject string     `json:"composeProject,omitempty"`
	Mounts         []MountDTO `json:"mounts"`
	CPUPercent     float64    `json:"cpuPercent"`
	MemUsage       uint64     `json:"memUsage"`
	MemLimit       uint64     `json:"memLimit"`
	MemPercent     float64    `json:"memPercent"`
	NetRx          uint64     `json:"netRx"`
	NetTx          uint64     `json:"netTx"`
	BlockRead      uint64     `json:"blockRead"`
	BlockWrite     uint64     `json:"blockWrite"`
	PIDs           uint64     `json:"pids"`
}

// ImageDTO is the typed data contract for an image sent to the frontend.
type ImageDTO struct {
	ID         string `json:"id"`
	ShortID    string `json:"shortId"`
	Repository string `json:"repository"`
	Tag        string `json:"tag"`
	Size       int64  `json:"size"`
	CreatedAt  int64  `json:"createdAt"`
}

// ComposeProjectDTO is the typed data contract for a compose project.
type ComposeProjectDTO struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	ConfigFile string `json:"configFile"`
	ProjectDir string `json:"projectDir"`
	Source     string `json:"source"` // "docker", "appstore", "local"
}

// containerStats holds raw numeric stats for a container (internal cache).
type containerStats struct {
	CPUPercent float64
	MemUsage   uint64
	MemLimit   uint64
	MemPercent float64
	NetRx      uint64
	NetTx      uint64
	BlockRead  uint64
	BlockWrite uint64
	PIDs       uint64
}

var (
	dockerOnce     sync.Once
	dockerInstance *DockerService
)

// GetDockerService returns the singleton DockerService instance.
func GetDockerService() *DockerService {
	dockerOnce.Do(func() {
		dockerInstance = newDockerService()
	})
	return dockerInstance
}

// newDockerService creates a new DockerService instance.
func newDockerService() *DockerService {
	s := &DockerService{
		statsCache:   make(map[string]*containerStats),
		streamCancel: make(map[string]context.CancelFunc),
	}
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return s
	}
	// Quick ping to verify daemon is reachable
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

// EnsureDefaultNetwork creates the webos-network bridge network if it doesn't already exist.
func (s *DockerService) EnsureDefaultNetwork() {
	if !s.available {
		return
	}
	const name = "webos-network"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Check if network already exists
	networks, err := s.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return
	}
	for _, n := range networks {
		if n.Name == name {
			return
		}
	}
	// Create the network
	s.cli.NetworkCreate(ctx, name, network.CreateOptions{
		Driver: "bridge",
	})
}

// IsAvailable checks if Docker is available.
func (s *DockerService) IsAvailable() bool {
	return s.available
}

// errNotAvailable is returned when Docker is not reachable.
var errNotAvailable = fmt.Errorf("Docker is not available")

// checkAvailable returns an error if Docker is not available.
func (s *DockerService) checkAvailable() error {
	if !s.available {
		return errNotAvailable
	}
	return nil
}

// detectComposeCmd probes once whether "docker compose" or "docker-compose" is available.
func (s *DockerService) detectComposeCmd() string {
	s.composeCmdOnce.Do(func() {
		if exec.Command("docker", "compose", "version").Run() == nil {
			s.composeCmd = "docker compose"
		} else if exec.Command("docker-compose", "version").Run() == nil {
			s.composeCmd = "docker-compose"
		} else {
			s.composeCmd = "docker compose" // fallback default
		}
	})
	return s.composeCmd
}

// execCompose runs a compose CLI command using the detected compose command.
// It returns the combined stdout+stderr output.
func (s *DockerService) execCompose(dir string, args ...string) ([]byte, error) {
	composeCmd := s.detectComposeCmd()
	var cmd *exec.Cmd
	if composeCmd == "docker compose" {
		cmd = exec.Command("docker", append([]string{"compose"}, args...)...)
	} else {
		cmd = exec.Command("docker-compose", args...)
	}
	if dir != "" {
		cmd.Dir = dir
	}
	return cmd.CombinedOutput()
}

// GetInfo returns Docker system information.
func (s *DockerService) GetInfo() (interface{}, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	info, err := s.cli.Info(context.Background())
	if err != nil {
		return nil, err
	}
	// Convert to generic map to keep handler interface unchanged
	raw, _ := json.Marshal(info)
	var result interface{}
	json.Unmarshal(raw, &result)
	return result, nil
}

// ListContainers returns a list of Docker containers as typed DTOs.
func (s *DockerService) ListContainers(all bool) ([]ContainerDTO, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	containers, err := s.cli.ContainerList(context.Background(), container.ListOptions{All: all})
	if err != nil {
		return nil, err
	}

	result := make([]ContainerDTO, 0, len(containers))
	for _, c := range containers {
		result = append(result, s.containerToDTO(c))
	}
	return result, nil
}

// containerToDTO converts a Docker SDK container to a ContainerDTO.
func (s *DockerService) containerToDTO(c types.Container) ContainerDTO {
	name := ""
	if len(c.Names) > 0 {
		name = strings.TrimPrefix(c.Names[0], "/")
	}

	ports := formatPorts(c.Ports)

	networks := ""
	if c.NetworkSettings != nil {
		nets := make([]string, 0, len(c.NetworkSettings.Networks))
		for n := range c.NetworkSettings.Networks {
			nets = append(nets, n)
		}
		networks = strings.Join(nets, ",")
	}

	shortID := c.ID
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}

	mounts := make([]MountDTO, 0, len(c.Mounts))
	for _, m := range c.Mounts {
		mounts = append(mounts, MountDTO{
			Type:        string(m.Type),
			Name:        m.Name,
			Source:      m.Source,
			Destination: m.Destination,
			Driver:      m.Driver,
			RW:          m.RW,
		})
	}

	return ContainerDTO{
		ID:             c.ID,
		ShortID:        shortID,
		Name:           name,
		Image:          c.Image,
		Command:        c.Command,
		State:          c.State,
		Status:         c.Status,
		CreatedAt:      c.Created,
		Ports:          ports,
		Networks:       networks,
		ComposeProject: c.Labels["com.docker.compose.project"],
		Mounts:         mounts,
	}
}

// ListContainersWithStats returns containers merged with their CPU/memory stats from cache.
// Results are cached for 1 second to avoid redundant Docker API calls from multiple WebSocket clients.
func (s *DockerService) ListContainersWithStats() ([]ContainerDTO, error) {
	s.containerCacheMu.RLock()
	if s.containerCache != nil && time.Now().Before(s.containerCacheExpiry) {
		cached := make([]ContainerDTO, len(s.containerCache))
		copy(cached, s.containerCache)
		s.containerCacheMu.RUnlock()
		return cached, nil
	}
	s.containerCacheMu.RUnlock()

	containers, err := s.ListContainers(true)
	if err != nil {
		return nil, err
	}

	stats := s.GetCachedStats()

	for i := range containers {
		if st := matchStats(containers[i].ID, stats); st != nil {
			containers[i].CPUPercent = st.CPUPercent
			containers[i].MemUsage = st.MemUsage
			containers[i].MemLimit = st.MemLimit
			containers[i].MemPercent = st.MemPercent
			containers[i].NetRx = st.NetRx
			containers[i].NetTx = st.NetTx
			containers[i].BlockRead = st.BlockRead
			containers[i].BlockWrite = st.BlockWrite
			containers[i].PIDs = st.PIDs
		}
	}

	s.containerCacheMu.Lock()
	s.containerCache = containers
	s.containerCacheExpiry = time.Now().Add(1 * time.Second)
	s.containerCacheMu.Unlock()

	return containers, nil
}

// ListImages returns a list of Docker images as typed DTOs.
func (s *DockerService) ListImages() ([]ImageDTO, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	images, err := s.cli.ImageList(context.Background(), image.ListOptions{All: false})
	if err != nil {
		return nil, err
	}

	result := make([]ImageDTO, 0, len(images))
	for _, img := range images {
		if len(img.RepoTags) == 0 {
			result = append(result, s.imageToDTO(img, "<none>", "<none>"))
		} else {
			for _, repoTag := range img.RepoTags {
				repo, tag := parseRepoTag(repoTag)
				result = append(result, s.imageToDTO(img, repo, tag))
			}
		}
	}
	return result, nil
}

// imageToDTO converts a Docker SDK image to an ImageDTO.
func (s *DockerService) imageToDTO(img image.Summary, repo, tag string) ImageDTO {
	id := img.ID
	// Strip "sha256:" prefix
	shortID := strings.TrimPrefix(id, "sha256:")
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}

	return ImageDTO{
		ID:         strings.TrimPrefix(id, "sha256:"),
		ShortID:    shortID,
		Repository: repo,
		Tag:        tag,
		Size:       img.Size,
		CreatedAt:  img.Created,
	}
}

// GetContainerLogs returns logs for a container.
func (s *DockerService) GetContainerLogs(id, tail string) (string, error) {
	if err := s.checkAvailable(); err != nil {
		return "", err
	}
	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tail,
		Timestamps: true,
	}
	reader, err := s.cli.ContainerLogs(context.Background(), id, opts)
	if err != nil {
		return "", fmt.Errorf("get logs failed: %w", err)
	}
	defer reader.Close()

	return demuxLogs(reader)
}

// StreamContainerLogs streams container logs in real-time via Follow mode.
// It first sends the last `tail` lines, then follows new output.
// Each chunk of text is delivered to onData. Blocks until ctx is cancelled.
func (s *DockerService) StreamContainerLogs(ctx context.Context, id, tail string, onData func(string)) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tail,
		Timestamps: true,
		Follow:     true,
	}
	reader, err := s.cli.ContainerLogs(ctx, id, opts)
	if err != nil {
		return fmt.Errorf("stream logs failed: %w", err)
	}
	defer reader.Close()

	header := make([]byte, 8)
	buf := make([]byte, 32*1024)
	for {
		// Read Docker multiplex header
		_, err := io.ReadFull(reader, header)
		if err != nil {
			if ctx.Err() != nil {
				return nil // cancelled, normal exit
			}
			if err == io.EOF {
				return nil
			}
			// Might be a TTY stream without multiplex headers — fall back to raw read
			for {
				n, err := reader.Read(buf)
				if n > 0 {
					onData(string(buf[:n]))
				}
				if err != nil {
					return nil
				}
			}
		}
		size := binary.BigEndian.Uint32(header[4:8])
		if size == 0 {
			continue
		}
		if size > maxLogFrameSize {
			return fmt.Errorf("log frame too large: %d bytes", size)
		}
		frame := make([]byte, size)
		_, err = io.ReadFull(reader, frame)
		if err != nil {
			return nil
		}
		onData(string(frame))
	}
}

// demuxLogs reads Docker multiplexed log stream and returns plain text.
// Docker log stream has an 8-byte header per frame:
// [1]stream_type [3]padding [4]size_big_endian
const maxLogFrameSize = 64 * 1024 * 1024 // 64MB

func demuxLogs(r io.Reader) (string, error) {
	var sb strings.Builder
	header := make([]byte, 8)
	for {
		_, err := io.ReadFull(r, header)
		if err != nil {
			if err == io.EOF {
				break
			}
			// If it's not a multiplexed stream (e.g. TTY container), read raw
			if sb.Len() == 0 {
				raw, _ := io.ReadAll(r)
				return string(raw), nil
			}
			break
		}
		size := binary.BigEndian.Uint32(header[4:8])
		if size == 0 {
			continue
		}
		if size > maxLogFrameSize {
			break
		}
		frame := make([]byte, size)
		_, err = io.ReadFull(r, frame)
		if err != nil {
			break
		}
		sb.Write(frame)
	}
	return sb.String(), nil
}

// --- Stats collection via SDK streaming API ---

// StartStats starts the stats collection. Reference counted.
func (s *DockerService) StartStats() {
	if !s.available {
		return
	}
	s.statsMu.Lock()
	s.statsRefs++
	if s.statsRefs > 1 {
		s.statsMu.Unlock()
		return
	}
	stop := make(chan struct{})
	s.statsStop = stop
	s.statsMu.Unlock()

	go s.runStats(stop)
}

// StopStats decrements the reference count and stops stats when it reaches 0.
func (s *DockerService) StopStats() {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()
	if s.statsRefs <= 0 {
		return
	}
	s.statsRefs--
	if s.statsRefs == 0 && s.statsStop != nil {
		close(s.statsStop)
		s.statsStop = nil
		s.statsCache = make(map[string]*containerStats)
	}
}

// runStats manages per-container streaming goroutines.
// It periodically checks which containers are running and starts/stops streams accordingly.
func (s *DockerService) runStats(stop chan struct{}) {
	s.streamMu.Lock()
	s.streamRunning = true
	s.streamMu.Unlock()
	defer func() {
		s.streamMu.Lock()
		s.streamRunning = false
		// Cancel all active streams.
		for id, cancel := range s.streamCancel {
			cancel()
			delete(s.streamCancel, id)
		}
		s.streamMu.Unlock()
	}()

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	// Do an immediate first sync.
	s.syncStreams(stop)

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.syncStreams(stop)
		}
	}
}

// syncStreams ensures there is exactly one streaming goroutine per running container.
func (s *DockerService) syncStreams(stop chan struct{}) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	containers, err := s.cli.ContainerList(ctx, container.ListOptions{All: false})
	if err != nil {
		return
	}

	running := make(map[string]bool, len(containers))
	for _, c := range containers {
		running[c.ID] = true
	}

	s.streamMu.Lock()
	defer s.streamMu.Unlock()

	// Stop streams for containers that are no longer running.
	for id, cancelFn := range s.streamCancel {
		if !running[id] {
			cancelFn()
			delete(s.streamCancel, id)
			s.statsMu.Lock()
			delete(s.statsCache, id)
			s.statsMu.Unlock()
		}
	}

	// Start streams for new containers.
	for id := range running {
		if _, exists := s.streamCancel[id]; exists {
			continue
		}
		streamCtx, streamCancelFn := context.WithCancel(context.Background())
		s.streamCancel[id] = streamCancelFn
		go s.streamContainerStats(streamCtx, id, stop)
	}
}

// streamContainerStats reads a streaming stats connection for a single container.
func (s *DockerService) streamContainerStats(ctx context.Context, containerID string, stop chan struct{}) {
	defer func() {
		s.streamMu.Lock()
		delete(s.streamCancel, containerID)
		s.streamMu.Unlock()
	}()

	shortID := containerID
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}

	backoff := 2 * time.Second
	const maxBackoff = 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		default:
		}

		resp, err := s.cli.ContainerStats(ctx, containerID, true)
		if err != nil {
			return
		}

		decoder := json.NewDecoder(resp.Body)
		for {
			select {
			case <-ctx.Done():
				resp.Body.Close()
				return
			case <-stop:
				resp.Body.Close()
				return
			default:
			}

			var v container.StatsResponse
			if err := decoder.Decode(&v); err != nil {
				resp.Body.Close()
				break // reconnect
			}

			st := parseStatsResponse(&v)
			s.statsMu.Lock()
			s.statsCache[shortID] = st
			s.statsMu.Unlock()

			// Reset backoff on successful decode.
			backoff = 2 * time.Second
		}

		// Exponential backoff before reconnecting.
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-time.After(backoff):
		}
		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}

// parseStatsResponse extracts containerStats from a Docker stats response.
func parseStatsResponse(v *container.StatsResponse) *containerStats {
	// CPU percent
	cpuPercent := 0.0
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	if systemDelta > 0 && cpuDelta >= 0 {
		cpuCount := float64(v.CPUStats.OnlineCPUs)
		if cpuCount == 0 {
			cpuCount = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
		}
		if cpuCount == 0 {
			cpuCount = 1
		}
		cpuPercent = (cpuDelta / systemDelta) * cpuCount * 100.0
	}

	// Memory usage (subtract cache/inactive_file)
	memUsage := v.MemoryStats.Usage
	if cache, ok := v.MemoryStats.Stats["cache"]; ok && memUsage > cache {
		memUsage -= cache
	}
	if inactiveFile, ok := v.MemoryStats.Stats["inactive_file"]; ok && memUsage > inactiveFile {
		memUsage -= inactiveFile
	}
	memLimit := v.MemoryStats.Limit
	memPercent := 0.0
	if memLimit > 0 {
		memPercent = float64(memUsage) / float64(memLimit) * 100.0
	}

	// Network I/O
	var netRx, netTx uint64
	for _, net := range v.Networks {
		netRx += net.RxBytes
		netTx += net.TxBytes
	}

	// Block I/O
	var blockRead, blockWrite uint64
	for _, bio := range v.BlkioStats.IoServiceBytesRecursive {
		switch bio.Op {
		case "read", "Read":
			blockRead += bio.Value
		case "write", "Write":
			blockWrite += bio.Value
		}
	}

	return &containerStats{
		CPUPercent: cpuPercent,
		MemUsage:   memUsage,
		MemLimit:   memLimit,
		MemPercent: memPercent,
		NetRx:      netRx,
		NetTx:      netTx,
		BlockRead:  blockRead,
		BlockWrite: blockWrite,
		PIDs:       v.PidsStats.Current,
	}
}

// GetCachedStats returns the latest cached stats snapshot.
func (s *DockerService) GetCachedStats() map[string]*containerStats {
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()
	cp := make(map[string]*containerStats, len(s.statsCache))
	for k, v := range s.statsCache {
		cp[k] = v
	}
	return cp
}

// matchStats finds stats for a container by its short ID (first 12 chars).
func matchStats(id string, stats map[string]*containerStats) *containerStats {
	if id == "" {
		return nil
	}
	shortID := id
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}
	return stats[shortID]
}

// --- General helpers ---

func formatPorts(ports []types.Port) string {
	parts := make([]string, 0, len(ports))
	for _, p := range ports {
		if p.IP != "" {
			parts = append(parts, fmt.Sprintf("%s:%d->%d/%s", p.IP, p.PublicPort, p.PrivatePort, p.Type))
		} else {
			parts = append(parts, fmt.Sprintf("%d/%s", p.PrivatePort, p.Type))
		}
	}
	return strings.Join(parts, ", ")
}

func parseRepoTag(repoTag string) (string, string) {
	idx := strings.LastIndex(repoTag, ":")
	if idx < 0 {
		return repoTag, "<none>"
	}
	return repoTag[:idx], repoTag[idx+1:]
}

// --- Compose operations (kept as CLI, no socket API for compose) ---

// ListComposeProjects returns a list of Docker Compose projects as typed DTOs.
// Results are cached for 5 seconds to avoid repeated CLI calls.
func (s *DockerService) ListComposeProjects() ([]ComposeProjectDTO, error) {
	s.composeCacheMu.RLock()
	if s.composeCache != nil && time.Now().Before(s.composeCacheExpiry) {
		cached := make([]ComposeProjectDTO, len(s.composeCache))
		copy(cached, s.composeCache)
		s.composeCacheMu.RUnlock()
		return cached, nil
	}
	s.composeCacheMu.RUnlock()

	out, err := s.execCompose("", "ls", "--all", "--format", "json")
	if err != nil {
		return []ComposeProjectDTO{}, nil
	}

	// docker compose ls outputs JSON with keys: Name, Status, ConfigFiles
	var raw []struct {
		Name        string `json:"Name"`
		Status      string `json:"Status"`
		ConfigFiles string `json:"ConfigFiles"`
	}
	if json.Unmarshal(out, &raw) != nil {
		return []ComposeProjectDTO{}, nil
	}

	projects := make([]ComposeProjectDTO, 0, len(raw))
	for _, r := range raw {
		cf := strings.Split(r.ConfigFiles, ",")[0]
		cf = strings.TrimSpace(cf)
		projectDir := ""
		if cf != "" {
			projectDir = filepath.Dir(cf)
		}
		projects = append(projects, ComposeProjectDTO{
			Name:       r.Name,
			Status:     r.Status,
			ConfigFile: cf,
			ProjectDir: projectDir,
			Source:     "docker",
		})
	}

	s.composeCacheMu.Lock()
	s.composeCache = projects
	s.composeCacheExpiry = time.Now().Add(5 * time.Second)
	s.composeCacheMu.Unlock()

	return projects, nil
}

// ComposeAction performs an action on a Docker Compose project.
func (s *DockerService) ComposeAction(projectDir, action string) (string, error) {
	allowed := map[string]bool{"up": true, "down": true, "restart": true, "stop": true, "start": true, "pull": true}
	if !allowed[action] {
		return "", fmt.Errorf("unsupported action: %s", action)
	}

	var args []string
	if action == "up" {
		s.EnsureDefaultNetwork()
		args = []string{"up", "-d"}
	} else {
		args = []string{action}
	}

	out, err := s.execCompose(projectDir, args...)
	if err != nil {
		return "", fmt.Errorf("action failed: %s", strings.TrimSpace(string(out)))
	}

	return string(out), nil
}

// ComposeActionWithLog executes a compose action and streams output line-by-line.
func (s *DockerService) ComposeActionWithLog(ctx context.Context, projectDir, action string, logFn func(string)) error {
	allowed := map[string]bool{"up": true, "down": true, "restart": true, "stop": true, "start": true, "pull": true}
	if !allowed[action] {
		return fmt.Errorf("unsupported action: %s", action)
	}

	var args []string
	if action == "up" {
		s.EnsureDefaultNetwork()
		args = []string{"up", "-d"}
	} else {
		args = []string{action}
	}

	composeCmd := s.detectComposeCmd()
	var cmd *exec.Cmd
	if composeCmd == "docker compose" {
		cmd = exec.Command("docker", append([]string{"compose"}, args...)...)
	} else {
		cmd = exec.Command("docker-compose", args...)
	}
	if projectDir != "" {
		cmd.Dir = projectDir
	}

	// Capture combined output
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Read both pipes concurrently
	var wg sync.WaitGroup
	wg.Add(2)

	readPipe := func(pipe io.ReadCloser) {
		defer wg.Done()
		buf := make([]byte, 1024)
		for {
			n, err := pipe.Read(buf)
			if n > 0 {
				lines := strings.Split(string(buf[:n]), "\n")
				for _, line := range lines {
					if line = strings.TrimSpace(line); line != "" {
						logFn(line)
					}
				}
			}
			if err != nil {
				break
			}
		}
	}

	go readPipe(stdout)
	go readPipe(stderr)

	wg.Wait()
	return cmd.Wait()
}

// GetComposeLogs returns logs for a Docker Compose project.
func (s *DockerService) GetComposeLogs(projectDir, tail string) (string, error) {
	out, err := s.execCompose(projectDir, "logs", "--tail", tail, "--timestamps")
	if err != nil {
		return "", fmt.Errorf("get logs failed: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

// GetComposeContainers returns containers for a compose project as ContainerDTOs.
// Stats are not included; the frontend merges stats from the main containers subscription.
func (s *DockerService) GetComposeContainers(configFile string) ([]ContainerDTO, error) {
	out, err := s.execCompose("", "-f", configFile, "ps", "--format", "{{json .}}", "--no-trunc", "-a")
	if err != nil {
		return []ContainerDTO{}, nil
	}

	var result []ContainerDTO
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		// docker compose ps outputs JSON with various key names
		var raw map[string]interface{}
		if json.Unmarshal([]byte(line), &raw) != nil {
			continue
		}
		dto := ContainerDTO{
			ID:      getString(raw, "ID"),
			Name:    getString(raw, "Name", "Names"),
			Image:   getString(raw, "Image"),
			Command: getString(raw, "Command"),
			State:   getString(raw, "State"),
			Status:  getString(raw, "Status"),
			Ports:   getString(raw, "Ports", "Publishers"),
		}
		if dto.Name != "" {
			dto.Name = strings.TrimPrefix(dto.Name, "/")
		}
		dto.ShortID = dto.ID
		if len(dto.ShortID) > 12 {
			dto.ShortID = dto.ShortID[:12]
		}
		result = append(result, dto)
	}

	if result == nil {
		result = []ContainerDTO{}
	}
	return result, nil
}

// getString extracts a string value from a map, trying multiple keys in order.
func getString(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	return ""
}

// ScanComposeDir scans baseDir for subdirectories containing docker-compose.yml/yaml or compose.yml/yaml.
// It also recurses into the "apps/" subdirectory to discover app-store installed projects.
func (s *DockerService) ScanComposeDir(baseDir string) ([]ComposeProjectDTO, error) {
	var projects []ComposeProjectDTO

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return []ComposeProjectDTO{}, nil
	}

	candidates := []string{"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subDir := filepath.Join(baseDir, entry.Name())
		for _, name := range candidates {
			cp := filepath.Join(subDir, name)
			if _, err := os.Stat(cp); err == nil {
				projects = append(projects, ComposeProjectDTO{
					Name:       entry.Name(),
					Status:     "未启动",
					ConfigFile: cp,
					ProjectDir: subDir,
				})
				break
			}
		}
	}

	if projects == nil {
		projects = []ComposeProjectDTO{}
	}
	return projects, nil
}

// PullProgressFunc is a callback for reporting image pull progress.
// progress is 0.0-1.0, message is a human-readable status string.
type PullProgressFunc func(progress float64, message string)

// PullImage pulls a Docker image using the SDK, reporting progress via the callback.
func (s *DockerService) PullImage(ctx context.Context, imageName string, onProgress PullProgressFunc) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	reader, err := s.cli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()

	type pullEvent struct {
		Status         string `json:"status"`
		ID             string `json:"id"`
		ProgressDetail struct {
			Current int64 `json:"current"`
			Total   int64 `json:"total"`
		} `json:"progressDetail"`
	}

	layers := make(map[string]struct{ current, total int64 })
	decoder := json.NewDecoder(reader)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		var ev pullEvent
		if err := decoder.Decode(&ev); err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		if ev.ID != "" && ev.ProgressDetail.Total > 0 {
			layers[ev.ID] = struct{ current, total int64 }{ev.ProgressDetail.Current, ev.ProgressDetail.Total}
		}

		if onProgress != nil {
			var totalBytes, doneBytes int64
			for _, l := range layers {
				totalBytes += l.total
				doneBytes += l.current
			}
			progress := 0.0
			if totalBytes > 0 {
				progress = float64(doneBytes) / float64(totalBytes)
			}
			msg := ev.Status
			if ev.ID != "" {
				msg = ev.ID + ": " + ev.Status
			}
			onProgress(progress, msg)
		}
	}

	return nil
}

// --- Network operations ---

// NetworkDTO is the typed data contract for a network sent to the frontend.
type NetworkDTO struct {
	ID         string `json:"id"`
	ShortID    string `json:"shortId"`
	Name       string `json:"name"`
	Driver     string `json:"driver"`
	Scope      string `json:"scope"`
	Subnet     string `json:"subnet"`
	Gateway    string `json:"gateway"`
	Containers int    `json:"containers"`
	Internal   bool   `json:"internal"`
	CreatedAt  string `json:"createdAt"`
}

// ListNetworks returns a list of Docker networks as typed DTOs.
func (s *DockerService) ListNetworks() ([]NetworkDTO, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	networks, err := s.cli.NetworkList(context.Background(), network.ListOptions{})
	if err != nil {
		return nil, err
	}
	result := make([]NetworkDTO, 0, len(networks))
	for _, n := range networks {
		shortID := n.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		subnet := ""
		gateway := ""
		if len(n.IPAM.Config) > 0 {
			subnet = n.IPAM.Config[0].Subnet
			gateway = n.IPAM.Config[0].Gateway
		}
		result = append(result, NetworkDTO{
			ID:         n.ID,
			ShortID:    shortID,
			Name:       n.Name,
			Driver:     n.Driver,
			Scope:      n.Scope,
			Subnet:     subnet,
			Gateway:    gateway,
			Containers: len(n.Containers),
			Internal:   n.Internal,
			CreatedAt:  n.Created.Format(time.RFC3339),
		})
	}
	return result, nil
}

// InspectNetwork returns the raw inspect result for a network.
func (s *DockerService) InspectNetwork(id string) (interface{}, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	res, err := s.cli.NetworkInspect(context.Background(), id, network.InspectOptions{})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(res)
	var result interface{}
	json.Unmarshal(raw, &result)
	return result, nil
}

// CreateNetwork creates a new Docker network.
func (s *DockerService) CreateNetwork(name, driver string) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	if driver == "" {
		driver = "bridge"
	}
	_, err := s.cli.NetworkCreate(context.Background(), name, network.CreateOptions{
		Driver: driver,
	})
	return err
}

// RemoveNetwork removes a Docker network by ID.
func (s *DockerService) RemoveNetwork(id string) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	return s.cli.NetworkRemove(context.Background(), id)
}

// --- Volume operations ---

// VolumeDTO is the typed data contract for a volume sent to the frontend.
type VolumeDTO struct {
	Name       string `json:"name"`
	Driver     string `json:"driver"`
	Mountpoint string `json:"mountpoint"`
	Scope      string `json:"scope"`
	CreatedAt  string `json:"createdAt"`
}

// ListVolumes returns a list of Docker volumes as typed DTOs.
func (s *DockerService) ListVolumes() ([]VolumeDTO, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	resp, err := s.cli.VolumeList(context.Background(), volume.ListOptions{})
	if err != nil {
		return nil, err
	}
	result := make([]VolumeDTO, 0, len(resp.Volumes))
	for _, v := range resp.Volumes {
		result = append(result, VolumeDTO{
			Name:       v.Name,
			Driver:     v.Driver,
			Mountpoint: v.Mountpoint,
			Scope:      v.Scope,
			CreatedAt:  v.CreatedAt,
		})
	}
	return result, nil
}

// InspectVolume returns the raw inspect result for a volume.
func (s *DockerService) InspectVolume(name string) (interface{}, error) {
	if err := s.checkAvailable(); err != nil {
		return nil, err
	}
	res, _, err := s.cli.VolumeInspectWithRaw(context.Background(), name)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(res)
	var result interface{}
	json.Unmarshal(raw, &result)
	return result, nil
}

// CreateVolume creates a new Docker volume.
func (s *DockerService) CreateVolume(name, driver string) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	opts := volume.CreateOptions{Name: name}
	if driver != "" {
		opts.Driver = driver
	}
	_, err := s.cli.VolumeCreate(context.Background(), opts)
	return err
}

// RemoveVolume removes a Docker volume by name.
func (s *DockerService) RemoveVolume(name string, force bool) error {
	if err := s.checkAvailable(); err != nil {
		return err
	}
	return s.cli.VolumeRemove(context.Background(), name, force)
}

// MergeComposeProjects merges running compose projects with scanned ones from disk,
// assigning source labels based on installed_apps DB records.
func MergeComposeProjects(running, scanned []ComposeProjectDTO, appstoreDirs map[string]bool) []ComposeProjectDTO {
	assignSource := func(p *ComposeProjectDTO) {
		if p.Source != "" {
			return
		}
		if appstoreDirs[p.ProjectDir] {
			p.Source = "appstore"
		} else {
			p.Source = "local"
		}
	}

	seen := make(map[string]bool)
	for i, p := range running {
		if p.ConfigFile != "" {
			seen[p.ConfigFile] = true
		}
		assignSource(&running[i])
	}
	for _, p := range scanned {
		if p.ConfigFile != "" && !seen[p.ConfigFile] {
			assignSource(&p)
			running = append(running, p)
		}
	}
	return running
}
