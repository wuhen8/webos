import { sendMsg, request, registerMessageHandler, registerReconnectHook, registerDisconnectHook } from '@/stores/webSocketStore'
import type { FileInfo } from '@/types'

// File system watch handlers: "nodeId:path" -> Set of handlers
const fsWatchHandlers = new Map<string, Set<(files: any[]) => void>>()

// Mount watch handlers
const mountWatchHandlers = new Set<(mounts: any[]) => void>()
let mountWatchActive = false

// Register push message handler for fs_watch
registerMessageHandler((msg) => {
  if (msg.type === 'fs_watch' && !msg.reqId && msg.data) {
    const key = `${msg.data.nodeId}:${msg.data.path}`
    const handlers = fsWatchHandlers.get(key)
    if (handlers) {
      for (const handler of handlers) {
        handler(msg.data.files)
      }
    }
    return true
  }
  if (msg.type === 'mount_watch' && !msg.reqId) {
    const mounts = msg.data || []
    for (const handler of mountWatchHandlers) {
      handler(mounts)
    }
    return true
  }
  return false
})

// Re-subscribe all active fs watches on reconnect
registerReconnectHook(() => {
  for (const key of fsWatchHandlers.keys()) {
    const [nodeId, ...pathParts] = key.split(':')
    const path = pathParts.join(':')
    sendMsg({ type: 'fs_watch', nodeId, path })
  }
  if (mountWatchActive) {
    sendMsg({ type: 'mount_watch' })
  }
})

// Clear handlers on disconnect
registerDisconnectHook(() => {
  fsWatchHandlers.clear()
  mountWatchActive = false
})

export const fsService = {
  list(nodeId: string, path: string): Promise<FileInfo[]> {
    return request('fs_list', { nodeId, path })
  },

  read(nodeId: string, path: string): Promise<{ path: string; content: string }> {
    return request('fs_read', { nodeId, path })
  },

  write(nodeId: string, path: string, content: string): Promise<{ path: string }> {
    return request('fs_write', { nodeId, path, content })
  },

  mkdir(nodeId: string, path: string, name: string): Promise<{ path: string }> {
    return request('fs_mkdir', { nodeId, path, name })
  },

  create(nodeId: string, path: string, name: string): Promise<{ path: string }> {
    return request('fs_create', { nodeId, path, name })
  },

  delete(nodeId: string, paths: string[]): Promise<void> {
    return request('fs_delete', { nodeId, paths })
  },

  rename(nodeId: string, path: string, oldName: string, newName: string): Promise<{ path: string }> {
    return request('fs_rename', { nodeId, path, oldName, newName })
  },

  copy(srcNodeId: string, paths: string[], to: string, dstNodeId?: string): Promise<void> {
    return request('fs_copy', { nodeId: srcNodeId, paths, to, dstNodeId })
  },

  move(srcNodeId: string, paths: string[], to: string, dstNodeId?: string): Promise<void> {
    return request('fs_move', { nodeId: srcNodeId, paths, to, dstNodeId })
  },

  presign(nodeId: string, path: string, method: string = 'GET'): Promise<{ url: string; method: string }> {
    return request('fs_presign', { nodeId, path, method })
  },

  downloadSign(nodeId: string, path: string): Promise<{ nodeId: string; path: string; exp: number; sign: string }> {
    return request('fs_download_sign', { nodeId, path })
  },

  extract(nodeId: string, path: string, dest?: string): Promise<{ path: string }> {
    return request('fs_extract', { nodeId, path, dest })
  },

  compress(nodeId: string, paths: string[], output: string): Promise<{ path: string }> {
    return request('fs_compress', { nodeId, paths, output })
  },

  stat(nodeId: string, path: string): Promise<FileInfo> {
    return request('fs_stat', { nodeId, path })
  },

  statCancel(nodeId: string, path: string): void {
    sendMsg({ type: 'fs_stat_cancel', nodeId, path })
  },

  search(nodeId: string, path: string, keyword: string): Promise<FileInfo[]> {
    return request('fs_search', { nodeId, path, keyword })
  },

  offlineDownload(nodeId: string, path: string, urls: string[]): Promise<void> {
    return request('fs_offline_download', { nodeId, path, urls })
  },

  trashList(nodeId: string): Promise<any[]> {
    return request('fs_trash_list', { nodeId })
  },

  trashRestore(nodeId: string, trashIds: string[]): Promise<{ restored: string[] }> {
    return request('fs_trash_restore', { nodeId, trashIds })
  },

  trashDelete(nodeId: string, trashIds: string[]): Promise<void> {
    return request('fs_trash_delete', { nodeId, trashIds })
  },

  trashEmpty(nodeId: string): Promise<void> {
    return request('fs_trash_empty', { nodeId })
  },

  watch(nodeId: string, path: string, handler: (files: any[]) => void): () => void {
    const key = `${nodeId}:${path}`
    let handlers = fsWatchHandlers.get(key)
    if (!handlers) {
      handlers = new Set()
      fsWatchHandlers.set(key, handlers)
      sendMsg({ type: 'fs_watch', nodeId, path })
    }
    handlers.add(handler)

    return () => {
      const h = fsWatchHandlers.get(key)
      if (!h) return
      h.delete(handler)
      if (h.size === 0) {
        fsWatchHandlers.delete(key)
        sendMsg({ type: 'fs_unwatch', nodeId, path })
      }
    }
  },

  watchMounts(handler: (mounts: any[]) => void): () => void {
    mountWatchHandlers.add(handler)
    if (!mountWatchActive) {
      mountWatchActive = true
      sendMsg({ type: 'mount_watch' })
    }
    return () => {
      mountWatchHandlers.delete(handler)
      if (mountWatchHandlers.size === 0) {
        mountWatchActive = false
        sendMsg({ type: 'mount_unwatch' })
      }
    }
  },
}
