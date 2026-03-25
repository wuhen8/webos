import { useRef, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { Folder, X, Plus } from "lucide-react"
import { fmDragTabRef } from "@/stores"

const DRAG_MIME = "application/x-webos-files"

interface TabBarProps {
  fmTabs: any[]
  activeFmTabIndex: number
  windowId: string
  addFmTab: (windowId: string) => void
  closeFmTab: (windowId: string, index: number) => void
  switchFmTab: (windowId: string, index: number) => void
  reorderFmTabs: (windowId: string, from: number, to: number) => void
}

export function TabBar({ fmTabs, activeFmTabIndex, windowId, addFmTab, closeFmTab, switchFmTab, reorderFmTabs }: TabBarProps) {
  const { t } = useTranslation()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverIndexRef = useRef<number | null>(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
    hoverIndexRef.current = null
  }, [])

  const startHoverTimer = useCallback((index: number) => {
    if (hoverIndexRef.current === index) return // already timing this tab
    clearHoverTimer()
    hoverIndexRef.current = index
    hoverTimerRef.current = setTimeout(() => {
      switchFmTab(windowId, index)
      hoverTimerRef.current = null
      hoverIndexRef.current = null
    }, 600)
  }, [windowId, switchFmTab, clearHoverTimer])

  return (
    <div className="flex items-center h-11 px-2 bg-white/40 backdrop-blur-2xl border-b border-slate-200/60 overflow-x-auto gap-1">
      {fmTabs.map((tab: any, index: number) => (
        <div
          key={tab.id}
          draggable
          onDragStart={(e) => {
            fmDragTabRef.current = { windowId, fromIndex: index }
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", String(index))
          }}
          onDragOver={(e) => {
            e.preventDefault()
            // File drag hover → start switch timer
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.dataTransfer.dropEffect = "move"
              startHoverTimer(index)
            } else {
              e.dataTransfer.dropEffect = "move"
            }
          }}
          onDragEnter={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault()
              startHoverTimer(index)
            }
          }}
          onDragLeave={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
              clearHoverTimer()
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            const dragging = fmDragTabRef.current
            fmDragTabRef.current = null
            if (!dragging || dragging.windowId !== windowId || dragging.fromIndex === index) return
            reorderFmTabs(windowId, dragging.fromIndex, index)
          }}
          onDragEnd={() => { fmDragTabRef.current = null; clearHoverTimer() }}
          onClick={() => switchFmTab(windowId, index)}
          className={`group flex items-center gap-2 px-3 py-1.5 min-w-[6.25rem] max-w-[11.25rem] cursor-pointer rounded-lg transition-all duration-200 ${
            index === activeFmTabIndex
              ? "bg-white shadow-sm text-slate-800 border border-slate-200/80"
              : "bg-transparent text-slate-600 hover:bg-white/60 border border-transparent"
          }`}
        >
          <Folder className={`h-3.5 w-3.5 flex-shrink-0 ${index === activeFmTabIndex ? "text-blue-500" : "text-slate-400"}`} />
          <span className="text-xs font-medium truncate flex-1">{tab.title}</span>
          <button
            onClick={(e) => { e.stopPropagation(); closeFmTab(windowId, index) }}
            className="opacity-0 group-hover:opacity-100 hover:bg-slate-200/80 rounded p-0.5 transition-all"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        onClick={() => addFmTab(windowId)}
        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all"
        title={t('apps.fileManager.tabBar.newTab')}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
