package wasm

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
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
	"unicode/utf16"
	"unicode/utf8"

	"webos-backend/internal/auth"
	"webos-backend/internal/storage"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// CapabilityRouter routes all host capability calls from WASM apps.
type CapabilityRouter struct {
	handlers map[string]CapabilityHandler
}

type CapabilityHandler func(appID string, params json.RawMessage) (interface{}, error)

var globalRouter *CapabilityRouter

var capabilityDeps struct {
	chatCommands      func() interface{}
	chatSend          func(conversationID, messageContent, clientID string) interface{}
	chatHistory       func() (interface{}, error)
	chatMessages      func(conversationID string) (interface{}, error)
	chatStatus        func(conversationID string) interface{}
	executorStatus    func() interface{}
	chatDelete        func(conversationID string) error
	chatCleanup       func()
	registerClientCtx func(payload json.RawMessage) (interface{}, error)
	broadcastNotify   func(level, title, message, source, target string)
	shellExec         func(command string) (string, string, int, error)
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
	var p struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	val, err := GetAppConfig(appID, p.Key)
	if err != nil {
		return nil, err
	}
	return map[string]string{"value": val}, nil
}

func configSetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key, Value string }
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := SetAppConfig(appID, p.Key, p.Value); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func kvGetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	val, err := KVGet(appID, p.Key)
	if err != nil {
		return nil, err
	}
	return map[string]string{"value": string(val)}, nil
}

func kvSetCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct{ Key, Value string }
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := KVSet(appID, p.Key, []byte(p.Value)); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func kvDeleteCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := KVDelete(appID, p.Key); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func chatCommandsCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatCommands == nil {
		return nil, fmt.Errorf("chat commands unavailable")
	}
	return capabilityDeps.chatCommands(), nil
}

func chatSendCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatSend == nil {
		return nil, fmt.Errorf("chat send unavailable")
	}
	var p struct {
		ConversationID string `json:"conversationId"`
		MessageContent string `json:"messageContent"`
		ClientID       string `json:"clientId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return capabilityDeps.chatSend(p.ConversationID, p.MessageContent, p.ClientID), nil
}

func chatHistoryCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatHistory == nil {
		return nil, fmt.Errorf("chat history unavailable")
	}
	return capabilityDeps.chatHistory()
}

func chatMessagesCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatMessages == nil {
		return nil, fmt.Errorf("chat messages unavailable")
	}
	var p struct {
		ConversationID string `json:"conversationId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return capabilityDeps.chatMessages(p.ConversationID)
}

func chatStatusCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatStatus == nil {
		return nil, fmt.Errorf("chat status unavailable")
	}
	var p struct {
		ConversationID string `json:"conversationId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return capabilityDeps.chatStatus(p.ConversationID), nil
}

func chatExecutorStatusCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.executorStatus == nil {
		return nil, fmt.Errorf("executor status unavailable")
	}
	return capabilityDeps.executorStatus(), nil
}

func chatDeleteCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatDelete == nil {
		return nil, fmt.Errorf("chat delete unavailable")
	}
	var p struct {
		ConversationID string `json:"conversationId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := capabilityDeps.chatDelete(p.ConversationID); err != nil {
		return nil, err
	}
	return map[string]string{"ok": "deleted"}, nil
}

func chatCleanupCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.chatCleanup == nil {
		return nil, fmt.Errorf("chat cleanup unavailable")
	}
	go capabilityDeps.chatCleanup()
	return map[string]string{"ok": "started"}, nil
}

func registerClientContextCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.registerClientCtx == nil {
		return nil, fmt.Errorf("client context registration unavailable")
	}
	return capabilityDeps.registerClientCtx(params)
}

func fileDownloadSignCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.NodeID == "" || p.Path == "" {
		return nil, fmt.Errorf("nodeId and path are required")
	}
	exp, sign := auth.GenerateDownloadSign(p.NodeID, p.Path, 6*60*60)
	return map[string]interface{}{"nodeId": p.NodeID, "path": p.Path, "exp": exp, "sign": sign}, nil
}

func notifyBroadcastCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.broadcastNotify == nil {
		return nil, fmt.Errorf("notify broadcast unavailable")
	}
	var p struct{ Level, Title, Message, Source, Target string }
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.Message == "" {
		return nil, fmt.Errorf("message is required")
	}
	if p.Level == "" {
		p.Level = "info"
	}
	capabilityDeps.broadcastNotify(p.Level, p.Title, p.Message, p.Source, p.Target)
	return map[string]string{"ok": "broadcast"}, nil
}

func shellExecCapability(appID string, params json.RawMessage) (interface{}, error) {
	if capabilityDeps.shellExec == nil {
		return nil, fmt.Errorf("shell exec unavailable")
	}
	var p struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.Command == "" {
		return nil, fmt.Errorf("command is required")
	}
	stdout, stderr, exitCode, err := capabilityDeps.shellExec(p.Command)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error(), "stdout": stdout, "stderr": stderr, "exitCode": exitCode}, nil
	}
	return map[string]interface{}{"success": exitCode == 0, "stdout": stdout, "stderr": stderr, "exitCode": exitCode}, nil
}

type httpRequestPayload struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    json.RawMessage   `json:"body"`
	SaveTo  string            `json:"saveTo"`
}

type httpRequestBody struct {
	Kind     string                 `json:"kind"`
	Value    map[string]interface{} `json:"value,omitempty"`
	Text     string                 `json:"text,omitempty"`
	Fields   map[string]interface{} `json:"fields,omitempty"`
	Files    []httpRequestFile      `json:"files,omitempty"`
	Path     string                 `json:"path,omitempty"`
	NodeID   string                 `json:"nodeId,omitempty"`
	Encoding string                 `json:"encoding,omitempty"`
}

type httpRequestFile struct {
	Field    string `json:"field"`
	Path     string `json:"path"`
	NodeID   string `json:"nodeId,omitempty"`
	Filename string `json:"filename,omitempty"`
}

func httpRequestCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p httpRequestPayload
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.URL == "" {
		return nil, fmt.Errorf("url is required")
	}
	if p.Method == "" {
		p.Method = "POST"
	}
	requestID := nextRequestID("http")
	go httpRequestWithBody(appID, requestID, p.Method, p.URL, p.Headers, p.Body, p.SaveTo)
	return map[string]interface{}{"ok": true, "requestId": requestID}, nil
}

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
	return map[string]interface{}{"content": string(data), "size": len(data)}, nil
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
	return map[string]interface{}{"success": true, "size": len(p.Content)}, nil
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
	return map[string]interface{}{"entries": entries}, nil
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
	return map[string]interface{}{"success": true}, nil
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
	return map[string]interface{}{"success": true}, nil
}

func processExec(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Command string `json:"command"`
		Timeout int    `json:"timeout"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.Timeout == 0 {
		p.Timeout = 30
	}
	parts := strings.Fields(p.Command)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	cmd := exec.Command(parts[0], parts[1:]...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	select {
	case err := <-done:
		var outStr, errStr string
		if runtime.GOOS == "windows" {
			outStr = decodeWindowsOutput(stdout.Bytes())
			errStr = decodeWindowsOutput(stderr.Bytes())
		} else {
			outStr = stdout.String()
			errStr = stderr.String()
		}
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				return nil, err
			}
		}
		return map[string]interface{}{
			"stdout":   outStr,
			"stderr":   errStr,
			"exitCode": exitCode,
			"success":  exitCode == 0,
		}, nil
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

func decodeWindowsOutput(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	if utf8.Valid(data) {
		return string(data)
	}
	if len(data) >= 2 {
		if bytes.HasPrefix(data, []byte{0xff, 0xfe}) {
			return string(utf16.Decode(bytesToUint16s(data[2:], binary.LittleEndian)))
		}
		if bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
			return string(utf16.Decode(bytesToUint16s(data[2:], binary.BigEndian)))
		}
		if looksLikeUTF16(data, binary.LittleEndian) {
			return string(utf16.Decode(bytesToUint16s(data, binary.LittleEndian)))
		}
		if looksLikeUTF16(data, binary.BigEndian) {
			return string(utf16.Decode(bytesToUint16s(data, binary.BigEndian)))
		}
	}
	if decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes(data); err == nil && utf8.Valid(decoded) {
		return string(decoded)
	}
	return string(bytes.Runes(data))
}

func bytesToUint16s(data []byte, order binary.ByteOrder) []uint16 {
	if len(data) < 2 {
		return nil
	}
	if len(data)%2 != 0 {
		data = data[:len(data)-1]
	}
	words := make([]uint16, 0, len(data)/2)
	for i := 0; i+1 < len(data); i += 2 {
		words = append(words, order.Uint16(data[i:i+2]))
	}
	return words
}

func looksLikeUTF16(data []byte, order binary.ByteOrder) bool {
	if len(data) < 4 || len(data)%2 != 0 {
		return false
	}
	zeros := 0
	asciiish := 0
	for i := 0; i+1 < len(data); i += 2 {
		word := order.Uint16(data[i : i+2])
		if word == 0 {
			zeros++
			continue
		}
		if word >= 0x09 && word <= 0x7f {
			asciiish++
		}
	}
	pairs := len(data) / 2
	return zeros*2 <= pairs && asciiish*2 >= pairs
}

func systemEnv(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		Key string `json:"key"`
	}
	_ = json.Unmarshal(params, &p)
	if p.Key != "" {
		return map[string]interface{}{"key": p.Key, "value": os.Getenv(p.Key)}, nil
	}
	envMap := make(map[string]string)
	for _, e := range os.Environ() {
		pair := strings.SplitN(e, "=", 2)
		if len(pair) == 2 {
			envMap[pair[0]] = pair[1]
		}
	}
	return map[string]interface{}{"env": envMap}, nil
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

func httpRequestWithBody(appID, requestID, method, targetURL string, headers map[string]string, bodyRaw json.RawMessage, saveTo string) {
	pushErr := func(err error) {
		pushHostResponse(appID, "http.request", requestID, false, nil, err)
	}

	var reqBody []byte
	var contentType string
	if len(bodyRaw) > 0 && string(bodyRaw) != "null" {
		var body httpRequestBody
		if err := json.Unmarshal(bodyRaw, &body); err != nil {
			pushErr(fmt.Errorf("invalid body: %w", err))
			return
		}
		var err error
		reqBody, contentType, err = buildHTTPRequestBody(body)
		if err != nil {
			pushErr(err)
			return
		}
	}

	req, err := http.NewRequest(method, targetURL, bytes.NewReader(reqBody))
	if err != nil {
		pushErr(fmt.Errorf("create request failed: %w", err))
		return
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 300 * time.Second}
	if proxyStr, cfgErr := GetAppConfig(appID, "proxy"); cfgErr == nil && proxyStr != "" {
		if u, parseErr := url.Parse(proxyStr); parseErr == nil {
			client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		pushErr(fmt.Errorf("http request failed: %w", err))
		return
	}
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
		if err != nil {
			pushErr(fmt.Errorf("create file failed: %w", err))
			return
		}
		n, err := io.Copy(f, resp.Body)
		f.Close()
		if err != nil {
			os.Remove(saveTo)
			pushErr(fmt.Errorf("write file failed: %w", err))
			return
		}
		pushHostResponse(appID, "http.request", requestID, true, map[string]interface{}{
			"status":  resp.StatusCode,
			"path":    saveTo,
			"size":    n,
			"headers": flattenHTTPHeaders(resp.Header),
		}, nil)
		return
	}

	// Normal mode: return body as string
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		pushErr(err)
		return
	}
	pushHostResponse(appID, "http.request", requestID, true, map[string]interface{}{
		"status":  resp.StatusCode,
		"body":    string(respBody),
		"headers": flattenHTTPHeaders(resp.Header),
	}, nil)
}

func buildHTTPRequestBody(body httpRequestBody) ([]byte, string, error) {
	switch body.Kind {
	case "", "none":
		return nil, "", nil
	case "json":
		reqBody, err := json.Marshal(body.Value)
		if err != nil {
			return nil, "", fmt.Errorf("marshal json body failed: %w", err)
		}
		return reqBody, "application/json", nil
	case "text":
		return []byte(body.Text), "text/plain; charset=utf-8", nil
	case "multipart":
		return buildMultipartBody(body.Fields, body.Files)
	case "file":
		fileData, err := readHTTPRequestFile(body.NodeID, body.Path)
		if err != nil {
			return nil, "", err
		}
		switch strings.ToLower(strings.TrimSpace(body.Encoding)) {
		case "", "binary":
			return fileData, "application/octet-stream", nil
		case "base64":
			return []byte(base64.StdEncoding.EncodeToString(fileData)), "text/plain; charset=utf-8", nil
		default:
			return nil, "", fmt.Errorf("unsupported file encoding: %s", body.Encoding)
		}
	default:
		return nil, "", fmt.Errorf("unsupported body kind: %s", body.Kind)
	}
}

func buildMultipartBody(fields map[string]interface{}, files []httpRequestFile) ([]byte, string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for key, value := range fields {
		switch v := value.(type) {
		case string:
			if err := writer.WriteField(key, v); err != nil {
				return nil, "", fmt.Errorf("write multipart field failed: %w", err)
			}
		case float64:
			if err := writer.WriteField(key, fmt.Sprintf("%.0f", v)); err != nil {
				return nil, "", fmt.Errorf("write multipart field failed: %w", err)
			}
		case bool:
			if err := writer.WriteField(key, fmt.Sprintf("%v", v)); err != nil {
				return nil, "", fmt.Errorf("write multipart field failed: %w", err)
			}
		default:
			raw, err := json.Marshal(v)
			if err != nil {
				return nil, "", fmt.Errorf("marshal multipart field failed: %w", err)
			}
			if err := writer.WriteField(key, string(raw)); err != nil {
				return nil, "", fmt.Errorf("write multipart field failed: %w", err)
			}
		}
	}
	for _, file := range files {
		if file.Field == "" {
			return nil, "", fmt.Errorf("multipart file field is required")
		}
		fileData, err := readHTTPRequestFile(file.NodeID, file.Path)
		if err != nil {
			return nil, "", err
		}
		filename := file.Filename
		if filename == "" {
			filename = filepath.Base(file.Path)
		}
		part, err := writer.CreateFormFile(file.Field, filename)
		if err != nil {
			return nil, "", fmt.Errorf("create multipart file failed: %w", err)
		}
		if _, err := part.Write(fileData); err != nil {
			return nil, "", fmt.Errorf("write multipart file failed: %w", err)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", fmt.Errorf("close multipart writer failed: %w", err)
	}
	return buf.Bytes(), writer.FormDataContentType(), nil
}

func readHTTPRequestFile(nodeID, path string) ([]byte, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("file path is required")
	}
	if nodeID != "" {
		driver, err := storage.GetDriver(nodeID)
		if err != nil {
			return nil, fmt.Errorf("storage node not found: %w", err)
		}
		fileData, err := driver.Read(path)
		if err != nil {
			return nil, fmt.Errorf("read file failed: %w", err)
		}
		return fileData, nil
	}
	if dataDir := os.Getenv("WEBOS_DATA_DIR"); dataDir != "" {
		path = strings.ReplaceAll(path, "${WEBOS_DATA_DIR}", dataDir)
	}
	fileData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read host file failed: %w", err)
	}
	return fileData, nil
}

func flattenHTTPHeaders(header http.Header) map[string]string {
	if len(header) == 0 {
		return map[string]string{}
	}
	out := make(map[string]string, len(header))
	for k, values := range header {
		out[k] = strings.Join(values, ", ")
	}
	return out
}
