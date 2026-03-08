import { request as wsRequest, sendMsg } from '@/stores/webSocketStore'
import { useWindowStore } from '@/stores/windowStore'

export interface StaticAppSDK {
  fs: {
    list: (nodeId: string, path: string) => Promise<any>
    read: (nodeId: string, path: string) => Promise<any>
    write: (nodeId: string, path: string, content: string) => Promise<any>
    mkdir: (nodeId: string, path: string, name: string) => Promise<any>
    create: (nodeId: string, path: string, name: string) => Promise<any>
    delete: (nodeId: string, paths: string[]) => Promise<any>
    rename: (nodeId: string, path: string, oldName: string, newName: string) => Promise<any>
    copy: (nodeId: string, paths: string[], to: string, dstNodeId?: string) => Promise<any>
    move: (nodeId: string, paths: string[], to: string, dstNodeId?: string) => Promise<any>
    search: (nodeId: string, path: string, keyword: string) => Promise<any>
  }
  terminal: {
    open: () => void
    input: (sid: string, data: string) => void
    resize: (sid: string, cols: number, rows: number) => void
    close: (sid: string) => void
  }
  docker: {
    containers: () => Promise<any>
    images: () => Promise<any>
    compose: () => Promise<any>
    composeLogs: (project: string) => Promise<any>
    containerLogs: (id: string) => Promise<any>
  }
  exec: (command: string) => Promise<any>
  window: {
    setTitle: (title: string) => void
    close: () => void
    getInfo: () => { id: string; title: string; size: { width: number; height: number }; position: { x: number; y: number } } | null
  }
  wasm: {
    start: (appId: string) => Promise<any>
    stop: (appId: string) => Promise<any>
    restart: (appId: string) => Promise<any>
    list: () => Promise<any>
  }
}

export function createSDK(windowId: string, appId?: string): StaticAppSDK {
  return {
    fs: {
      list: (nodeId, path) => wsRequest('fs.list', { nodeId, path }),
      read: (nodeId, path) => wsRequest('fs.read', { nodeId, path }),
      write: (nodeId, path, content) => wsRequest('fs.write', { nodeId, path, content }),
      mkdir: (nodeId, path, name) => wsRequest('fs.mkdir', { nodeId, path, name }),
      create: (nodeId, path, name) => wsRequest('fs.create', { nodeId, path, name }),
      delete: (nodeId, paths) => wsRequest('fs.delete', { nodeId, paths }),
      rename: (nodeId, path, oldName, newName) => wsRequest('fs.rename', { nodeId, path, oldName, newName }),
      copy: (nodeId, paths, to, dstNodeId) => wsRequest('fs.copy', { nodeId, paths, to, dstNodeId }),
      move: (nodeId, paths, to, dstNodeId) => wsRequest('fs.move', { nodeId, paths, to, dstNodeId }),
      search: (nodeId, path, keyword) => wsRequest('fs.search', { nodeId, path, keyword }),
    },
    terminal: {
      open: () => sendMsg({ type: 'terminal.open' }),
      input: (sid, data) => sendMsg({ type: 'terminal.input', sid, data }),
      resize: (sid, cols, rows) => sendMsg({ type: 'terminal.resize', sid, cols, rows }),
      close: (sid) => sendMsg({ type: 'terminal.close', sid }),
    },
    docker: {
      containers: () => wsRequest('sub.docker_containers', {}),
      images: () => wsRequest('sub.docker_images', {}),
      compose: () => wsRequest('sub.docker_compose', {}),
      composeLogs: (project) => wsRequest('docker.compose_logs', { project }),
      containerLogs: (id) => wsRequest('docker.container_logs', { id }),
    },
    exec: (command) => wsRequest('system.exec', { command }),
    window: {
      setTitle: (title) => useWindowStore.getState().updateWindowTitle(windowId, title),
      close: () => useWindowStore.getState().closeWindow(windowId),
      getInfo: () => {
        const win = useWindowStore.getState().windows.find(w => w.id === windowId)
        if (!win) return null
        return { id: win.id, title: win.title, size: win.size, position: win.position }
      },
    },
    wasm: {
      start: (id) => wsRequest('wasm.start', { appId: id }),
      stop: (id) => wsRequest('wasm.stop', { appId: id }),
      restart: (id) => wsRequest('wasm.restart', { appId: id }),
      list: () => wsRequest('wasm.list', {}),
    },
  }
}
