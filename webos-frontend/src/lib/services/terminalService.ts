import { request, notify, registerMessageHandler, registerDisconnectHook } from '@/stores/webSocketStore'

type TerminalHandler = (type: string, data?: string) => void

const terminalListeners = new Map<string, TerminalHandler>()

registerMessageHandler((msg) => {
  if (msg.method === 'terminal.output' && msg.params) {
    const handler = terminalListeners.get(msg.params.sid)
    if (handler) handler('output', msg.params.data)
    return true
  }
  if (msg.method === 'terminal.exited' && msg.params) {
    const handler = terminalListeners.get(msg.params.sid)
    if (handler) handler('exited')
    return true
  }
  return false
})

registerDisconnectHook(() => { terminalListeners.clear() })

export const terminalService = {
  async open(callback: (sid: string) => void) {
    try {
      const result = await request('terminal.open')
      if (result?.sid) callback(result.sid)
    } catch { /* timeout or error */ }
  },
  input(sid: string, data: string) { notify('terminal.input', { sid, data }) },
  resize(sid: string, cols: number, rows: number) { notify('terminal.resize', { sid, cols, rows }) },
  close(sid: string) {
    notify('terminal.close', { sid })
    terminalListeners.delete(sid)
  },
  onMessage(sid: string, handler: TerminalHandler): () => void {
    terminalListeners.set(sid, handler)
    return () => { terminalListeners.delete(sid) }
  },
}
