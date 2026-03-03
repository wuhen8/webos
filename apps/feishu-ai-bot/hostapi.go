package main

import (
	"encoding/json"
	"unsafe"
)

// ==================== Host function imports ====================

//go:wasmimport webos log
func _hostLog(msgPtr, msgLen uint32)

//go:wasmimport webos config_get
func _hostConfigGet(keyPtr, keyLen uint32) uint64

//go:wasmimport webos kv_get
func _hostKVGet(keyPtr, keyLen uint32) uint64

//go:wasmimport webos kv_set
func _hostKVSet(keyPtr, keyLen, valPtr, valLen uint32) uint32

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

// ==================== 异步 HTTP 回调注册 ====================

var httpCallbacks = map[string]func(resp string){}

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
		cb("")
		return
	}
	httpCallbacks[reqID] = cb
}

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

// ==================== 同步 API ====================

func logMsg(msg string) {
	if len(msg) == 0 {
		return
	}
	b := []byte(msg)
	_hostLog(bytesPtr(b), uint32(len(b)))
}

func configGet(key string) string {
	b := []byte(key)
	packed := _hostConfigGet(bytesPtr(b), uint32(len(b)))
	return readSharedBuf(packed)
}

func kvGet(key string) string {
	b := []byte(key)
	packed := _hostKVGet(bytesPtr(b), uint32(len(b)))
	return readSharedBuf(packed)
}

func kvSet(key, val string) {
	kb := []byte(key)
	vb := []byte(val)
	_hostKVSet(bytesPtr(kb), uint32(len(kb)), bytesPtr(vb), uint32(len(vb)))
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
