import { sendMsg, registerMessageHandler, registerDisconnectHook } from '@/stores/webSocketStore'

type TerminalHandler = (type: string, data?: string) => void

// Terminal listeners: sid -> handler
const terminalListeners = new Map<string, TerminalHandler>()

// Pending terminal_open callbacks keyed by reqId
const pendingOpens = new Map<string, (sid: string) => void>()
let openSeq = 0

// Register push message handlers for terminal events
registerMessageHandler((msg) => {
  if (msg.type === 'terminal_opened') {
    const reqId = msg.reqId as string
    if (reqId && pendingOpens.has(reqId)) {
      const cb = pendingOpens.get(reqId)!
      pendingOpens.delete(reqId)
      cb(msg.sid)
    }
    return true
  }
  if (msg.type === 'terminal_output') {
    const handler = terminalListeners.get(msg.sid)
    if (handler) handler('output', msg.data)
    return true
  }
  if (msg.type === 'terminal_exited') {
    const handler = terminalListeners.get(msg.sid)
    if (handler) handler('exited')
    return true
  }
  return false
})

// Clear state on disconnect
registerDisconnectHook(() => {
  terminalListeners.clear()
  pendingOpens.clear()
})

export const terminalService = {
  open(callback: (sid: string) => void) {
    const reqId = `term_open_${++openSeq}_${Date.now()}`
    pendingOpens.set(reqId, callback)
    sendMsg({ type: 'terminal_open', reqId })
    // Timeout: clean up if server never responds
    setTimeout(() => {
      pendingOpens.delete(reqId)
    }, 15000)
  },

  input(sid: string, data: string) {
    sendMsg({ type: 'terminal_input', sid, data })
  },

  resize(sid: string, cols: number, rows: number) {
    sendMsg({ type: 'terminal_resize', sid, cols, rows })
  },

  close(sid: string) {
    sendMsg({ type: 'terminal_close', sid })
    terminalListeners.delete(sid)
  },

  onMessage(sid: string, handler: TerminalHandler): () => void {
    terminalListeners.set(sid, handler)
    return () => {
      terminalListeners.delete(sid)
    }
  },
}
