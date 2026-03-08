import { request as wsRequest, sendMsg } from '@/stores/webSocketStore'
import { useWindowStore } from '@/stores/windowStore'

export interface StaticAppSDK {
  /** Call any backend method: sdk.request('fs.list', { nodeId, path }) */
  request: (method: string, params?: Record<string, any>) => Promise<any>
  /** Window operations (handled locally, not via backend) */
  window: {
    setTitle: (title: string) => void
    close: () => void
    getInfo: () => { id: string; title: string; size: { width: number; height: number }; position: { x: number; y: number } } | null
  }
}

export function createSDK(windowId: string, _appId?: string): StaticAppSDK {
  return {
    request: (method, params) => wsRequest(method, params || {}),
    window: {
      setTitle: (title) => useWindowStore.getState().updateWindowTitle(windowId, title),
      close: () => useWindowStore.getState().closeWindow(windowId),
      getInfo: () => {
        const win = useWindowStore.getState().windows.find(w => w.id === windowId)
        if (!win) return null
        return { id: win.id, title: win.title, size: win.size, position: win.position }
      },
    },
  }
}
