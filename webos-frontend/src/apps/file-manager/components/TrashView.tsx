import { useState, useEffect, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { Trash2, RotateCcw, XCircle, Folder, File, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fsApi } from "@/lib/storageApi"
import { useUIStore } from "@/stores"
import { registerMessageHandler } from "@/stores/webSocketStore"

interface TrashItem {
  id: string
  name: string
  originalPath: string
  isDir: boolean
  size: number
  deletedAt: number
}

interface TrashViewProps {
  activeNodeId: string
  toast: (opts: any) => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i]
}

function formatTime(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleString(locale)
}

export function TrashView({ activeNodeId, toast }: TrashViewProps) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const showConfirm = useUIStore((s) => s.showConfirm)

  const loadTrash = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fsApi.trashList(activeNodeId)
      setItems(Array.isArray(list) ? list : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeNodeId])

  useEffect(() => { loadTrash() }, [loadTrash])

  // Reload trash list when files are deleted (moved to trash) from file manager
  useEffect(() => {
    return registerMessageHandler((msg: any) => {
      if (msg.method === 'fs.trash_changed' && msg.params?.nodeId === activeNodeId) {
        loadTrash()
        return true
      }
      return false
    })
  }, [activeNodeId, loadTrash])

  const handleRestore = async (ids: string[]) => {
    try {
      await fsApi.trashRestore(activeNodeId, ids)
      toast({ title: t('apps.fileManager.trash.restored'), description: t('apps.fileManager.trash.restoredCount', { count: ids.length }) })
      setSelected(new Set())
      loadTrash()
    } catch {
      toast({ title: t('apps.fileManager.trash.restoreFailed'), description: t('apps.fileManager.trash.restoreError'), variant: "destructive" })
    }
  }

  const handlePermanentDelete = (ids: string[]) => {
    const count = ids.length
    showConfirm({
      title: t('apps.fileManager.trash.permanentDelete'),
      description: count === 1 ? t('apps.fileManager.trash.confirmPermanentDeleteOne') : t('apps.fileManager.trash.confirmPermanentDeleteMany', { count }),
      confirmText: t('apps.fileManager.trash.permanentDelete'),
      variant: "destructive",
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      onConfirm: async () => {
        try {
          await fsApi.trashDelete(activeNodeId, ids)
          toast({ title: t('apps.fileManager.trash.deleted'), description: t('apps.fileManager.trash.deletedCount', { count }) })
          setSelected(new Set())
          loadTrash()
        } catch {
          toast({ title: t('apps.fileManager.trash.deleteFailed'), description: t('apps.fileManager.trash.deleteError'), variant: "destructive" })
        }
      },
    })
  }

  const handleEmptyTrash = () => {
    showConfirm({
      title: t('apps.fileManager.trash.emptyTrash'),
      description: t('apps.fileManager.trash.confirmEmpty'),
      confirmText: t('apps.fileManager.trash.empty'),
      variant: "destructive",
      icon: <Trash2 className="h-5 w-5 text-red-600" />,
      onConfirm: async () => {
        try {
          await fsApi.trashEmpty(activeNodeId)
          toast({ title: t('apps.fileManager.trash.emptied'), description: t('apps.fileManager.trash.emptiedDescription') })
          setSelected(new Set())
          loadTrash()
        } catch {
          toast({ title: t('apps.fileManager.trash.emptyFailed'), description: t('apps.fileManager.trash.emptyError'), variant: "destructive" })
        }
      },
    })
  }

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    const next = new Set(selected)
    if (e.ctrlKey || e.metaKey) {
      if (next.has(id)) next.delete(id); else next.add(id)
    } else {
      if (next.size === 1 && next.has(id)) next.clear()
      else { next.clear(); next.add(id) }
    }
    setSelected(next)
  }

  const selectedItems = items.filter(i => selected.has(i.id))

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/20 bg-white/5">
        <Trash2 className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">{t('apps.fileManager.trash.title')}</span>
        <span className="text-xs text-slate-400">{t('apps.fileManager.trash.itemCount', { count: items.length })}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={loadTrash} title={t('apps.fileManager.trash.refresh')}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {selectedItems.length > 0 && (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleRestore(selectedItems.map(i => i.id))}>
              <RotateCcw className="h-3.5 w-3.5" /> {t('apps.fileManager.trash.restore')} ({selectedItems.length})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={() => handlePermanentDelete(selectedItems.map(i => i.id))}>
              <XCircle className="h-3.5 w-3.5" /> {t('apps.fileManager.trash.permanentDelete')} ({selectedItems.length})
            </Button>
          </>
        )}
        {items.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={handleEmptyTrash}>
            <Trash2 className="h-3.5 w-3.5" /> {t('apps.fileManager.trash.emptyTrash')}
          </Button>
        )}
      </div>

      {/* Column header */}
      <div className="flex items-center px-4 py-1.5 text-xs text-slate-500 border-b border-white/10 bg-white/5">
        <span className="flex-1">{t('apps.fileManager.columns.name')}</span>
        <span className="w-48 text-right">{t('apps.fileManager.trash.originalLocation')}</span>
        <span className="w-28 text-right">{t('apps.fileManager.columns.size')}</span>
        <span className="w-40 text-right">{t('apps.fileManager.trash.deletedTime')}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" onClick={() => setSelected(new Set())}>
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Trash2 className="h-8 w-8 mb-2 opacity-30" />
            <span className="text-sm">{t('apps.fileManager.trash.emptyState')}</span>
          </div>
        )}
        {!loading && items.map(item => (
          <div
            key={item.id}
            className={`flex items-center px-4 py-1.5 text-sm cursor-pointer hover:bg-white/10 ${
              selected.has(item.id) ? "bg-blue-500/15" : ""
            }`}
            onClick={(e) => { e.stopPropagation(); toggleSelect(item.id, e) }}
          >
            <div className="flex items-center flex-1 min-w-0 gap-2">
              {item.isDir ? <Folder className="h-4 w-4 text-blue-400 shrink-0" /> : <File className="h-4 w-4 text-slate-400 shrink-0" />}
              <span className="truncate text-slate-700">{item.name}</span>
            </div>
            <span className="w-48 text-right text-xs text-slate-400 truncate" title={item.originalPath}>
              {item.originalPath.substring(0, item.originalPath.lastIndexOf("/")) || "/"}
            </span>
            <span className="w-28 text-right text-xs text-slate-400">{item.isDir ? "-" : formatSize(item.size)}</span>
            <span className="w-40 text-right text-xs text-slate-400">{formatTime(item.deletedAt, i18n.resolvedLanguage || i18n.language)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
