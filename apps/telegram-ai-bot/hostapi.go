package main

import (
	"encoding/json"
	"unsafe"
)

const currentAppID = "telegram-ai-bot"

// ==================== Host function imports ====================

//go:wasmimport webos http_request
func _hostHTTPRequest(methodPtr, methodLen, urlPtr, urlLen, bodyPtr, bodyLen, headersPtr, headersLen uint32) uint64

//go:wasmimport webos request
func _hostRequest(typePtr, typeLen, payloadPtr, payloadLen uint32) uint64

// ==================== Shared buffer for host→wasm data ====================

// 1MB 固定 buffer，host 侧通过 get_shared_buf 获取地址后写入数据
var _sharedBuf [1 << 20]byte

//go:wasmexport get_shared_buf
func get_shared_buf() uint64 {
	ptr := uint32(uintptr(unsafe.Pointer(&_sharedBuf[0])))
	return uint64(ptr)<<32 | uint64(len(_sharedBuf))
}

// ==================== 异步 HTTP 回调注册 ====================

// httpCallback 存储待回调的异步 HTTP 请求
var httpCallbacks = map[string]func(resp string){}

// Async response callbacks for host_call
var hostCallbacks = map[string]func(success bool, data interface{}, err string){}

// httpRequestAsync 发起异步 HTTP 请求，结果通过 on_event(http_response) 回调
func httpRequestAsync(method, url, body, headers string, cb func(resp string)) {
	mb := []byte(method)
	ub := []byte(url)
	bb := []byte(body)
	hb := []byte(headers)
	packed := _hostHTTPRequest(
		bytesPtr(mb), uint32(len(mb)),
		bytesPtr(ub), uint32(len(ub)),
		bytesPtr(bb), uint32(len(bb)),
		bytesPtr(hb), uint32(len(hb)),
	)
	reqID := readSharedBuf(packed)
	if reqID == "" {
		if cb != nil {
			cb("")
		}
		return
	}
	if cb != nil {
		httpCallbacks[reqID] = cb
	}
}

// handleHTTPResponse 处理 host 推回的异步 HTTP 响应
func handleHTTPResponse(data json.RawMessage) {
	var d struct {
		RequestID string `json:"requestId"`
		Body      string `json:"body"`
	}
	if json.Unmarshal(data, &d) != nil {
		return
	}
	cb, ok := httpCallbacks[d.RequestID]
	if !ok {
		return
	}
	delete(httpCallbacks, d.RequestID)
	cb(d.Body)
}

func handleHostResponse(data json.RawMessage) {
	var resp struct {
		RequestID string      `json:"requestId"`
		Success   bool        `json:"success"`
		Data      interface{} `json:"data,omitempty"`
		Error     string      `json:"error,omitempty"`
	}
	if json.Unmarshal(data, &resp) != nil {
		return
	}
	cb, ok := hostCallbacks[resp.RequestID]
	if !ok {
		return
	}
	delete(hostCallbacks, resp.RequestID)
	cb(resp.Success, resp.Data, resp.Error)
}

// ==================== 同步 API (统一走 request) ====================

func logMsg(msg string) {
	if len(msg) == 0 {
		return
	}
	hostCall("system.log", map[string]interface{}{"message": msg})
}

func scopedRequest(msgType string, payload map[string]interface{}) string {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["appId"] = currentAppID
	return request(msgType, payload)
}

func configGet(key string) string {
	result := scopedRequest("config.get", map[string]interface{}{"key": key})
	var r struct {
		Value string `json:"value"`
		Error string `json:"error"`
	}
	json.Unmarshal([]byte(result), &r)
	if r.Error != "" {
		return ""
	}
	return r.Value
}

func configSet(key, val string) {
	scopedRequest("config.set", map[string]interface{}{"key": key, "value": val})
}

func kvGet(key string) string {
	result := scopedRequest("kv.get", map[string]interface{}{"key": key})
	var r struct {
		Value string `json:"value"`
		Error string `json:"error"`
	}
	json.Unmarshal([]byte(result), &r)
	if r.Error != "" {
		return ""
	}
	return r.Value
}

func kvSet(key, val string) {
	scopedRequest("kv.set", map[string]interface{}{"key": key, "value": val})
}

// request calls any registered handler on the WebOS backend (fire-and-forget).
func request(msgType string, payload interface{}) string {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return `{"error":"marshal payload: ` + err.Error() + `"}`
	}
	tb := []byte(msgType)
	packed := _hostRequest(
		bytesPtr(tb), uint32(len(tb)),
		bytesPtr(payloadBytes), uint32(len(payloadBytes)),
	)
	return readSharedBuf(packed)
}

func hostCall(method string, params map[string]interface{}) string {
	call := map[string]interface{}{
		"method": method,
		"params": params,
	}
	return request("host_call", call)
}

func hostCallAsync(method string, params map[string]interface{}, cb func(success bool, data interface{}, err string)) {
	result := hostCall(method, params)
	var r struct {
		RequestID string `json:"requestId"`
	}
	if json.Unmarshal([]byte(result), &r) == nil && r.RequestID != "" && cb != nil {
		hostCallbacks[r.RequestID] = cb
	}
}

// ==================== Memory helpers ====================

func bytesPtr(b []byte) uint32 {
	if len(b) == 0 {
		return 0
	}
	return uint32(uintptr(unsafe.Pointer(&b[0])))
}

// readSharedBuf 从 shared buffer 读取 host 写入的数据。
func readSharedBuf(packed uint64) string {
	length := uint32(packed & 0xFFFFFFFF)
	if length == 0 {
		return ""
	}
	if length > uint32(len(_sharedBuf)) {
		return ""
	}
	return string(_sharedBuf[:length])
}
