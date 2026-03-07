package wasm

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

var wsConnCounter atomic.Uint64

type wsConn struct {
	id     string
	appID  string
	conn   *websocket.Conn
	mu     sync.Mutex
	closed bool
	stopCh chan struct{}
}

var wsPool struct {
	mu    sync.RWMutex
	conns map[string]map[string]*wsConn
}

func init() {
	wsPool.conns = make(map[string]map[string]*wsConn)
}

// CloseAllWSConns 关闭某个 app 的所有 WebSocket 连接（进程停止时调用）
func CloseAllWSConns(appID string) {
	wsPool.mu.Lock()
	appConns := wsPool.conns[appID]
	delete(wsPool.conns, appID)
	wsPool.mu.Unlock()

	for _, wc := range appConns {
		wc.close()
	}
	if len(appConns) > 0 {
		log.Printf("[WASM:%s] closed %d WebSocket connections", appID, len(appConns))
	}
}

func (wc *wsConn) close() {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.closed {
		return
	}
	wc.closed = true
	close(wc.stopCh)
	_ = wc.conn.Close()
}

func (wc *wsConn) write(messageType int, data []byte) error {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.closed {
		return fmt.Errorf("connection closed")
	}
	return wc.conn.WriteMessage(messageType, data)
}

func wsConnectCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		URL     string            `json:"url"`
		Headers map[string]string `json:"headers"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.URL == "" {
		return nil, fmt.Errorf("url is required")
	}

	connID := fmt.Sprintf("ws_%d", wsConnCounter.Add(1))
	go func() {
		dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
		if proxyURL, err := GetAppConfig(appID, "proxy"); err == nil && proxyURL != "" {
			if u, err := url.Parse(proxyURL); err == nil {
				dialer.Proxy = http.ProxyURL(u)
			}
		}

		reqHeaders := http.Header{}
		for k, v := range p.Headers {
			reqHeaders.Set(k, v)
		}

		conn, _, err := dialer.Dial(p.URL, reqHeaders)
		if err != nil {
			pushHostEvent(appID, "ws.error", map[string]interface{}{"connId": connID, "streamId": connID, "error": err.Error()})
			return
		}

		wc := &wsConn{id: connID, appID: appID, conn: conn, stopCh: make(chan struct{})}
		wsPool.mu.Lock()
		if wsPool.conns[appID] == nil {
			wsPool.conns[appID] = make(map[string]*wsConn)
		}
		wsPool.conns[appID][connID] = wc
		wsPool.mu.Unlock()

		pushHostEvent(appID, "ws.open", map[string]interface{}{"connId": connID, "streamId": connID})
		go wsReadLoop(wc)
	}()

	return map[string]interface{}{"ok": true, "connId": connID, "streamId": connID}, nil
}

func wsSendCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		ConnID string `json:"connId"`
		Data   string `json:"data"`
		Binary bool   `json:"binary"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.ConnID == "" {
		return nil, fmt.Errorf("connId is required")
	}

	wsPool.mu.RLock()
	wc := wsPool.conns[appID][p.ConnID]
	wsPool.mu.RUnlock()
	if wc == nil {
		return nil, fmt.Errorf("connection not found: %s", p.ConnID)
	}

	var data []byte
	var messageType int
	if p.Binary {
		decoded, err := base64.StdEncoding.DecodeString(p.Data)
		if err != nil {
			return nil, fmt.Errorf("invalid base64 data: %w", err)
		}
		data = decoded
		messageType = websocket.BinaryMessage
	} else {
		data = []byte(p.Data)
		messageType = websocket.TextMessage
	}

	if err := wc.write(messageType, data); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func wsCloseCapability(appID string, params json.RawMessage) (interface{}, error) {
	var p struct {
		ConnID string `json:"connId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if p.ConnID == "" {
		return nil, fmt.Errorf("connId is required")
	}

	wsPool.mu.Lock()
	wc := wsPool.conns[appID][p.ConnID]
	if wc != nil {
		delete(wsPool.conns[appID], p.ConnID)
	}
	wsPool.mu.Unlock()
	if wc == nil {
		return nil, fmt.Errorf("connection not found: %s", p.ConnID)
	}
	wc.close()
	return map[string]bool{"ok": true}, nil
}

func wsReadLoop(wc *wsConn) {
	defer func() {
		wsPool.mu.Lock()
		if appConns := wsPool.conns[wc.appID]; appConns != nil {
			delete(appConns, wc.id)
		}
		wsPool.mu.Unlock()

		wc.close()
		pushHostEvent(wc.appID, "ws.close", map[string]interface{}{"connId": wc.id, "streamId": wc.id})
	}()

	for {
		select {
		case <-wc.stopCh:
			return
		default:
		}

		msgType, data, err := wc.conn.ReadMessage()
		if err != nil {
			if !wc.closed {
				pushHostEvent(wc.appID, "ws.error", map[string]interface{}{"connId": wc.id, "streamId": wc.id, "error": err.Error()})
			}
			return
		}

		evtData := map[string]interface{}{"connId": wc.id, "streamId": wc.id}
		switch msgType {
		case websocket.TextMessage:
			evtData["data"] = string(data)
			evtData["binary"] = false
		case websocket.BinaryMessage:
			evtData["data"] = base64.StdEncoding.EncodeToString(data)
			evtData["binary"] = true
		case websocket.PingMessage, websocket.PongMessage:
			continue
		default:
			continue
		}

		pushHostEvent(wc.appID, "ws.message", evtData)
	}
}
