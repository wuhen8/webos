package wasm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"webos-backend/internal/database"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

var requestCounter atomic.Uint64

// registerHostModule creates the "webos" host module with the unified syscall.
// 全局只注册一次。每个 host function 通过 m.Name() 获取调用者 appID（类似 PID）。
func registerHostModule(ctx context.Context, engine wazero.Runtime) error {
	builder := engine.NewHostModuleBuilder("webos")
	builder.NewFunctionBuilder().WithFunc(hostRequest).Export("request")
	_, err := builder.Instantiate(ctx)
	return err
}

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
	if v, ok := sharedBufCache.Load(m.Name()); ok {
		info := v.(sharedBufInfo)
		if needed <= info.cap {
			if m.Memory().Write(info.ptr, data) {
				return uint64(needed)
			}
		}
	}
	log.Printf("[WASM:%s] writeToWasm: no shared buffer, data dropped (%d bytes)", m.Name(), needed)
	return 0
}

func hostRequest(ctx context.Context, m api.Module, typePtr, typeLen, payloadPtr, payloadLen uint32) uint64 {
	appID := m.Name()
	method, _ := readWasmString(m, typePtr, typeLen)
	if method == "" {
		return writeToWasm(m, []byte(`{"jsonrpc":"2.0","error":{"code":-32600,"message":"empty method"},"id":null}`))
	}

	var payload json.RawMessage
	if payloadLen > 0 {
		raw, ok := m.Memory().Read(payloadPtr, payloadLen)
		if ok {
			payload = append(json.RawMessage(nil), raw...)
		}
	}
	if payload == nil {
		payload = json.RawMessage("{}")
	}

	resp, err := GetRouter().Execute(appID, method, payload)
	if err != nil {
		errResp, _ := json.Marshal(map[string]interface{}{
			"jsonrpc": "2.0",
			"error":   map[string]interface{}{"code": -32000, "message": err.Error()},
			"id":      nil,
		})
		return writeToWasm(m, errResp)
	}

	if resp == nil {
		resp = map[string]bool{"ok": true}
	}
	respBytes, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"result":  resp,
		"id":      nil,
	})
	return writeToWasm(m, respBytes)
}

func nextRequestID(prefix string) string {
	if prefix == "" {
		prefix = "req"
	}
	return fmt.Sprintf("%s_%d", prefix, requestCounter.Add(1))
}

func pushHostResponse(appID, method, requestID string, success bool, data interface{}, err error) {
	// Push as JSON-RPC 2.0 notification with the async result
	payload := map[string]interface{}{
		"method":    method,
		"requestId": requestID,
		"success":   success,
	}
	if err != nil {
		payload["error"] = err.Error()
	}
	if data != nil {
		payload["data"] = data
	}
	evt, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "host.response",
		"params":  payload,
	})
	GetRuntime().PushEvent(appID, evt)
}

func pushHostEvent(appID, method string, data interface{}) {
	evt, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "host.event",
		"params": map[string]interface{}{
			"method": method,
			"data":   data,
		},
	})
	GetRuntime().PushEvent(appID, evt)
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
