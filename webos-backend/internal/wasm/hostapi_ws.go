package wasm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/tetratelabs/wazero/api"
)

// ==================== WebSocket 连接管理 ====================

var wsConnCounter atomic.Uint64

// wsConn 表示一个 WebSocket 连接
type wsConn struct {
	id     string
	appID  string
	conn   *websocket.Conn
	mu     sync.Mutex
	closed bool
	stopCh chan struct{}
}

// 全局连接池：appID → connID → *wsConn
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
	wc.conn.Close()
}

func (wc *wsConn) send(data []byte) error {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.closed {
		return fmt.Errorf("connection closed")
	}
	return wc.conn.WriteMessage(websocket.TextMessage, data)
}

func (wc *wsConn) sendBinary(data []byte) error {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.closed {
		return fmt.Errorf("connection closed")
	}
	return wc.conn.WriteMessage(websocket.BinaryMessage, data)
}

// ==================== Host Functions ====================

// hostWSConnect: wasm 调用 ws_connect(urlPtr, urlLen, headersPtr, headersLen) → connID (via shared buf)
// 异步建立 WebSocket 连接，成功后推 ws_open 事件，失败推 ws_error 事件
func hostWSConnect(appID string) func(ctx context.Context, m api.Module, urlPtr, urlLen, headersPtr, headersLen uint32) uint64 {
	return func(ctx context.Context, m api.Module, urlPtr, urlLen, headersPtr, headersLen uint32) uint64 {
		rawURL, _ := readWasmString(m, urlPtr, urlLen)
		headersStr, _ := readWasmString(m, headersPtr, headersLen)

		if rawURL == "" {
			return writeToWasm(m, []byte(`{"error":"empty url"}`))
		}

		connID := fmt.Sprintf("ws_%d", wsConnCounter.Add(1))

		go func() {
			dialer := websocket.Dialer{
				HandshakeTimeout: 15 * time.Second,
			}

			// 按 app 粒度读取代理配置
			if proxyURL, err := GetAppConfig(appID, "proxy"); err == nil && proxyURL != "" {
				if u, err := url.Parse(proxyURL); err == nil {
					dialer.Proxy = http.ProxyURL(u)
				}
			}

			// 解析自定义 headers
			reqHeaders := http.Header{}
			if headersStr != "" {
				for _, line := range strings.Split(headersStr, "\n") {
					parts := strings.SplitN(line, ":", 2)
					if len(parts) == 2 {
						reqHeaders.Set(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
					}
				}
			}

			conn, _, err := dialer.Dial(rawURL, reqHeaders)
			if err != nil {
				pushWSEvent(appID, "ws_error", map[string]string{
					"connId": connID,
					"error":  err.Error(),
				})
				return
			}

			wc := &wsConn{
				id:     connID,
				appID:  appID,
				conn:   conn,
				stopCh: make(chan struct{}),
			}

			// 注册到连接池
			wsPool.mu.Lock()
			if wsPool.conns[appID] == nil {
				wsPool.conns[appID] = make(map[string]*wsConn)
			}
			wsPool.conns[appID][connID] = wc
			wsPool.mu.Unlock()

			// 推送连接成功事件
			pushWSEvent(appID, "ws_open", map[string]string{
				"connId": connID,
			})

			// 启动读循环
			go wsReadLoop(wc)
		}()

		return writeToWasm(m, []byte(connID))
	}
}

// hostWSSend: wasm 调用 ws_send(connIdPtr, connIdLen, dataPtr, dataLen) → 0/1
// 自动检测数据类型：如果首字节 < 0x20 且不是有效 JSON/文本开头，则发送 BinaryMessage
func hostWSSend(appID string) func(ctx context.Context, m api.Module, connIdPtr, connIdLen, dataPtr, dataLen uint32) uint32 {
	return func(ctx context.Context, m api.Module, connIdPtr, connIdLen, dataPtr, dataLen uint32) uint32 {
		connID, _ := readWasmString(m, connIdPtr, connIdLen)
		data, _ := m.Memory().Read(dataPtr, dataLen)
		if connID == "" || len(data) == 0 {
			return 1
		}

		wsPool.mu.RLock()
		wc := wsPool.conns[appID][connID]
		wsPool.mu.RUnlock()
		if wc == nil {
			return 1
		}

		// 拷贝数据（wasm 内存引用可能失效）
		dataCopy := make([]byte, len(data))
		copy(dataCopy, data)

		// 自动检测：首字节是 '{', '[', 或可打印 ASCII → TextMessage，否则 BinaryMessage
		isBinary := len(dataCopy) > 0 && dataCopy[0] != '{' && dataCopy[0] != '[' && dataCopy[0] < 0x20
		var err error
		if isBinary {
			err = wc.sendBinary(dataCopy)
		} else {
			err = wc.send(dataCopy)
		}
		if err != nil {
			return 1
		}
		return 0
	}
}

// hostWSClose: wasm 调用 ws_close(connIdPtr, connIdLen) → 0/1
func hostWSClose(appID string) func(ctx context.Context, m api.Module, connIdPtr, connIdLen uint32) uint32 {
	return func(ctx context.Context, m api.Module, connIdPtr, connIdLen uint32) uint32 {
		connID, _ := readWasmString(m, connIdPtr, connIdLen)
		if connID == "" {
			return 1
		}

		wsPool.mu.Lock()
		wc := wsPool.conns[appID][connID]
		if wc != nil {
			delete(wsPool.conns[appID], connID)
		}
		wsPool.mu.Unlock()

		if wc == nil {
			return 1
		}
		wc.close()
		return 0
	}
}

// ==================== 读循环 & 事件推送 ====================

func wsReadLoop(wc *wsConn) {
	defer func() {
		// 从连接池移除
		wsPool.mu.Lock()
		if appConns := wsPool.conns[wc.appID]; appConns != nil {
			delete(appConns, wc.id)
		}
		wsPool.mu.Unlock()

		wc.close()

		// 推送关闭事件
		pushWSEvent(wc.appID, "ws_close", map[string]string{
			"connId": wc.id,
		})
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
				pushWSEvent(wc.appID, "ws_error", map[string]string{
					"connId": wc.id,
					"error":  err.Error(),
				})
			}
			return
		}

		evtData := map[string]interface{}{
			"connId": wc.id,
		}
		switch msgType {
		case websocket.TextMessage:
			evtData["data"] = string(data)
			evtData["binary"] = false
		case websocket.BinaryMessage:
			evtData["data"] = base64.StdEncoding.EncodeToString(data)
			evtData["binary"] = true
		case websocket.PingMessage, websocket.PongMessage:
			continue
		}

		pushWSEvent(wc.appID, "ws_message", evtData)
	}
}

func pushWSEvent(appID, evtType string, data interface{}) {
	evt, _ := json.Marshal(map[string]interface{}{
		"type": evtType,
		"data": data,
	})
	GetRuntime().PushEvent(appID, evt)
}
