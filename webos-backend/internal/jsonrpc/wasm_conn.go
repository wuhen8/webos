package jsonrpc

import "encoding/json"

// WASMTransport implements Conn for synchronous WASM host calls.
// WASM calls are synchronous: request in, response out via shared buffer.
type WASMTransport struct {
	AppID    string
	Response []byte // filled after dispatch
}

func (w *WASMTransport) Send(v interface{}) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	w.Response = b
	return nil
}

func (w *WASMTransport) ConnID() string {
	return "wasm:" + w.AppID
}

func (w *WASMTransport) Context() interface{} {
	return w.AppID
}
