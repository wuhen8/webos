package handler

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"webos-backend/internal/service"

	"gopkg.in/yaml.v3"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"docker_compose_ps":          handleDockerComposePs,
		"docker_container_logs":      handleDockerContainerLogs,
		"docker_compose_logs":        handleDockerComposeLogs,
		"docker_compose_create":      handleDockerComposeCreate,
		"docker_pull":                handleDockerPull,
		"docker_logs_subscribe":      handleDockerLogsSubscribe,
		"docker_logs_unsubscribe":    handleDockerLogsUnsubscribe,
		"docker_network_inspect":     handleDockerNetworkInspect,
		"docker_network_create":      handleDockerNetworkCreate,
		"docker_network_remove":      handleDockerNetworkRemove,
		"docker_volume_inspect":      handleDockerVolumeInspect,
		"docker_volume_create":       handleDockerVolumeCreate,
		"docker_volume_remove":       handleDockerVolumeRemove,
	})
}

func handleDockerComposePs(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConfigFile string `json:"configFile"`
	}
	json.Unmarshal(raw, &p)
	if p.ConfigFile == "" {
		c.ReplyErr("docker_compose_ps", p.ReqID, errRequired("configFile"))
		return
	}
	go func() {
		containers, err := dockerSvc.GetComposeContainers(p.ConfigFile)
		c.ReplyResult("docker_compose_ps", p.ReqID, containers, err)
	}()
}

func handleDockerContainerLogs(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
		Tail string `json:"tail"`
	}
	json.Unmarshal(raw, &p)
	if p.Data == "" {
		c.ReplyErr("docker_container_logs", p.ReqID, errRequired("container id"))
		return
	}
	tail := p.Tail
	if tail == "" {
		tail = "200"
	}
	go func() {
		logs, err := dockerSvc.GetContainerLogs(p.Data, tail)
		if err != nil {
			c.ReplyErr("docker_container_logs", p.ReqID, err)
		} else {
			c.Reply("docker_container_logs", p.ReqID, map[string]string{"logs": logs})
		}
	}()
}

func handleDockerComposeLogs(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ProjectDir string `json:"projectDir"`
		Tail       string `json:"tail"`
	}
	json.Unmarshal(raw, &p)
	if p.ProjectDir == "" {
		c.ReplyErr("docker_compose_logs", p.ReqID, errRequired("projectDir"))
		return
	}
	tail := p.Tail
	if tail == "" {
		tail = "100"
	}
	go func() {
		logs, err := dockerSvc.GetComposeLogs(p.ProjectDir, tail)
		if err != nil {
			c.ReplyErr("docker_compose_logs", p.ReqID, err)
		} else {
			c.Reply("docker_compose_logs", p.ReqID, map[string]string{"logs": logs})
		}
	}()
}

func handleDockerComposeCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ProjectDir  string `json:"projectDir"`
		YamlContent string `json:"yamlContent"`
		AutoUp      bool   `json:"autoUp"`
	}
	json.Unmarshal(raw, &p)
	if p.ProjectDir == "" || p.YamlContent == "" {
		c.ReplyErr("docker_compose_create", p.ReqID, errRequired("projectDir 和 yamlContent"))
		return
	}
	if !filepath.IsAbs(p.ProjectDir) {
		c.WriteJSON(wsServerMsg{Type: "docker_compose_create", ReqID: p.ReqID, Message: "projectDir 必须是绝对路径"})
		return
	}
	go func() {
		var yamlCheck interface{}
		if err := yaml.Unmarshal([]byte(p.YamlContent), &yamlCheck); err != nil {
			c.WriteJSON(wsServerMsg{Type: "docker_compose_create", ReqID: p.ReqID, Message: "YAML 格式无效: " + err.Error()})
			return
		}
		if err := os.MkdirAll(p.ProjectDir, 0755); err != nil {
			c.WriteJSON(wsServerMsg{Type: "docker_compose_create", ReqID: p.ReqID, Message: "创建目录失败: " + err.Error()})
			return
		}
		composePath := filepath.Join(p.ProjectDir, "docker-compose.yml")
		if err := os.WriteFile(composePath, []byte(p.YamlContent), 0644); err != nil {
			c.WriteJSON(wsServerMsg{Type: "docker_compose_create", ReqID: p.ReqID, Message: "写入文件失败: " + err.Error()})
			return
		}
		if p.AutoUp {
			projectDir := p.ProjectDir
			service.GetTaskManager().Submit("docker_compose_up", "启动 "+filepath.Base(projectDir), func(ctx context.Context, r *service.ProgressReporter) (string, error) {
				return dockerSvc.ComposeAction(projectDir, "up")
			})
		}
		c.Reply("docker_compose_create", p.ReqID, map[string]string{"composePath": composePath})
	}()
}

func handleDockerPull(c *WSConn, raw json.RawMessage) {
	var p struct {
		Name string `json:"name"`
	}
	json.Unmarshal(raw, &p)
	if p.Name != "" {
		imageName := p.Name
		service.GetTaskManager().Submit("docker_pull", "拉取 "+imageName, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
			if err := dockerSvc.PullImage(ctx, imageName, func(progress float64, message string) {
				r.Report(progress, 0, 0, 0, 0, message)
			}); err != nil {
				return "", err
			}
			return "镜像 " + imageName + " 拉取成功", nil
		})
	}
}

func handleDockerLogsSubscribe(c *WSConn, raw json.RawMessage) {
	var p struct {
		Data string `json:"data"`
		Tail string `json:"tail"`
	}
	json.Unmarshal(raw, &p)

	containerID := p.Data
	if containerID == "" {
		return
	}

	c.LogSubMu.Lock()
	if c.LogSubDone != nil {
		close(c.LogSubDone)
	}
	subDone := make(chan struct{})
	c.LogSubDone = subDone
	c.LogSubMu.Unlock()

	tail := p.Tail
	if tail == "" {
		tail = "200"
	}

	go func() {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		// Cancel streaming when unsubscribe or connection close
		go func() {
			select {
			case <-subDone:
				cancel()
			case <-c.Done:
				cancel()
			}
		}()

		err := dockerSvc.StreamContainerLogs(ctx, containerID, tail, func(chunk string) {
			c.WriteJSON(wsServerMsg{Type: "docker_logs", Data: map[string]string{"containerId": containerID, "logs": chunk}})
		})
		if err != nil && ctx.Err() == nil {
			c.WriteJSON(wsServerMsg{Type: "docker_logs", Data: map[string]string{"containerId": containerID, "logs": "获取日志失败: " + err.Error()}})
		}
	}()
}

func handleDockerLogsUnsubscribe(c *WSConn, raw json.RawMessage) {
	c.LogSubMu.Lock()
	if c.LogSubDone != nil {
		close(c.LogSubDone)
		c.LogSubDone = nil
	}
	c.LogSubMu.Unlock()
}

// --- Network handlers ---

func handleDockerNetworkInspect(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data == "" {
		c.ReplyErr("docker_network_inspect", p.ReqID, errRequired("network id"))
		return
	}
	go func() {
		data, err := dockerSvc.InspectNetwork(p.Data)
		c.ReplyResult("docker_network_inspect", p.ReqID, data, err)
	}()
}

func handleDockerNetworkCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Name   string `json:"name"`
		Driver string `json:"driver"`
	}
	json.Unmarshal(raw, &p)
	if p.Name == "" {
		c.ReplyErr("docker_network_create", p.ReqID, errRequired("name"))
		return
	}
	go func() {
		err := dockerSvc.CreateNetwork(p.Name, p.Driver)
		if err != nil {
			c.ReplyErr("docker_network_create", p.ReqID, err)
		} else {
			c.Reply("docker_network_create", p.ReqID, map[string]string{"status": "ok"})
		}
	}()
}

func handleDockerNetworkRemove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data == "" {
		c.ReplyErr("docker_network_remove", p.ReqID, errRequired("network id"))
		return
	}
	go func() {
		err := dockerSvc.RemoveNetwork(p.Data)
		if err != nil {
			c.ReplyErr("docker_network_remove", p.ReqID, err)
		} else {
			c.Reply("docker_network_remove", p.ReqID, map[string]string{"status": "ok"})
		}
	}()
}

// --- Volume handlers ---

func handleDockerVolumeInspect(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)
	if p.Data == "" {
		c.ReplyErr("docker_volume_inspect", p.ReqID, errRequired("volume name"))
		return
	}
	go func() {
		data, err := dockerSvc.InspectVolume(p.Data)
		c.ReplyResult("docker_volume_inspect", p.ReqID, data, err)
	}()
}

func handleDockerVolumeCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Name   string `json:"name"`
		Driver string `json:"driver"`
	}
	json.Unmarshal(raw, &p)
	if p.Name == "" {
		c.ReplyErr("docker_volume_create", p.ReqID, errRequired("name"))
		return
	}
	go func() {
		err := dockerSvc.CreateVolume(p.Name, p.Driver)
		if err != nil {
			c.ReplyErr("docker_volume_create", p.ReqID, err)
		} else {
			c.Reply("docker_volume_create", p.ReqID, map[string]string{"status": "ok"})
		}
	}()
}

func handleDockerVolumeRemove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Data  string `json:"data"`
		Force bool   `json:"force"`
	}
	json.Unmarshal(raw, &p)
	if p.Data == "" {
		c.ReplyErr("docker_volume_remove", p.ReqID, errRequired("volume name"))
		return
	}
	go func() {
		err := dockerSvc.RemoveVolume(p.Data, p.Force)
		if err != nil {
			c.ReplyErr("docker_volume_remove", p.ReqID, err)
		} else {
			c.Reply("docker_volume_remove", p.ReqID, map[string]string{"status": "ok"})
		}
	}()
}
