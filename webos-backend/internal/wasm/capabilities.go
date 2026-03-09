package wasm

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"webos-backend/internal/auth"
	"webos-backend/internal/storage"
)

// CapabilityRouter routes all host capability calls from WASM apps.
type CapabilityRouter struct {
	handlers map[string]CapabilityHandler
}

type CapabilityHandler func(appID string, params json.RawMessage) (interface{}, error)

var globalRouter *CapabilityRouter

var capabilityDeps struct {
	chatCommands        func() interface{}
	chatSend            func(conversationID, messageContent, clientID string) interface{}
	chatHistory         func() (interface{}, error)
	chatMessages        func(conversationID string) (interface{}, error)
	chatStatus          func(conversationID string) interface{}
	executorStatus      func() interface{}
	chatDelete          func(conversationID string) error
	chatCleanup         func()
	registerClientCtx   func(payload json.RawMessage) (interface{}, error)
	broadcastNotify     func(level, title, message, source, target string)
	shellExec           func(command string) (string, string, int, error)
}

func init() {
	globalRouter = NewCapabilityRouter()
}

func GetRouter() *CapabilityRouter {
	return globalRouter
}

func ConfigureCapabilityDeps(
	chatCommands func() interface{},
	chatSend func(conversationID, messageContent, clientID string) interface{},
	chatHistory func() (interface{}, error),
	chatMessages func(conversationID string) (interface{}, error),
	chatStatus func(conversationID string) interface{},
	executorStatus func() interface{},
	chatDelete func(conversationID string) error,
	chatCleanup func(),
	registerClientCtx func(payload json.RawMessage) (interface{}, error),
	broadcastNotify func(level, title, message, source, target string),
	shellExec func(command string) (string, string, int, error),
) {
	capabilityDeps.chatCommands = chatCommands
	capabilityDeps.chatSend = chatSend
	capabilityDeps.chatHistory = chatHistory
	capabilityDeps.chatMessages = chatMessages
	capabilityDeps.chatStatus = chatStatus
	capabilityDeps.executorStatus = executorStatus
	capabilityDeps.chatDelete = chatDelete
	capabilityDeps.chatCleanup = chatCleanup
	capabilityDeps.registerClientCtx = registerClientCtx
	capabilityDeps.broadcastNotify = broadcastNotify
	capabilityDeps.shellExec = shellExec
}

func NewCapabilityRouter() *CapabilityRouter {
	r := &CapabilityRouter{handlers: make(map[string]CapabilityHandler)}

	r.Register("config.get", configGetCapability)
	r.Register("config.set", configSetCapability)
	r.Register("kv.get", kvGetCapability)
	r.Register("kv.set", kvSetCapability)
	r.Register("kv.delete", kvDeleteCapability)

	r.Register("chat.commands", chatCommandsCapability)
	r.Register("chat.send", chatSendCapability)
	r.Register("chat.history", chatHistoryCapability)
	r.Register("chat.messages", chatMessagesCapability)
	r.Register("chat.status", chatStatusCapability)
	r.Register("chat.executor_status", chatExecutorStatusCapability)
	r.Register("chat.delete", chatDeleteCapability)
	r.Register("chat.cleanup", chatCleanupCapability)

	r.Register("client_context.register", registerClientContextCapability)
	r.Register("file.download_sign", fileDownloadSignCapability)
	r.Register("notify.broadcast", notifyBroadcastCapability)
	r.Register("shell.exec", shellExecCapability)
	r.Register("http.request", httpRequestCapability)
	r.Register("ws.connect", wsConnectCapability)
	r.Register("ws.send", wsSendCapability)
	r.Register("ws.close", wsCloseCapability)

	r.Register("fs.read", fsRead)
	r.Register("fs.write", fsWrite)
	r.Register("fs.list", fsList)
	r.Register("fs.delete", fsDelete)
	r.Register("fs.mkdir", fsMkdir)
	r.Register("process.exec", processExec)
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
	if !r.CheckPermission(appID, method) {
		return nil, fmt.Errorf("permission denied: %s", method)
	}
	return handler(appID, params)
}

func (r *CapabilityRouter) CheckPermission(appID, method string) bool {
	return true
}

func configGetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key string `json:"key"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	val, err := GetAppConfig(appID, p.Key)
	if err != nil { return nil, err }
	return map[string]string{"value": val}, nil
}

func configSetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key, Value string }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if err := SetAppConfig(appID, p.Key, p.Value); err != nil { return nil, err }
	return map[string]bool{"success": true}, nil
}

func kvGetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key string `json:"key"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	val, err := KVGet(appID, p.Key)
	if err != nil { return nil, err }
	return map[string]string{"value": string(val)}, nil
}

func kvSetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key, Value string }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if err := KVSet(appID, p.Key, []byte(p.Value)); err != nil { return nil, err }
	return map[string]bool{"success": true}, nil
}

func kvDeleteCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key string `json:"key"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if err := KVDelete(appID, p.Key); err != nil { return nil, err }
	return map[string]bool{"success": true}, nil
}

func chatCommandsCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatCommands == nil { return nil, fmt.Errorf("chat commands unavailable") }
	return capabilityDeps.chatCommands(), nil
}

func chatSendCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatSend == nil { return nil, fmt.Errorf("chat send unavailable") }
	var p struct { ConversationID string `json:"conversationId"`; MessageContent string `json:"messageContent"`; ClientID string `json:"clientId"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	return capabilityDeps.chatSend(p.ConversationID, p.MessageContent, p.ClientID), nil
}

func chatHistoryCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatHistory == nil { return nil, fmt.Errorf("chat history unavailable") }
	return capabilityDeps.chatHistory()
}

func chatMessagesCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatMessages == nil { return nil, fmt.Errorf("chat messages unavailable") }
	var p struct { ConversationID string `json:"conversationId"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	return capabilityDeps.chatMessages(p.ConversationID)
}

func chatStatusCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatStatus == nil { return nil, fmt.Errorf("chat status unavailable") }
	var p struct { ConversationID string `json:"conversationId"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	return capabilityDeps.chatStatus(p.ConversationID), nil
}

func chatExecutorStatusCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.executorStatus == nil { return nil, fmt.Errorf("executor status unavailable") }
	return capabilityDeps.executorStatus(), nil
}

func chatDeleteCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatDelete == nil { return nil, fmt.Errorf("chat delete unavailable") }
	var p struct { ConversationID string `json:"conversationId"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if err := capabilityDeps.chatDelete(p.ConversationID); err != nil { return nil, err }
	return map[string]string{"ok": "deleted"}, nil
}

func chatCleanupCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatCleanup == nil { return nil, fmt.Errorf("chat cleanup unavailable") }
	go capabilityDeps.chatCleanup()
	return map[string]string{"ok": "started"}, nil
}

func registerClientContextCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.registerClientCtx == nil { return nil, fmt.Errorf("client context registration unavailable") }
	return capabilityDeps.registerClientCtx(params)
}

func fileDownloadSignCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if p.NodeID == "" || p.Path == "" { return nil, fmt.Errorf("nodeId and path are required") }
	exp, sign := auth.GenerateDownloadSign(p.NodeID, p.Path, 6*60*60)
	return map[string]interface{}{"nodeId": p.NodeID, "path": p.Path, "exp": exp, "sign": sign}, nil
}

func notifyBroadcastCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.broadcastNotify == nil { return nil, fmt.Errorf("notify broadcast unavailable") }
	var p struct { Level, Title, Message, Source, Target string }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if p.Message == "" { return nil, fmt.Errorf("message is required") }
	if p.Level == "" { p.Level = "info" }
	capabilityDeps.broadcastNotify(p.Level, p.Title, p.Message, p.Source, p.Target)
	return map[string]string{"ok": "broadcast"}, nil
}

func shellExecCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.shellExec == nil { return nil, fmt.Errorf("shell exec unavailable") }
	var p struct { Command string `json:"command"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if p.Command == "" { return nil, fmt.Errorf("command is required") }
	stdout, stderr, exitCode, err := capabilityDeps.shellExec(p.Command)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error(), "stdout": stdout, "stderr": stderr, "exitCode": exitCode}, nil
	}
	return map[string]interface{}{"success": exitCode == 0, "stdout": stdout, "stderr": stderr, "exitCode": exitCode}, nil
}

func httpRequestCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Method    string                 `json:"method"`
		URL       string                 `json:"url"`
		Headers   map[string]string      `json:"headers"`
		Body      map[string]interface{} `json:"body"`
		Format    string                 `json:"format"`
		FileField string                 `json:"fileField"`
		SaveTo    string                 `json:"saveTo"`
	}
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if p.URL == "" { return nil, fmt.Errorf("url is required") }
	if p.Method == "" { p.Method = "POST" }
	if p.Format == "" { p.Format = "json" }
	requestID := nextRequestID("http")
	go httpRequestWithFiles(appID, requestID, p.Method, p.URL, p.Headers, p.Body, p.Format, p.FileField, p.SaveTo)
	return map[string]interface{}{"ok": true, "requestId": requestID}, nil
}

func fsRead(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil { return nil, err }
	data, err := driver.Read(p.Path)
	if err != nil { return nil, err }
	return map[string]interface{}{"content": string(data), "size": len(data)}, nil
}

func fsWrite(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"`; Content string `json:"content"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil { return nil, err }
	if err := driver.Write(p.Path, []byte(p.Content)); err != nil { return nil, err }
	return map[string]interface{}{"success": true, "size": len(p.Content)}, nil
}

func fsList(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil { return nil, err }
	entries, err := driver.List(p.Path)
	if err != nil { return nil, err }
	return map[string]interface{}{"entries": entries}, nil
}

func fsDelete(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil { return nil, err }
	if err := driver.Delete(p.Path); err != nil { return nil, err }
	return map[string]interface{}{"success": true}, nil
}

func fsMkdir(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { NodeID string `json:"nodeId"`; Path string `json:"path"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil { return nil, err }
	if err := driver.CreateDir(p.Path); err != nil { return nil, err }
	return map[string]interface{}{"success": true}, nil
}

func processExec(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { Command string `json:"command"`; Timeout int `json:"timeout"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	if p.Timeout == 0 { p.Timeout = 30 }
	parts := strings.Fields(p.Command)
	if len(parts) == 0 { return nil, fmt.Errorf("empty command") }
	cmd := exec.Command(parts[0], parts[1:]...)
	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()
	select {
	case err := <-done:
		stdout, _ := cmd.Output()
		stderr := ""
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok { stderr = string(exitErr.Stderr); exitCode = exitErr.ExitCode() } else { return nil, err }
		}
		return map[string]interface{}{"stdout": string(stdout), "stderr": stderr, "exitCode": exitCode, "success": exitCode == 0}, nil
	case <-time.After(time.Duration(p.Timeout) * time.Second):
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("command timeout after %d seconds", p.Timeout)
	}
}

func systemInfo(appID string, params json.RawMessage) (interface{}, error) {
	hostname, _ := os.Hostname()
	wd, _ := os.Getwd()
	return map[string]interface{}{"os": runtime.GOOS, "arch": runtime.GOARCH, "hostname": hostname, "cwd": wd, "goVersion": runtime.Version()}, nil
}

func systemEnv(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { Key string `json:"key"` }
	_ = json.Unmarshal(params, &p)
	if p.Key != "" { return map[string]interface{}{"key": p.Key, "value": os.Getenv(p.Key)}, nil }
	envMap := make(map[string]string)
	for _, e := range os.Environ() { pair := strings.SplitN(e, "=", 2); if len(pair) == 2 { envMap[pair[0]] = pair[1] } }
	return map[string]interface{}{"env": envMap}, nil
}

func systemLog(appID string, params json.RawMessage) (interface{}, error) {
	var p struct { Message string `json:"message"` }
	if err := json.Unmarshal(params, &p); err != nil { return nil, err }
	fmt.Printf("[WASM:%s] %s\n", appID, p.Message)
	return map[string]bool{"success": true}, nil
}

func httpRequestWithFiles(appID, requestID, method, targetURL string, headers map[string]string, body map[string]interface{}, format, fileField, saveTo string) {
	pushErr := func(err error) {
		pushHostResponse(appID, "http.request", requestID, false, nil, err)
	}

	// Remove __save_path from headers if present (legacy compat)
	delete(headers, "__save_path")

	type fileMarker struct { key, nodeID, filePath string }
	var fileMarkers []fileMarker
	for key, value := range body {
		if str, ok := value.(string); ok && strings.HasPrefix(str, "[file:") && strings.HasSuffix(str, "]") {
			inner := str[6 : len(str)-1]
			fileParts := strings.SplitN(inner, ":", 2)
			if len(fileParts) == 2 {
				fileMarkers = append(fileMarkers, fileMarker{key: key, nodeID: fileParts[0], filePath: fileParts[1]})
			}
		}
	}

	var reqBody []byte
	var contentType string
	if format == "multipart" {
		if len(fileMarkers) == 0 { pushErr(fmt.Errorf("multipart format requires at least one [file:nodeId:path] marker")); return }
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for key, value := range body {
			if str, ok := value.(string); ok {
				if strings.HasPrefix(str, "[file:") { continue }
				_ = writer.WriteField(key, str)
			} else if num, ok := value.(float64); ok {
				_ = writer.WriteField(key, fmt.Sprintf("%.0f", num))
			} else if bl, ok := value.(bool); ok {
				_ = writer.WriteField(key, fmt.Sprintf("%v", bl))
			}
		}
		for _, marker := range fileMarkers {
			driver, err := storage.GetDriver(marker.nodeID)
			if err != nil { pushErr(fmt.Errorf("storage node not found: %w", err)); return }
			fileData, err := driver.Read(marker.filePath)
			if err != nil { pushErr(fmt.Errorf("read file failed: %w", err)); return }
			fieldName := fileField
			if fieldName == "" { fieldName = marker.key }
			part, err := writer.CreateFormFile(fieldName, filepath.Base(marker.filePath))
			if err != nil { pushErr(fmt.Errorf("create form file failed: %w", err)); return }
			if _, err := part.Write(fileData); err != nil { pushErr(fmt.Errorf("write file data failed: %w", err)); return }
		}
		_ = writer.Close()
		reqBody = buf.Bytes()
		contentType = writer.FormDataContentType()
	} else if len(body) > 0 || len(fileMarkers) > 0 {
		for _, marker := range fileMarkers {
			driver, err := storage.GetDriver(marker.nodeID)
			if err != nil { pushErr(fmt.Errorf("storage node not found: %w", err)); return }
			fileData, err := driver.Read(marker.filePath)
			if err != nil { pushErr(fmt.Errorf("read file failed: %w", err)); return }
			body[marker.key] = base64.StdEncoding.EncodeToString(fileData)
		}
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil { pushErr(fmt.Errorf("marshal body failed: %w", err)); return }
		contentType = "application/json"
	}

	req, err := http.NewRequest(method, targetURL, bytes.NewReader(reqBody))
	if err != nil { pushErr(fmt.Errorf("create request failed: %w", err)); return }
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, v := range headers { req.Header.Set(k, v) }
	client := &http.Client{Timeout: 300 * time.Second}
	if proxyStr, cfgErr := GetAppConfig(appID, "proxy"); cfgErr == nil && proxyStr != "" {
		if u, parseErr := url.Parse(proxyStr); parseErr == nil {
			client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
		}
	}
	resp, err := client.Do(req)
	if err != nil { pushErr(fmt.Errorf("http request failed: %w", err)); return }
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		pushErr(fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody)))
		return
	}

	// saveTo mode: stream response body to file
	if saveTo != "" {
		// Expand ${WEBOS_DATA_DIR} placeholder
		if dataDir := os.Getenv("WEBOS_DATA_DIR"); dataDir != "" {
			saveTo = strings.ReplaceAll(saveTo, "${WEBOS_DATA_DIR}", dataDir)
		}
		// Ensure parent directory exists
		if err := os.MkdirAll(filepath.Dir(saveTo), 0755); err != nil {
			pushErr(fmt.Errorf("mkdir failed: %w", err))
			return
		}
		f, err := os.Create(saveTo)
		if err != nil { pushErr(fmt.Errorf("create file failed: %w", err)); return }
		n, err := io.Copy(f, resp.Body)
		f.Close()
		if err != nil {
			os.Remove(saveTo)
			pushErr(fmt.Errorf("write file failed: %w", err))
			return
		}
		pushHostResponse(appID, "http.request", requestID, true, map[string]interface{}{
			"path": saveTo,
			"size": n,
		}, nil)
		return
	}

	// Normal mode: return body as string
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil { pushErr(err); return }
	pushHostResponse(appID, "http.request", requestID, true, map[string]interface{}{"status": resp.StatusCode, "body": string(respBody)}, nil)
}
