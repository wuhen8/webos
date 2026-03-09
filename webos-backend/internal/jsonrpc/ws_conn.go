package jsonrpc

// WSConn adapter for WebSocket transport.
// This wraps any WebSocket connection to implement the jsonrpc.Conn interface.

// WSTransport wraps a WebSocket write function into a jsonrpc.Conn.
type WSTransport struct {
	ID        string
	WriteFn   func(v interface{}) error
	Ctx       interface{} // points back to handler.WSConn for subscription state etc.
}

func (w *WSTransport) Send(v interface{}) error {
	return w.WriteFn(v)
}

func (w *WSTransport) ConnID() string {
	return w.ID
}

func (w *WSTransport) Context() interface{} {
	return w.Ctx
}

// Notify sends a JSON-RPC notification (server push, no id).
func (w *WSTransport) Notify(method string, params interface{}) error {
	return w.Send(NewNotification(method, params))
}
