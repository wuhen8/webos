package wasm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"webos-backend/internal/config"
	"webos-backend/internal/database"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// httpRequestCounter 全局自增 ID，用于异步 HTTP 请求
var httpRequestCounter atomic.Uint64

// envCache 缓存常用环境变量，启动时初始化一次
var envCache = map[string]string{
	"WEBOS_DATA_DIR": config.DataDir(),
	"HOME":           config.UserHome(),
}

// expandEnvVars 替换字符串中的 ${XXX} 占位符
func expandEnvVars(s string) string {
	return os.Expand(s, func(key string) string {
		return envCache[key]
	})
}

// RequestBridge is set by the handler package to let wasm apps call any
// registered handler. Protocol-agnostic — same capabilities as frontend SDK.
var RequestBridge struct {
	mu      sync.RWMutex
	Request func(msgType string, payload json.RawMessage) ([]byte, error)
}

// SyncHandlers holds synchronous request handlers that return data immediately.
// Used for query-type requests (e.g. listing commands) that need sync responses.
var SyncHandlers struct {
	mu       sync.RWMutex
	handlers map[string]func(payload json.RawMessage) ([]byte, error)
}

// RegisterSyncHandler registers a synchronous handler for a given message type.
func RegisterSyncHandler(msgType string, fn func(payload json.RawMessage) ([]byte, error)) {
	SyncHandlers.mu.Lock()
	defer SyncHandlers.mu.Unlock()
	if SyncHandlers.handlers == nil {
		SyncHandlers.handlers = make(map[string]func(payload json.RawMessage) ([]byte, error))
	}
	SyncHandlers.handlers[msgType] = fn
}

// SetRequestBridge configures the request bridge function.
func SetRequestBridge(fn func(string, json.RawMessage) ([]byte, error)) {
	RequestBridge.mu.Lock()
	RequestBridge.Request = fn
	RequestBridge.mu.Unlock()
}

// registerHostModule creates the "webos" host module with all syscalls.
// 全局只注册一次。每个 host function 通过 m.Name() 获取调用者 appID（类似 PID）。
func registerHostModule(ctx context.Context, engine wazero.Runtime) error {
	builder := engine.NewHostModuleBuilder("webos")

	builder.NewFunctionBuilder().WithFunc(hostHTTPRequest).Export("http_request")
	builder.NewFunctionBuilder().WithFunc(hostRequest).Export("request")
	builder.NewFunctionBuilder().WithFunc(hostWSConnect).Export("ws_connect")
	builder.NewFunctionBuilder().WithFunc(hostWSSend).Export("ws_send")
	builder.NewFunctionBuilder().WithFunc(hostWSClose).Export("ws_close")

	_, err := builder.Instantiate(ctx)
	return err
}

// ==================== Memory helpers ====================

func readWasmString(m api.Module, ptr, length uint32) (string, bool) {
	if length == 0 {
		return "", true
	}
	b, ok := m.Memory().Read(ptr, length)
	if !ok {
		return "", false
	}
	return string(b), true
}

// sharedBufCache 缓存每个模块的 shared buffer 地址（_initialize 后获取一次）
var sharedBufCache sync.Map // moduleName → sharedBufInfo

type sharedBufInfo struct {
	ptr uint32
	cap uint32
}

// InitSharedBuf 在 _initialize 完成后调用，缓存 wasm 导出的 shared buffer 地址。
func InitSharedBuf(m api.Module) {
	if sbFn := m.ExportedFunction("get_shared_buf"); sbFn != nil {
		results, err := sbFn.Call(context.Background())
		if err == nil && len(results) > 0 && results[0] != 0 {
			info := sharedBufInfo{
				ptr: uint32(results[0] >> 32),
				cap: uint32(results[0] & 0xFFFFFFFF),
			}
			if info.ptr != 0 && info.cap > 0 {
				sharedBufCache.Store(m.Name(), info)
				log.Printf("[WASM:%s] shared buffer: ptr=0x%x cap=%d", m.Name(), info.ptr, info.cap)
			}
		}
	}
}

func writeToWasm(m api.Module, data []byte) uint64 {
	if len(data) == 0 {
		return 0
	}
	needed := uint32(len(data))

	// 用缓存的 shared buffer 地址
	if v, ok := sharedBufCache.Load(m.Name()); ok {
		info := v.(sharedBufInfo)
		if needed <= info.cap {
			if m.Memory().Write(info.ptr, data) {
				// 返回 0<<32 | length — wasm 侧通过 readSharedBuf 读取
				return uint64(needed)
			}
		}
	}

	// _initialize 阶段 shared buffer 还没缓存，直接返回 0（数据丢失）
	// 这种情况下 wasm 侧 configGet 等会返回空字符串
	log.Printf("[WASM:%s] writeToWasm: no shared buffer, data dropped (%d bytes)", m.Name(), needed)
	return 0
}

// ==================== Host functions (syscalls) ====================
// 所有 host function 通过 m.Name() 获取调用者 appID，类似内核通过 PID 鉴权。

func hostLog(ctx context.Context, m api.Module, msgPtr, msgLen uint32) {
	appID := m.Name()
	msg, ok := readWasmString(m, msgPtr, msgLen)
	if ok {
		fmt.Printf("[WASM:%s] %s\n", appID, msg)
	}
}

func hostConfigGet(ctx context.Context, m api.Module, keyPtr, keyLen uint32) uint64 {
	appID := m.Name()
	key, ok := readWasmString(m, keyPtr, keyLen)
	if !ok {
		return 0
	}
	val, err := GetAppConfig(appID, key)
	if err != nil {
		return 0
	}
	return writeToWasm(m, []byte(val))
}

func hostConfigSet(ctx context.Context, m api.Module, keyPtr, keyLen, valPtr, valLen uint32) uint32 {
	appID := m.Name()
	key, ok := readWasmString(m, keyPtr, keyLen)
	if !ok {
		return 1
	}
	val, ok := readWasmString(m, valPtr, valLen)
	if !ok {
		return 1
	}
	if err := SetAppConfig(appID, key, val); err != nil {
		log.Printf("[WASM:%s] config_set error: %v", appID, err)
		return 1
	}
	return 0
}

func hostKVGet(ctx context.Context, m api.Module, keyPtr, keyLen uint32) uint64 {
	appID := m.Name()
	key, ok := readWasmString(m, keyPtr, keyLen)
	if !ok {
		return 0
	}
	val, err := kvGet(appID, key)
	if err != nil {
		return 0
	}
	return writeToWasm(m, val)
}

func hostKVSet(ctx context.Context, m api.Module, keyPtr, keyLen, valPtr, valLen uint32) uint32 {
	appID := m.Name()
	key, ok := readWasmString(m, keyPtr, keyLen)
	if !ok {
		return 1
	}
	val, ok := m.Memory().Read(valPtr, valLen)
	if !ok {
		return 1
	}
	if err := kvSet(appID, key, val); err != nil {
		return 1
	}
	return 0
}

func hostKVDelete(ctx context.Context, m api.Module, keyPtr, keyLen uint32) uint32 {
	appID := m.Name()
	key, ok := readWasmString(m, keyPtr, keyLen)
	if !ok {
		return 1
	}
	if err := kvDelete(appID, key); err != nil {
		return 1
	}
	return 0
}

func hostHTTPRequest(ctx context.Context, m api.Module, methodPtr, methodLen, urlPtr, urlLen, bodyPtr, bodyLen, headersPtr, headersLen uint32) uint64 {
	appID := m.Name()
	method, _ := readWasmString(m, methodPtr, methodLen)
	rawURL, _ := readWasmString(m, urlPtr, urlLen)
	body, _ := m.Memory().Read(bodyPtr, bodyLen)
	headersStr, _ := readWasmString(m, headersPtr, headersLen)

	if method == "" {
		method = "GET"
	}

	// 生成 requestID，立即返回给 WASM
	reqID := fmt.Sprintf("req_%d", httpRequestCounter.Add(1))

	// 拷贝 body（内存引用在 goroutine 里可能失效）
	bodyCopy := make([]byte, len(body))
	copy(bodyCopy, body)

	// 异步执行 HTTP 请求
	go func() {
		// 解析 headers，提取 __save_path 元字段
		var savePath string
		var headers map[string]string
		if headersStr != "" {
			if err := json.Unmarshal([]byte(headersStr), &headers); err == nil {
				if sp, ok := headers["__save_path"]; ok {
					savePath = expandEnvVars(sp)
					delete(headers, "__save_path")
				}
			}
		}

		var bodyReader io.Reader
		if len(bodyCopy) > 0 {
			bodyReader = strings.NewReader(string(bodyCopy))
		}

		req, err := http.NewRequest(method, rawURL, bodyReader)
		if err != nil {
			pushHTTPResponse(appID, reqID, `{"error":"`+err.Error()+`"}`)
			return
		}
		if headers != nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}

		client := &http.Client{Timeout: 10 * time.Second}

		// 按 app 粒度读取代理配置
		if proxyURL, err := GetAppConfig(appID, "proxy"); err == nil && proxyURL != "" {
			if u, err := url.Parse(proxyURL); err == nil {
				client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
			}
		}

		resp, err := client.Do(req)
		if err != nil {
			pushHTTPResponse(appID, reqID, `{"error":"`+err.Error()+`"}`)
			return
		}
		defer resp.Body.Close()
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
		if err != nil {
			pushHTTPResponse(appID, reqID, `{"error":"`+err.Error()+`"}`)
			return
		}

		// 如果有 savePath，保存文件
		if savePath != "" {
			if err := os.MkdirAll(filepath.Dir(savePath), 0755); err != nil {
				pushHTTPResponse(appID, reqID, `{"error":"`+err.Error()+`"}`)
				return
			}
			if err := os.WriteFile(savePath, respBody, 0644); err != nil {
				pushHTTPResponse(appID, reqID, `{"error":"`+err.Error()+`"}`)
				return
			}
			pushHTTPResponse(appID, reqID, fmt.Sprintf(`{"path":"%s","size":%d}`, savePath, len(respBody)))
		} else {
			pushHTTPResponse(appID, reqID, string(respBody))
		}
	}()

	// 返回 requestID 给 WASM
	return writeToWasm(m, []byte(reqID))
}

// pushHTTPResponse 把异步 HTTP 结果通过 PushEvent 推给 WASM
func pushHTTPResponse(appID, reqID, body string) {
	evt, _ := json.Marshal(map[string]interface{}{
		"type": "http_response",
		"data": map[string]string{
			"requestId": reqID,
			"body":      body,
		},
	})
	GetRuntime().PushEvent(appID, evt)
}

func hostRequest(ctx context.Context, m api.Module, typePtr, typeLen, payloadPtr, payloadLen uint32) uint64 {
	appID := m.Name()
	msgType, _ := readWasmString(m, typePtr, typeLen)
	if msgType == "" {
		return writeToWasm(m, []byte(`{"error":"empty message type"}`))
	}

	var payload json.RawMessage
	if payloadLen > 0 {
		raw, ok := m.Memory().Read(payloadPtr, payloadLen)
		if ok {
			payload = json.RawMessage(raw)
		}
	}
	if payload == nil {
		payload = json.RawMessage("{}")
	}

	// Handle host_call - unified capability interface
	if msgType == "host_call" {
		return handleHostCall(m, appID, payload)
	}

	// Check sync handlers first (query-type requests that return data immediately)
	SyncHandlers.mu.RLock()
	syncFn := SyncHandlers.handlers[msgType]
	SyncHandlers.mu.RUnlock()
	if syncFn != nil {
		resp, err := syncFn(payload)
		if err != nil {
			errJSON, _ := json.Marshal(map[string]string{"error": err.Error()})
			return writeToWasm(m, errJSON)
		}
		return writeToWasm(m, resp)
	}

	// Fall back to async request bridge
	RequestBridge.mu.RLock()
	reqFn := RequestBridge.Request
	RequestBridge.mu.RUnlock()

	if reqFn == nil {
		return writeToWasm(m, []byte(`{"error":"request bridge not available"}`))
	}

	resp, err := reqFn(msgType, payload)
	if err != nil {
		errJSON, _ := json.Marshal(map[string]string{"error": err.Error()})
		return writeToWasm(m, errJSON)
	}
	_ = appID // appID available for future permission checks
	return writeToWasm(m, resp)
}

// handleHostCall processes unified capability calls
func handleHostCall(m api.Module, appID string, payload json.RawMessage) uint64 {
	var call struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal(payload, &call); err != nil {
		errJSON, _ := json.Marshal(map[string]string{"error": "invalid call format"})
		return writeToWasm(m, errJSON)
	}

	reqID := fmt.Sprintf("hc_%d", httpRequestCounter.Add(1))

	// Execute async
	go func() {
		router := GetRouter()
		data, err := router.Execute(appID, call.Method, call.Params)

		var resp map[string]interface{}
		if err != nil {
			resp = map[string]interface{}{
				"requestId": reqID,
				"success":   false,
				"error":     err.Error(),
			}
		} else {
			resp = map[string]interface{}{
				"requestId": reqID,
				"success":   true,
				"data":      data,
			}
		}

		evt, _ := json.Marshal(map[string]interface{}{
			"type": "host_response",
			"data": resp,
		})
		GetRuntime().PushEvent(appID, evt)
	}()

	// Return requestId immediately
	result, _ := json.Marshal(map[string]string{"requestId": reqID})
	return writeToWasm(m, result)
}

// ==================== KV storage ====================

func KVGet(appID, key string) ([]byte, error) {
	return kvGet(appID, key)
}

func KVSet(appID, key string, val []byte) error {
	return kvSet(appID, key, val)
}

func KVDelete(appID, key string) error {
	return kvDelete(appID, key)
}

func kvGet(appID, key string) ([]byte, error) {
	db := database.DB()
	var val []byte
	err := db.QueryRow("SELECT value FROM wasm_kv WHERE app_id = ? AND key = ?", appID, key).Scan(&val)
	if err != nil {
		return nil, err
	}
	return val, nil
}

func kvSet(appID, key string, val []byte) error {
	db := database.DB()
	_, err := db.Exec(`INSERT INTO wasm_kv (app_id, key, value, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		appID, key, val, time.Now().Unix())
	return err
}

func kvDelete(appID, key string) error {
	db := database.DB()
	_, err := db.Exec("DELETE FROM wasm_kv WHERE app_id = ? AND key = ?", appID, key)
	return err
}

// GetAppConfig reads a config value for a WASM app from the database.
func GetAppConfig(appID, key string) (string, error) {
	db := database.DB()
	var configJSON string
	err := db.QueryRow("SELECT config FROM installed_apps WHERE id = ?", appID).Scan(&configJSON)
	if err != nil {
		return "", err
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return "", err
	}
	val, ok := cfg[key]
	if !ok {
		return "", fmt.Errorf("config key %s not found", key)
	}
	return fmt.Sprintf("%v", val), nil
}

// SetAppConfig updates a single key in the app's config JSON (installed_apps.config).
func SetAppConfig(appID, key, val string) error {
	db := database.DB()
	var configJSON string
	err := db.QueryRow("SELECT config FROM installed_apps WHERE id = ?", appID).Scan(&configJSON)
	if err != nil {
		return err
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return err
	}
	cfg[key] = val
	newJSON, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = db.Exec("UPDATE installed_apps SET config = ? WHERE id = ?", string(newJSON), appID)
	return err
}
