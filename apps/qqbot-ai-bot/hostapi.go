package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"unsafe"
)

const currentAppID = "qq-ai-bot"

// ==================== Host function imports ====================

//go:wasmimport webos http_request
func _hostHTTPRequest(methodPtr, methodLen, urlPtr, urlLen, bodyPtr, bodyLen, headersPtr, headersLen uint32) uint64

//go:wasmimport webos request
func _hostRequest(typePtr, typeLen, payloadPtr, payloadLen uint32) uint64

//go:wasmimport webos ws_connect
func _hostWSConnect(urlPtr, urlLen, headersPtr, headersLen uint32) uint64

//go:wasmimport webos ws_send
func _hostWSSend(connIdPtr, connIdLen, dataPtr, dataLen uint32) uint32

//go:wasmimport webos ws_close
func _hostWSClose(connIdPtr, connIdLen uint32) uint32

// ==================== Shared buffer for host→wasm data ====================

var _sharedBuf [1 << 20]byte

//go:wasmexport get_shared_buf
func get_shared_buf() uint64 {
	ptr := uint32(uintptr(unsafe.Pointer(&_sharedBuf[0])))
	return uint64(ptr)<<32 | uint64(len(_sharedBuf))
}

// ==================== Async HTTP callbacks ====================

var httpCallbacks = map[string]func(resp string){}
var hostCallbacks = map[string]func(success bool, data interface{}, err string){}

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

// ==================== Synchronous API ====================

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

// ==================== WebSocket API ====================

func wsConnect(url, headers string) string {
	ub := []byte(url)
	hb := []byte(headers)
	packed := _hostWSConnect(
		bytesPtr(ub), uint32(len(ub)),
		bytesPtr(hb), uint32(len(hb)),
	)
	return readSharedBuf(packed)
}

func wsSend(connID string, data []byte) bool {
	cb := []byte(connID)
	return _hostWSSend(bytesPtr(cb), uint32(len(cb)), bytesPtr(data), uint32(len(data))) == 0
}

func wsClose(connID string) {
	cb := []byte(connID)
	_hostWSClose(bytesPtr(cb), uint32(len(cb)))
}

// ==================== Sync HTTP API ====================

func httpRequest(method, url, body, headers string) string {
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
	return readSharedBuf(packed)
}

// ==================== Async HTTP API ====================

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

// ==================== 文件操作 API ====================

// downloadFile 通过 shell_exec 下载文件到指定路径
func downloadFile(url, savePath string) bool {
	// 创建目录并下载
	cmd := fmt.Sprintf("mkdir -p %s && curl -sL -o '%s' '%s'",
		savePath[:strings.LastIndex(savePath, "/")], savePath, url)
	result := request("shell_exec", map[string]interface{}{
		"command": cmd,
	})
	logMsg("shell_exec result: " + result[:min(len(result), 300)])
	var r struct {
		Success  bool   `json:"success"`
		Error    string `json:"error"`
		ExitCode int    `json:"exitCode"`
	}
	if json.Unmarshal([]byte(result), &r) == nil {
		if r.Error != "" {
			logMsg("shell_exec error: " + r.Error)
		}
		return r.Success
	}
	return false
}
