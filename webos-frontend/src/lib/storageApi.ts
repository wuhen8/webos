import request from '@/lib/request'
import { fsService } from '@/lib/services'
import { getApiBase } from '@/lib/env'
import { notify, request as wsRequest } from '@/stores/webSocketStore'
import type { StorageNodeConfig } from '@/types'

// ==================== Storage Node CRUD ====================

export async function getStorageNodes(): Promise<StorageNodeConfig[]> {
  return wsRequest('settings.storage_nodes_list', {})
}

export async function addStorageNode(node: Omit<StorageNodeConfig, 'id'>): Promise<string> {
  const resp = await wsRequest('settings.storage_node_add', {
    stName: node.name,
    stType: node.type,
    stConfig: node.config,
  })
  return (resp as any)?.id ?? ''
}

export async function updateStorageNode(id: string, node: Partial<StorageNodeConfig>): Promise<void> {
  await wsRequest('settings.storage_node_update', {
    id,
    stName: node.name,
    stType: node.type,
    stConfig: node.config,
  })
}

export async function deleteStorageNode(id: string): Promise<void> {
  await wsRequest('settings.storage_node_delete', { id })
}

// ==================== Chunked Upload Helpers ====================

const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB
const CHUNK_THRESHOLD = 10 * 1024 * 1024 // 10MB
const CONCURRENT_CHUNKS = 3
const MAX_RETRIES = 3

async function retryFetch(url: string, opts: RequestInit, maxRetries: number): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, opts)
      if (!resp.ok && resp.status >= 500 && attempt < maxRetries) {
        lastErr = new Error(`HTTP ${resp.status}`)
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      return resp
    } catch (e: any) {
      lastErr = e
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastErr || new Error('fetch failed')
}

async function uploadWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

// ==================== Unified FS API ====================

export const fsApi = {
  list(nodeId: string, path: string) {
    return fsService.list(nodeId, path)
  },

  read(nodeId: string, path: string) {
    return fsService.read(nodeId, path)
  },

  write(nodeId: string, path: string, content: string) {
    return fsService.write(nodeId, path, content)
  },

  mkdir(nodeId: string, path: string, name: string) {
    return fsService.mkdir(nodeId, path, name)
  },

  createFile(nodeId: string, path: string, name: string) {
    return fsService.create(nodeId, path, name)
  },

  delete(nodeId: string, paths: string[], reqId?: string) {
    return fsService.delete(nodeId, paths, reqId)
  },

  rename(nodeId: string, path: string, oldName: string, newName: string) {
    return fsService.rename(nodeId, path, oldName, newName)
  },

  copy(srcNodeId: string, paths: string[], to: string, dstNodeId?: string, reqId?: string) {
    return fsService.copy(srcNodeId, paths, to, dstNodeId, reqId)
  },

  move(srcNodeId: string, paths: string[], to: string, dstNodeId?: string, reqId?: string) {
    return fsService.move(srcNodeId, paths, to, dstNodeId, reqId)
  },

  // These remain HTTP-based (binary streams not suitable for WebSocket)
  upload(nodeId: string, path: string, file: File, onProgress?: (loaded: number, total: number) => void) {
    if (onProgress) {
      return new Promise<void>((resolve, reject) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('path', path)
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${getApiBase()}/fs/${nodeId}/upload`)
        const token = localStorage.getItem('fm_token')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total) }
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return request.post(`/fs/${nodeId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  async downloadUrl(nodeId: string, path: string): Promise<string> {
    try {
      const { exp, sign } = await fsService.downloadSign(nodeId, path)
      return `${getApiBase()}/fs/${nodeId}/download?path=${encodeURIComponent(path)}&exp=${exp}&sign=${sign}`
    } catch {
      return `${getApiBase()}/fs/${nodeId}/download?path=${encodeURIComponent(path)}`
    }
  },

  async presign(nodeId: string, path: string, method: 'GET' | 'PUT' = 'GET'): Promise<string> {
    const resp = await fsService.presign(nodeId, path, method)
    return resp?.url || ''
  },

  stat(nodeId: string, path: string) {
    return fsService.stat(nodeId, path)
  },

  statCancel(nodeId: string, path: string) {
    fsService.statCancel(nodeId, path)
  },

  extract(nodeId: string, path: string, dest?: string, password?: string, reqId?: string) {
    return fsService.extract(nodeId, path, dest, password, reqId)
  },

  compress(nodeId: string, paths: string[], output: string, reqId?: string) {
    return fsService.compress(nodeId, paths, output, reqId)
  },

  checkPassword(nodeId: string, path: string) {
    return fsService.checkPassword(nodeId, path)
  },

  offlineDownload(nodeId: string, path: string, urls: string[]) {
    return fsService.offlineDownload(nodeId, path, urls)
  },

  trashList(nodeId: string) {
    return fsService.trashList(nodeId)
  },

  trashRestore(nodeId: string, trashIds: string[]) {
    return fsService.trashRestore(nodeId, trashIds)
  },

  trashDelete(nodeId: string, trashIds: string[]) {
    return fsService.trashDelete(nodeId, trashIds)
  },

  trashEmpty(nodeId: string) {
    return fsService.trashEmpty(nodeId)
  },

  // Chunked upload for large files (> 10MB)
  async uploadChunked(nodeId: string, path: string, file: File, chunkSize = CHUNK_SIZE, onProgress?: (loaded: number, total: number) => void) {
    // 1. Init upload (server checks for resumable session)
    const initResp = await request.post(`/fs/${nodeId}/upload/init`, {
      path,
      filename: file.name,
      size: file.size,
      chunkSize,
    })
    const { uploadId, totalParts, direct } = initResp.data.data as {
      uploadId: string
      taskId: string
      totalParts: number
      direct: boolean
      resumed: boolean
    }

    // 2. Query completed parts (for resume)
    let completedParts = new Set<number>()
    const collectedETags: { partNum: number; etag: string }[] = []
    try {
      const partsResp = await request.get(`/fs/${nodeId}/upload/${uploadId}/parts`)
      for (const p of (partsResp.data.data.parts || [])) {
        completedParts.add(p.partNum)
        if (p.etag) collectedETags.push({ partNum: p.partNum, etag: p.etag })
      }
    } catch { /* no parts yet */ }

    const pending = Array.from({ length: totalParts }, (_, i) => i + 1)
      .filter(n => !completedParts.has(n))

    let uploadedBytes = completedParts.size * chunkSize
    if (onProgress) onProgress(Math.min(uploadedBytes, file.size), file.size)

    if (direct) {
      // === S3 direct upload mode ===
      const BATCH = 20
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH)
        const presignResp = await request.post(`/fs/${nodeId}/upload/${uploadId}/presign`, {
          partNums: batch,
        })
        const urls = presignResp.data.data.urls as Record<string, string>

        await uploadWithConcurrency(batch, CONCURRENT_CHUNKS, async (partNum) => {
          const start = (partNum - 1) * chunkSize
          const end = Math.min(start + chunkSize, file.size)
          const chunk = file.slice(start, end)

          const resp = await retryFetch(urls[String(partNum)], {
            method: 'PUT',
            body: chunk,
          }, MAX_RETRIES)
          const etag = resp.headers.get('ETag')?.replace(/"/g, '') || ''
          collectedETags.push({ partNum, etag })

          // Notify server of progress via WebSocket
          notify('upload.progress', { uploadId, partNum })
          uploadedBytes += (end - start)
          if (onProgress) onProgress(Math.min(uploadedBytes, file.size), file.size)
        })
      }
    } else {
      // === Server proxy mode (Local) ===
      await uploadWithConcurrency(pending, CONCURRENT_CHUNKS, async (partNum) => {
        const start = (partNum - 1) * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunk = file.slice(start, end)

        await request.post(
          `/fs/${nodeId}/upload/chunk?uploadId=${uploadId}&partNum=${partNum}`,
          chunk,
          { headers: { 'Content-Type': 'application/octet-stream' } },
        )
        uploadedBytes += (end - start)
        if (onProgress) onProgress(Math.min(uploadedBytes, file.size), file.size)
      })
    }

    // 3. Complete upload
    await request.post(`/fs/${nodeId}/upload/complete`, {
      uploadId,
      parts: direct
        ? collectedETags.sort((a, b) => a.partNum - b.partNum)
        : [],
    })
  },

  isChunkedUpload(file: File): boolean {
    return file.size > CHUNK_THRESHOLD
  },
}

export const resolveMediaUrl = async (nodeId: string, filePath: string): Promise<string> => {
  try {
    const url = await fsApi.presign(nodeId, filePath, 'GET')
    if (url) return url
  } catch {}
  return await fsApi.downloadUrl(nodeId, filePath)
}
