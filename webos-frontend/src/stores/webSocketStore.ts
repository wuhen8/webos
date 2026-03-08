import { create } from 'zustand'
import { getWsBase } from '@/lib/env'

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

// Active subscriptions: channel -> { interval, handlers }
const channels = new Map<string, ChannelSub>()

// Request-response infrastructure
let reqSeq = 0
function genReqId(): string {
  return `r_${++reqSeq}_${Date.now()}`
}

const pendingRequests = new Map<string, {
  resolve: (data: any) => void
  reject: (err: Error) => void
}>()

// ── Transport-layer API for service modules ──

export function sendMsg(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Trigger an immediate push for an active subscription channel.
export function refreshChannel(channel: string) {
  const sub = channels.get(channel)
  if (sub) {
    sendMsg({ type: 'sub.subscribe', channel, interval: sub.interval })
  }
}

export function request(type: string, params: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'))
      return
    }
    const reqId = genReqId()
    pendingRequests.set(reqId, { resolve, reject })
    sendMsg({ type, reqId, ...params })
    setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId)
        reject(new Error('Request timeout'))
      }
    }, 30000)
  })
}

// ── Message handler registration (for service modules) ──
// Handler returns true if it handled the message

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

// ── Internal helpers ──

function getWsUrl(): string | null {
  const token = localStorage.getItem('fm_token')
  if (!token) return null
  return getWsBase()
}

// Re-send all active subscriptions (after reconnect)
function syncSubscriptions() {
  for (const [channel, sub] of channels) {
    sendMsg({ type: 'sub.subscribe', channel, interval: sub.interval })
  }
  // Invoke reconnect hooks (services re-subscribe their own state)
  for (const hook of reconnectHooks) {
    hook()
  }
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  connected: false,

  connect: () => {
    // Prevent duplicate connections
    if (ws && ws.readyState <= WebSocket.OPEN) return

    destroyed = false
    const url = getWsUrl()
    if (!url) return

    const socket = new WebSocket(url)
    ws = socket

    socket.onopen = () => {
      if (destroyed) {
        socket.close()
        return
      }
      // Send auth as first message
      const token = localStorage.getItem('fm_token')
      if (token) {
        socket.send(JSON.stringify({ type: 'auth', token }))
      } else {
        socket.close()
      }
    }

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)

        // Handle auth response (before connected state is set)
        if (msg.type === 'auth') {
          if (msg.message === 'ok') {
            set({ connected: true })
            retryCount = 0
            syncSubscriptions()
            window.dispatchEvent(new CustomEvent('ws:auth-ok', { detail: msg.data }))
          } else {
            // Auth failed, close connection
            socket.close()
            window.dispatchEvent(new CustomEvent('ws:auth-fail'))
          }
          return
        }

        // 1. Let registered service handlers try first
        for (const handler of messageHandlers) {
          if (handler(msg)) return
        }

        // 2. Generic request-response matching (reqId-based)
        if (msg.reqId) {
          const pending = pendingRequests.get(msg.reqId)
          if (pending) {
            pendingRequests.delete(msg.reqId)
            if (msg.type === 'fs.error' || msg.message) {
              pending.reject(new Error(msg.message || 'Operation failed'))
            } else {
              pending.resolve(msg.data)
            }
            return
          }
        }

        // 3. Channel subscriptions
        const sub = channels.get(msg.type)
        if (sub) {
          for (const handler of sub.handlers) {
            handler(msg.data)
          }
        }
      } catch {
        // ignore
      }
    }

    socket.onclose = () => {
      set({ connected: false })
      ws = null
      if (destroyed) return
      // Reject all pending requests
      for (const [, pending] of pendingRequests) {
        pending.reject(new Error('WebSocket disconnected'))
      }
      pendingRequests.clear()
      // Invoke disconnect hooks
      for (const hook of [...disconnectHooks]) {
        hook()
      }
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
      retryCount++
      retryTimer = setTimeout(() => {
        useWebSocketStore.getState().connect()
      }, delay)
    }

    socket.onerror = () => {
      // onclose fires after onerror
    }
  },

  disconnect: () => {
    destroyed = true
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    channels.clear()
    // Invoke disconnect hooks
    for (const hook of disconnectHooks) {
      hook()
    }
    // Reject all pending requests
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error('WebSocket disconnected'))
    }
    pendingRequests.clear()
    set({ connected: false })
  },

  send: (msg: object) => {
    sendMsg(msg)
  },

  subscribe: (channel: string, interval: number, handler: MessageHandler) => {
    let sub = channels.get(channel)
    if (!sub) {
      sub = { interval, handlers: new Set() }
      channels.set(channel, sub)
    }
    sub.handlers.add(handler)

    // Update interval if changed
    if (sub.interval !== interval) {
      sub.interval = interval
    }

    // Send subscribe to server
    sendMsg({ type: 'sub.subscribe', channel, interval })

    // Return unsubscribe function
    return () => {
      const s = channels.get(channel)
      if (!s) return
      s.handlers.delete(handler)
      if (s.handlers.size === 0) {
        channels.delete(channel)
        sendMsg({ type: 'sub.unsubscribe', channel })
      }
    }
  },
}))
