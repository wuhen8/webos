package main

import (
	"encoding/json"
	"unsafe"
)

const currentAppID = "telegram-ai-bot"

//go:wasmimport webos request
func _hostRequest(typePtr, typeLen, payloadPtr, payloadLen uint32) uint64

var _sharedBuf [1 << 20]byte

//go:wasmexport get_shared_buf
func get_shared_buf() uint64 {
	ptr := uint32(uintptr(unsafe.Pointer(&_sharedBuf[0])))
	return uint64(ptr)<<32 | uint64(len(_sharedBuf))
}

var httpCallbacks = map[string]func(resp string){}
var hostCallbacks = map[string]func(success bool, data interface{}, err string){}

// ==================== Async file download via saveTo ====================

type PendingDownload struct {
	ChatID   int
	ConvID   string
	UserName string
	UserText string
	FileName string
}

var pendingDownloads = map[string]*PendingDownload{}

func downloadFileAsync(url, savePath string) string {
	params := map[string]interface{}{
		"method": "GET",
		"url":    url,
		"saveTo": savePath,
	}
	result, ok := requestJSON("http.request", params)
	if !ok {
		return ""
	}
	reqID, _ := result["requestId"].(string)
	return reqID
}

func logMsg(msg string) {
	if len(msg) == 0 {
		return
	}
	_, _ = requestJSON("system.log", map[string]interface{}{"message": msg})
}

func configGet(key string) string {
	result := request("config.get", map[string]interface{}{"key": key})
	var r struct {
		Value string `json:"value"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal([]byte(result), &r)
	if r.Error != "" {
		return ""
	}
	return r.Value
}

func configSet(key, val string) {
	request("config.set", map[string]interface{}{"key": key, "value": val})
}

func kvGet(key string) string {
	result := request("kv.get", map[string]interface{}{"key": key})
	var r struct {
		Value string `json:"value"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal([]byte(result), &r)
	if r.Error != "" {
		return ""
	}
	return r.Value
}

func kvSet(key, val string) {
	request("kv.set", map[string]interface{}{"key": key, "value": val})
}

func request(msgType string, payload interface{}) string {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return `{"error":"marshal payload: ` + err.Error() + `"}`
	}
	tb := []byte(msgType)
	packed := _hostRequest(bytesPtr(tb), uint32(len(tb)), bytesPtr(payloadBytes), uint32(len(payloadBytes)))
	raw := readSharedBuf(packed)
	// Unwrap JSON-RPC 2.0 response: extract "result" field
	var rpc struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(raw), &rpc) == nil {
		if rpc.Error != nil {
			return `{"error":"` + rpc.Error.Message + `"}`
		}
		if rpc.Result != nil {
			return string(rpc.Result)
		}
	}
	return raw
}

func requestJSON(msgType string, payload interface{}) (map[string]interface{}, bool) {
	resp := request(msgType, payload)
	var m map[string]interface{}
	if json.Unmarshal([]byte(resp), &m) != nil {
		return nil, false
	}
	return m, true
}

func httpRequestAsync(method, url, body, headers string, cb func(resp string)) {
	params := map[string]interface{}{
		"method":  method,
		"url":     url,
		"headers": map[string]string{},
	}
	if headers != "" {
		var h map[string]string
		if json.Unmarshal([]byte(headers), &h) == nil {
			params["headers"] = h
		}
	}
	if body != "" {
		var b map[string]interface{}
		if json.Unmarshal([]byte(body), &b) == nil {
			params["body"] = map[string]interface{}{
				"kind":  "json",
				"value": b,
			}
		}
	}
	result, ok := requestJSON("http.request", params)
	if !ok {
		if cb != nil {
			cb("")
		}
		return
	}
	if reqID, _ := result["requestId"].(string); reqID != "" && cb != nil {
		httpCallbacks[reqID] = cb
		return
	}
	if cb != nil {
		cb("")
	}
}

func hostCall(method string, params map[string]interface{}) string {
	return request(method, params)
}

func hostCallAsync(method string, params map[string]interface{}, cb func(success bool, data interface{}, err string)) {
	result, ok := requestJSON(method, params)
	if !ok {
		if cb != nil {
			cb(false, nil, "invalid response")
		}
		return
	}
	if reqID, _ := result["requestId"].(string); reqID != "" && cb != nil {
		hostCallbacks[reqID] = cb
		return
	}
	if cb != nil {
		if errText, _ := result["error"].(string); errText != "" {
			cb(false, nil, errText)
		} else {
			cb(true, result, "")
		}
	}
}

func handleHostResponse(data json.RawMessage) {
	var resp struct {
		Method    string      `json:"method"`
		RequestID string      `json:"requestId"`
		Success   bool        `json:"success"`
		Data      interface{} `json:"data,omitempty"`
		Error     string      `json:"error,omitempty"`
	}
	if json.Unmarshal(data, &resp) != nil {
		return
	}
	if resp.Method == "http.request" {
		handleHTTPResponse(data)
		return
	}
	cb, ok := hostCallbacks[resp.RequestID]
	if !ok {
		return
	}
	delete(hostCallbacks, resp.RequestID)
	cb(resp.Success, resp.Data, resp.Error)
}

func handleHTTPResponse(data json.RawMessage) {
	var d struct {
		Method    string `json:"method"`
		RequestID string `json:"requestId"`
		Success   bool   `json:"success"`
		Data      struct {
			Body string `json:"body"`
			Path string `json:"path"`
			Size int64  `json:"size"`
		} `json:"data"`
		Error string `json:"error"`
	}
	if json.Unmarshal(data, &d) != nil {
		return
	}

	// Check pending downloads first
	if pd, ok := pendingDownloads[d.RequestID]; ok {
		delete(pendingDownloads, d.RequestID)
		onDownloadComplete(pd, d.Data.Path, d.Error)
		return
	}

	cb, ok := httpCallbacks[d.RequestID]
	if !ok {
		return
	}
	delete(httpCallbacks, d.RequestID)
	if d.Error != "" {
		cb(`{"error":"` + d.Error + `"}`)
		return
	}
	cb(d.Data.Body)
}

func bytesPtr(b []byte) uint32 {
	if len(b) == 0 {
		return 0
	}
	return uint32(uintptr(unsafe.Pointer(&b[0])))
}

func readSharedBuf(packed uint64) string {
	length := uint32(packed & 0xFFFFFFFF)
	if length == 0 || length > uint32(len(_sharedBuf)) {
		return ""
	}
	return string(_sharedBuf[:length])
}
