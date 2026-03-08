package handler

import (
	"encoding/json"

	"webos-backend/internal/wasm"
)

func init() {
	RegisterHandlers(map[string]Handler{
		// Process management
		"wasm.start":   handleWasmStart,
		"wasm.stop":    handleWasmStop,
		"wasm.restart": handleWasmRestart,
		"wasm.list":    handleWasmList,
	})
}

func handleWasmStart(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm.start", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := wasm.GetRuntime().StartProc(p.AppID)
		c.ReplyResult("wasm.start", p.ReqID, nil, err)
	}()
}

func handleWasmStop(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm.stop", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		wasm.GetRuntime().StopProc(p.AppID)
		c.Reply("wasm.stop", p.ReqID, nil)
	}()
}

func handleWasmRestart(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		AppID string `json:"appId"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("wasm.restart", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := wasm.GetRuntime().RestartProc(p.AppID)
		c.ReplyResult("wasm.restart", p.ReqID, nil, err)
	}()
}

func handleWasmList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		list := wasm.GetRuntime().ListProcs()
		c.Reply("wasm.list", p.ReqID, list)
	}()
}
