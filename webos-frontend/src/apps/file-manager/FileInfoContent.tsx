import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { FileInfo } from '@/types'
import { fsApi } from '@/lib/storageApi'
import { formatFileSize, getFileIconConfig } from '@/utils'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { registerMessageHandler } from '@/stores/webSocketStore'

function formatFullTime(timeStr: string, fallback: string): string {
  if (!timeStr) return fallback
  try {
    const d = new Date(timeStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return fallback
  }
}

export default function FileInfoContent({ windowId }: { windowId: string }) {
  const { t } = useTranslation()
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
      .catch((e: any) => setError(e?.message || t('apps.fileManager.info.loadFailed')))
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
  const fileType = info.isDir
    ? t('apps.fileManager.info.types.folder')
    : (info.extension
        ? t('apps.fileManager.info.types.extensionFile', { extension: info.extension.toUpperCase().replace('.', '') })
        : t('apps.fileManager.info.types.file'))

  const sizeValue = info.isDir
    ? (dirSize
        ? formatFileSize(dirSize.size) + (dirSize.size > 0 ? ` (${t('apps.fileManager.info.bytes', { count: dirSize.size.toLocaleString() })})` : '')
        : null)
    : formatFileSize(info.size) + (info.size > 0 ? ` (${t('apps.fileManager.info.bytes', { count: info.size.toLocaleString() })})` : '')

  const rows: { label: string; value: string | null; loading?: boolean }[] = [
    { label: t('apps.fileManager.info.labels.name'), value: info.name },
    { label: t('apps.fileManager.info.labels.path'), value: info.path },
    { label: t('apps.fileManager.info.labels.type'), value: fileType },
    { label: t('apps.fileManager.info.labels.size'), value: sizeValue, loading: info.isDir && dirSizeLoading },
    ...(info.isDir ? [{ label: t('apps.fileManager.info.labels.contains'), value: dirSize ? t('apps.fileManager.info.itemCount', { count: dirSize.itemCount }) : null, loading: dirSizeLoading }] : []),
    { label: t('apps.fileManager.info.labels.modifiedTime'), value: formatFullTime(info.modifiedTime, t('apps.fileManager.info.unknown')) },
    ...(!info.isDir && info.extension ? [{ label: t('apps.fileManager.info.labels.extension'), value: info.extension }] : []),
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
            {fileType}
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
                {t('apps.fileManager.info.calculating')}
              </span>
            ) : (
              <span className="text-xs text-gray-800 break-all flex-1">{row.value ?? t('apps.fileManager.info.unknown')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
