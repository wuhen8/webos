import { create } from 'zustand'
import { getWsBase } from '@/lib/env'
import {
  createRequest,
  isResponse,
  isNotification,
  genId,
  JsonRpcClientError,
  ErrorCodes,
} from '@/lib/jsonrpc'

type MessageHandler = (data: any) => void

interface ChannelSub {
  interval: number
  handlers: Set<MessageHandler>
}

interface WebSocketState {
  connected: boolean
  connect: () => void
  disconnect: () => void
  send: (msg: object) => void
  subscribe: (channel: string, interval: number, handler: MessageHandler) => () => void
}

let ws: WebSocket | null = null
let retryCount = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let destroyed = false

const channels = new Map<string, ChannelSub>()
const pendingRequests = new Map<string, {
  resolve: (data: any) => void
  reject: (err: Error) => void
}>()

// ── Transport-layer API ──

export function sendMsg(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function notify(method: string, params?: Record<string, any>) {
  sendMsg({ jsonrpc: '2.0', method, ...(params !== undefined && { params }) })
}

export function refreshChannel(channel: string) {
  const sub = channels.get(channel)
  if (sub) {
    request('sub.subscribe', { channel, interval: sub.interval }).catch(() => {})
  }
}

export function request(method: string, params?: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'))
      return
    }
    const id = genId()
    pendingRequests.set(id, { resolve, reject })
    sendMsg(createRequest(method, params, id))
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Request timeout'))
      }
    }, 30000)
  })
}

// ── Message handler registration ──

type RawMessageHandler = (msg: any) => boolean
const messageHandlers: RawMessageHandler[] = []

export function registerMessageHandler(handler: RawMessageHandler): () => void {
  messageHandlers.push(handler)
  return () => {
    const idx = messageHandlers.indexOf(handler)
    if (idx >= 0) messageHandlers.splice(idx, 1)
  }
}

// ── Reconnect / disconnect hooks ──

const reconnectHooks: Array<() => void> = []
const disconnectHooks: Array<() => void> = []

export function registerReconnectHook(hook: () => void): () => void {
  reconnectHooks.push(hook)
  return () => {
    const idx = reconnectHooks.indexOf(hook)
    if (idx >= 0) reconnectHooks.splice(idx, 1)
  }
}

export function registerDisconnectHook(hook: () => void): () => void {
  disconnectHooks.push(hook)
  return () => {
    const idx = disconnectHooks.indexOf(hook)
    if (idx >= 0) disconnectHooks.splice(idx, 1)
  }
}

// ── Internal ──

function getWsUrl(): string | null {
  const token = localStorage.getItem('fm_token')
  if (!token) return null
  return getWsBase()
}

function syncSubscriptions() {
  for (const [channel, sub] of channels) {
    request('sub.subscribe', { channel, interval: sub.interval }).catch(() => {})
  }
  for (const hook of reconnectHooks) hook()
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  connected: false,

  connect: () => {
    if (ws && ws.readyState <= WebSocket.OPEN) return
    destroyed = false
    const url = getWsUrl()
    if (!url) return

    const socket = new WebSocket(url)
    ws = socket

    socket.onopen = () => {
      if (destroyed) { socket.close(); return }
      const token = localStorage.getItem('fm_token')
      if (token) {
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'auth', params: { token } }))
      } else {
        socket.close()
      }
    }

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)

        // JSON-RPC 2.0 response
        if (isResponse(msg)) {
          const id = String(msg.id)
          const pending = pendingRequests.get(id)
          if (pending) {
            pendingRequests.delete(id)
            if (msg.error) {
              const err = new JsonRpcClientError(msg.error)
              if (msg.error.code === ErrorCodes.UNAUTHORIZED) {
                localStorage.removeItem('fm_token')
                window.dispatchEvent(new CustomEvent('auth:unauthorized'))
              }
              pending.reject(err)
            } else {
              pending.resolve(msg.result)
            }
          }
          return
        }

        // JSON-RPC 2.0 notification
        if (isNotification(msg)) {
          if (msg.method === 'auth') {
            const p = msg.params as any
            if (p?.status === 'ok') {
              set({ connected: true })
              retryCount = 0
              syncSubscriptions()
              window.dispatchEvent(new CustomEvent('ws:auth-ok', { detail: p.data }))
            } else {
              socket.close()
              window.dispatchEvent(new CustomEvent('ws:auth-fail'))
            }
            return
          }

          for (const handler of messageHandlers) {
            if (handler(msg)) return
          }

          const sub = channels.get(msg.method)
          if (sub) {
            for (const handler of sub.handlers) {
              handler(msg.params)
            }
          }
          return
        }
      } catch {
        // ignore parse errors
      }
    }

    socket.onclose = () => {
      set({ connected: false })
      ws = null
      if (destroyed) return
      for (const [, pending] of pendingRequests) {
        pending.reject(new Error('WebSocket disconnected'))
      }
      pendingRequests.clear()
      for (const hook of [...disconnectHooks]) hook()
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
      retryCount++
      retryTimer = setTimeout(() => useWebSocketStore.getState().connect(), delay)
    }

    socket.onerror = () => {}
  },

  disconnect: () => {
    destroyed = true
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (ws) { ws.close(); ws = null }
    channels.clear()
    for (const hook of disconnectHooks) hook()
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error('WebSocket disconnected'))
    }
    pendingRequests.clear()
    set({ connected: false })
  },

  send: (msg: object) => sendMsg(msg),

  subscribe: (channel: string, interval: number, handler: MessageHandler) => {
    let sub = channels.get(channel)
    if (!sub) {
      sub = { interval, handlers: new Set() }
      channels.set(channel, sub)
    }
    sub.handlers.add(handler)
    if (sub.interval !== interval) sub.interval = interval
    request('sub.subscribe', { channel, interval }).catch(() => {})

    return () => {
      const s = channels.get(channel)
      if (!s) return
      s.handlers.delete(handler)
      if (s.handlers.size === 0) {
        channels.delete(channel)
        request('sub.unsubscribe', { channel }).catch(() => {})
      }
    }
  },
}))
