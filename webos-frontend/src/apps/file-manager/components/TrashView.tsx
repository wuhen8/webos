import { useState, useEffect, useCallback } from "react"
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

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

export function TrashView({ activeNodeId, toast }: TrashViewProps) {
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
      toast({ title: "已还原", description: `已还原 ${ids.length} 个项目` })
      setSelected(new Set())
      loadTrash()
    } catch {
      toast({ title: "还原失败", description: "还原时出错", variant: "destructive" })
    }
  }

  const handlePermanentDelete = (ids: string[]) => {
    const count = ids.length
    showConfirm({
      title: "永久删除",
      description: count === 1 ? "确定要永久删除此项目吗？此操作不可恢复。" : `确定要永久删除 ${count} 个项目吗？此操作不可恢复。`,
      confirmText: "永久删除",
      variant: "destructive",
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      onConfirm: async () => {
        try {
          await fsApi.trashDelete(activeNodeId, ids)
          toast({ title: "已删除", description: `已永久删除 ${count} 个项目` })
          setSelected(new Set())
          loadTrash()
        } catch {
          toast({ title: "删除失败", description: "删除时出错", variant: "destructive" })
        }
      },
    })
  }

  const handleEmptyTrash = () => {
    showConfirm({
      title: "清空回收站",
      description: "确定要清空回收站吗？所有项目将被永久删除，此操作不可恢复。",
      confirmText: "清空",
      variant: "destructive",
      icon: <Trash2 className="h-5 w-5 text-red-600" />,
      onConfirm: async () => {
        try {
          await fsApi.trashEmpty(activeNodeId)
          toast({ title: "已清空", description: "回收站已清空" })
          setSelected(new Set())
          loadTrash()
        } catch {
          toast({ title: "清空失败", description: "清空回收站时出错", variant: "destructive" })
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
        <span className="text-sm font-medium text-slate-700">回收站</span>
        <span className="text-xs text-slate-400">{items.length} 个项目</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={loadTrash} title="刷新">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {selectedItems.length > 0 && (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleRestore(selectedItems.map(i => i.id))}>
              <RotateCcw className="h-3.5 w-3.5" /> 还原 ({selectedItems.length})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={() => handlePermanentDelete(selectedItems.map(i => i.id))}>
              <XCircle className="h-3.5 w-3.5" /> 永久删除 ({selectedItems.length})
            </Button>
          </>
        )}
        {items.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={handleEmptyTrash}>
            <Trash2 className="h-3.5 w-3.5" /> 清空回收站
          </Button>
        )}
      </div>

      {/* Column header */}
      <div className="flex items-center px-4 py-1.5 text-xs text-slate-500 border-b border-white/10 bg-white/5">
        <span className="flex-1">名称</span>
        <span className="w-48 text-right">原始位置</span>
        <span className="w-28 text-right">大小</span>
        <span className="w-40 text-right">删除时间</span>
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
            <span className="text-sm">回收站为空</span>
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
            <span className="w-40 text-right text-xs text-slate-400">{formatTime(item.deletedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
