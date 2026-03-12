import { request, notify, registerMessageHandler, registerReconnectHook, registerDisconnectHook } from '@/stores/webSocketStore'
import type { FileInfo } from '@/types'

const fsWatchHandlers = new Map<string, Set<(files: any[]) => void>>()

registerMessageHandler((msg) => {
  if (msg.method === 'fs.watch' && msg.params) {
    const key = `${msg.params.nodeId}:${msg.params.path}`
    const handlers = fsWatchHandlers.get(key)
    if (handlers) {
      for (const handler of handlers) handler(msg.params.files)
    }
    return true
  }
  return false
})

registerReconnectHook(() => {
  for (const key of fsWatchHandlers.keys()) {
    const [nodeId, ...pathParts] = key.split(':')
    notify('fs.watch', { nodeId, path: pathParts.join(':') })
  }
})

registerDisconnectHook(() => {
  fsWatchHandlers.clear()
})

export const fsService = {
  list(nodeId: string, path: string): Promise<FileInfo[]> {
    return request('fs.list', { nodeId, path })
  },
  read(nodeId: string, path: string): Promise<{ path: string; content: string }> {
    return request('fs.read', { nodeId, path })
  },
  write(nodeId: string, path: string, content: string): Promise<{ path: string }> {
    return request('fs.write', { nodeId, path, content })
  },
  mkdir(nodeId: string, path: string, name: string): Promise<{ path: string }> {
    return request('fs.mkdir', { nodeId, path, name })
  },
  create(nodeId: string, path: string, name: string): Promise<{ path: string }> {
    return request('fs.create', { nodeId, path, name })
  },
  delete(nodeId: string, paths: string[], reqId?: string): Promise<void> {
    const params: any = { nodeId, paths }
    if (reqId) params.reqId = reqId
    return request('fs.delete', params)
  },
  rename(nodeId: string, path: string, oldName: string, newName: string): Promise<{ path: string }> {
    return request('fs.rename', { nodeId, path, oldName, newName })
  },
  copy(srcNodeId: string, paths: string[], to: string, dstNodeId?: string, reqId?: string): Promise<void> {
    const params: any = { nodeId: srcNodeId, paths, to, dstNodeId }
    if (reqId) params.reqId = reqId
    return request('fs.copy', params)
  },
  move(srcNodeId: string, paths: string[], to: string, dstNodeId?: string, reqId?: string): Promise<void> {
    const params: any = { nodeId: srcNodeId, paths, to, dstNodeId }
    if (reqId) params.reqId = reqId
    return request('fs.move', params)
  },
  presign(nodeId: string, path: string, method: string = 'GET'): Promise<{ url: string; method: string }> {
    return request('fs.presign', { nodeId, path, method })
  },
  downloadSign(nodeId: string, path: string): Promise<{ nodeId: string; path: string; exp: number; sign: string }> {
    return request('fs.download_sign', { nodeId, path })
  },
  extract(nodeId: string, path: string, dest?: string, password?: string, reqId?: string): Promise<{ path: string }> {
    const params: any = { nodeId, path, dest, password }
    if (reqId) params.reqId = reqId
    return request('fs.extract', params)
  },
  compress(nodeId: string, paths: string[], output: string, reqId?: string): Promise<{ path: string }> {
    const params: any = { nodeId, paths, output }
    if (reqId) params.reqId = reqId
    return request('fs.compress', params)
  },
  checkPassword(nodeId: string, path: string): Promise<{ needsPassword: boolean }> {
    return request('fs.check_password', { nodeId, path })
  },
  stat(nodeId: string, path: string): Promise<FileInfo> {
    return request('fs.stat', { nodeId, path })
  },
  statCancel(nodeId: string, path: string): void {
    notify('fs.stat_cancel', { nodeId, path })
  },
  search(nodeId: string, path: string, keyword: string): Promise<FileInfo[]> {
    return request('fs.search', { nodeId, path, keyword })
  },
  offlineDownload(nodeId: string, path: string, urls: string[]): Promise<void> {
    return request('fs.offline_download', { nodeId, path, urls })
  },
  trashList(nodeId: string): Promise<any[]> {
    return request('fs.trash_list', { nodeId })
  },
  trashRestore(nodeId: string, trashIds: string[]): Promise<{ restored: string[] }> {
    return request('fs.trash_restore', { nodeId, trashIds })
  },
  trashDelete(nodeId: string, trashIds: string[]): Promise<void> {
    return request('fs.trash_delete', { nodeId, trashIds })
  },
  trashEmpty(nodeId: string): Promise<void> {
    return request('fs.trash_empty', { nodeId })
  },
  watch(nodeId: string, path: string, handler: (files: any[]) => void): () => void {
    const key = `${nodeId}:${path}`
    let handlers = fsWatchHandlers.get(key)
    if (!handlers) {
      handlers = new Set()
      fsWatchHandlers.set(key, handlers)
      notify('fs.watch', { nodeId, path })
    }
    handlers.add(handler)
    return () => {
      const h = fsWatchHandlers.get(key)
      if (!h) return
      h.delete(handler)
      if (h.size === 0) {
        fsWatchHandlers.delete(key)
        notify('fs.unwatch', { nodeId, path })
      }
    }
  },
}
