package handler

import (
	"encoding/json"

	"webos-backend/internal/wasm"
)

func init() {
	RegisterHandlers(map[string]Handler{
		// Process management
		"wasm_start":   handleWasmStart,
		"wasm_stop":    handleWasmStop,
		"wasm_restart": handleWasmRestart,
		"wasm_list":    handleWasmList,
	})
}

func handleWasmStart(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm_start", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := wasm.GetRuntime().StartProc(p.AppID)
		c.ReplyResult("wasm_start", p.ReqID, nil, err)
	}()
}

func handleWasmStop(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm_stop", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		wasm.GetRuntime().StopProc(p.AppID)
		c.Reply("wasm_stop", p.ReqID, nil)
	}()
}

func handleWasmRestart(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm_restart", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := wasm.GetRuntime().RestartProc(p.AppID)
		c.ReplyResult("wasm_restart", p.ReqID, nil, err)
	}()
}

func handleWasmList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		list := wasm.GetRuntime().ListProcs()
		c.Reply("wasm_list", p.ReqID, list)
	}()
}
