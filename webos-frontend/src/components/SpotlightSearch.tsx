import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { Search, Loader2 } from "lucide-react"
import { useWindowStore, useProcessStore } from "@/stores"
import { useFileManagerStore } from "@/apps/file-manager/store"
import { fsService } from "@/lib/services"
import { getFileIconConfig, formatFileSize } from "@/utils"
import type { FileInfo } from "@/types"

interface SpotlightSearchProps {
  open: boolean
  onClose: () => void
}

export function SpotlightSearch({ open, onClose }: SpotlightSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const reqRef = useRef(0)
  const composingRef = useRef(false)

  const windows = useWindowStore((s) => s.windows)
  const openWindow = useWindowStore((s) => s.openWindow)
  const activateWindow = useWindowStore((s) => s.activateWindow)
  const updateFmTabState = useFileManagerStore((s) => s.updateFmTabState)

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setSelectedIndex(0)
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Get active nodeId from the current file manager window, fallback to local_1
  const getActiveNodeId = useCallback((): string => {
    const fmWindow = windows.find((w) => w.type === "fileManager")
    if (fmWindow) {
      const proc = useProcessStore.getState().getProcess(fmWindow.pid)
      const procState = (proc?.state || {}) as Record<string, any>
      const tabIndex = procState.activeFmTabIndex ?? 0
      const fmTabs = procState.fmTabs as Array<{ activeNodeId?: string }> | undefined
      return fmTabs?.[tabIndex]?.activeNodeId || "local_1"
    }
    return "local_1"
  }, [windows])

  // Debounced search
  const doSearch = useCallback((keyword: string) => {
    if (!keyword.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    const reqId = ++reqRef.current
    const nodeId = getActiveNodeId()
    setLoading(true)
    fsService.search(nodeId, "/", keyword.trim()).then((res) => {
      if (reqId !== reqRef.current) return
      setResults(res || [])
      setSelectedIndex(0)
      setLoading(false)
    }).catch(() => {
      if (reqId !== reqRef.current) return
      setResults([])
      setLoading(false)
    })
  }, [getActiveNodeId])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (composingRef.current) return
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Navigate to file in file manager
  const navigateToFile = useCallback((file: FileInfo) => {
    onClose()
    const nodeId = getActiveNodeId()
    const parentPath = file.path.substring(0, file.path.lastIndexOf("/")) || "/"
    const title = parentPath.split("/").filter(Boolean).pop() || "/"

    // Find existing file manager window
    const fmWindow = windows.find((w) => w.type === "fileManager")
    if (fmWindow) {
      activateWindow(fmWindow.id)
      const proc = useProcessStore.getState().getProcess(fmWindow.pid)
      const procState = (proc?.state || {}) as Record<string, any>
      const tabIndex = procState.activeFmTabIndex ?? 0
      updateFmTabState(fmWindow.id, tabIndex, {
        activeNodeId: nodeId,
        currentPath: parentPath,
        history: [parentPath],
        historyIndex: 0,
        selectedFiles: [file.path],
        title,
      })
    } else {
      openWindow("fileManager", { forceNew: true })
      // After opening, navigate the new window
      setTimeout(() => {
        const newFm = useWindowStore.getState().windows.find((w) => w.type === "fileManager")
        if (newFm) {
          updateFmTabState(newFm.id, 0, {
            activeNodeId: nodeId,
            currentPath: parentPath,
            history: [parentPath],
            historyIndex: 0,
            selectedFiles: [file.path],
            title,
          })
        }
      }, 100)
    }
  }, [windows, activateWindow, openWindow, updateFmTabState, onClose, getActiveNodeId])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement
    if (item) item.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (results[selectedIndex]) navigateToFile(results[selectedIndex])
        break
      case "Escape":
        e.preventDefault()
        onClose()
        break
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Search panel */}
      <div
        className="relative w-[40rem] max-w-[90vw] overflow-hidden rounded-2xl"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(60px) saturate(1.8)",
          WebkitBackdropFilter: "blur(60px) saturate(1.8)",
          boxShadow:
            "0 24px 80px -16px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.9)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06]">
          {loading ? (
            <Loader2 className="w-5 h-5 text-black/30 animate-spin shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-black/30 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={(e) => {
              composingRef.current = false
              handleInputChange((e.target as HTMLInputElement).value)
            }}
            placeholder={t('spotlight.placeholder')}
            className="flex-1 bg-transparent text-[0.9375rem] text-black/90 placeholder:text-black/30 outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus() }}
              className="text-[0.75rem] text-black/40 hover:text-black/60 px-1.5 py-0.5 rounded bg-black/[0.04] hover:bg-black/[0.08] transition-colors"
            >
              {t('spotlight.clear')}
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
            {results.map((file, idx) => {
              const iconConfig = getFileIconConfig(file)
              const Icon = iconConfig.icon
              const parentDir = file.path.substring(0, file.path.lastIndexOf("/")) || "/"
              return (
                <div
                  key={file.path}
                  className={`flex items-center gap-3 px-4 py-2 mx-1 rounded-lg cursor-default transition-colors ${
                    idx === selectedIndex
                      ? "bg-blue-500/90 text-white"
                      : "hover:bg-black/[0.04]"
                  }`}
                  onClick={() => navigateToFile(file)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${
                    idx === selectedIndex ? "text-white/90" : iconConfig.className
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[0.8125rem] font-medium truncate ${
                      idx === selectedIndex ? "text-white" : "text-black/85"
                    }`}>
                      {file.name}
                    </div>
                    <div className={`text-[0.6875rem] truncate ${
                      idx === selectedIndex ? "text-white/60" : "text-black/35"
                    }`}>
                      {parentDir}
                    </div>
                  </div>
                  {!file.isDir && (
                    <span className={`text-[0.6875rem] shrink-0 ${
                      idx === selectedIndex ? "text-white/50" : "text-black/25"
                    }`}>
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {query && !loading && results.length === 0 && (
          <div className="py-8 text-center text-[0.8125rem] text-black/30">
            {t('spotlight.noResults')}
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-black/[0.06] text-[0.6875rem] text-black/25">
          <span>{t('spotlight.footerHint')}</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  )
}

export default SpotlightSearch
