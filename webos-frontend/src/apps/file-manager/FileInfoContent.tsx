import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { FileInfo } from '@/types'
import { fsApi } from '@/lib/storageApi'
import { formatFileSize, getFileIconConfig } from '@/utils'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { registerMessageHandler } from '@/stores/webSocketStore'

function formatFullTime(timeStr: string): string {
  if (!timeStr) return '-'
  try {
    const d = new Date(timeStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return '-'
  }
}

export default function FileInfoContent({ windowId }: { windowId: string }) {
  const { procState } = useCurrentProcess(windowId)
  const appData = procState as { nodeId?: string; path?: string; fileName?: string }

  const [info, setInfo] = useState<FileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dirSize, setDirSize] = useState<{ size: number; itemCount: number } | null>(null)
  const [dirSizeLoading, setDirSizeLoading] = useState(false)

  useEffect(() => {
    if (!appData.nodeId || !appData.path) return
    setLoading(true)
    setError('')
    setDirSize(null)
    fsApi.stat(appData.nodeId, appData.path)
      .then((data) => {
        setInfo(data)
        if (data.isDir) setDirSizeLoading(true)
      })
      .catch((e: any) => setError(e?.message || '获取文件信息失败'))
      .finally(() => setLoading(false))
    // Cancel dir size calculation on unmount
    const nodeId = appData.nodeId
    const path = appData.path
    return () => {
      fsApi.statCancel(nodeId, path)
    }
  }, [appData.nodeId, appData.path])

  // Listen for async dir size push
  useEffect(() => {
    if (!appData.nodeId || !appData.path) return
    const unsub = registerMessageHandler((msg: any) => {
      if (msg.method === 'fs.stat_size' && msg.params?.path === appData.path && msg.params?.nodeId === appData.nodeId) {
        setDirSize({ size: msg.params.size, itemCount: msg.params.itemCount })
        setDirSizeLoading(false)
        return true
      }
      return false
    })
    return unsub
  }, [appData.nodeId, appData.path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      </div>
    )
  }

  if (!info) return null

  const iconConfig = getFileIconConfig(info)
  const Icon = iconConfig.icon

  const sizeValue = info.isDir
    ? (dirSize ? formatFileSize(dirSize.size) + (dirSize.size > 0 ? ` (${dirSize.size.toLocaleString()} 字节)` : '') : null)
    : formatFileSize(info.size) + (info.size > 0 ? ` (${info.size.toLocaleString()} 字节)` : '')

  const rows: { label: string; value: string | null; loading?: boolean }[] = [
    { label: '名称', value: info.name },
    { label: '路径', value: info.path },
    { label: '类型', value: info.isDir ? '文件夹' : (info.extension ? info.extension.toUpperCase().replace('.', '') + ' 文件' : '文件') },
    { label: '大小', value: sizeValue, loading: info.isDir && dirSizeLoading },
    ...(info.isDir ? [{ label: '包含', value: dirSize ? `${dirSize.itemCount} 个项目` : null, loading: dirSizeLoading }] : []),
    { label: '修改时间', value: formatFullTime(info.modifiedTime) },
    ...(!info.isDir && info.extension ? [{ label: '扩展名', value: info.extension }] : []),
  ]

  return (
    <div className="flex flex-col h-full p-4 gap-4 select-none">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
          <Icon className={`h-7 w-7 ${iconConfig.className.replace('h-5 w-5', '').trim()}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{info.name}</p>
          <p className="text-xs text-gray-500">
            {info.isDir ? '文件夹' : (info.extension ? info.extension.toUpperCase().replace('.', '') + ' 文件' : '文件')}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0 text-right">{row.label}</span>
            {row.loading ? (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                计算中...
              </span>
            ) : (
              <span className="text-xs text-gray-800 break-all flex-1">{row.value ?? '-'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
