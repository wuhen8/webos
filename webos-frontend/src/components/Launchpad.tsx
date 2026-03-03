import { useState, useEffect, useRef, useCallback } from "react"
import { Search } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { getAllApps, resolveIcon, getAppConfig } from "@/config/appRegistry"
import { useWindowStore, useUIStore, useProcessStore } from "@/stores"
import { useEditorStore } from "@/apps/editor/store"

interface LaunchpadProps {
  open: boolean
  onClose: () => void
}

const ROWS = 4

function useGridLayout() {
  const [cols, setCols] = useState(() => calcCols(window.innerWidth))

  function calcCols(width: number) {
    if (width < 480) return 3
    if (width < 640) return 4
    if (width < 900) return 5
    if (width < 1100) return 6
    return 7
  }

  useEffect(() => {
    const onResize = () => setCols(calcCols(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { cols, itemsPerPage: cols * ROWS }
}

export default function Launchpad({ open, onClose }: LaunchpadProps) {
  const [query, setQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const { cols, itemsPerPage } = useGridLayout()

  const openWindow = useWindowStore((s) => s.openWindow)
  const openWebviewWindow = useWindowStore((s) => s.openWebviewWindow)
  const windows = useWindowStore((s) => s.windows)
  const activateWindow = useWindowStore((s) => s.activateWindow)
  const processes = useProcessStore((s) => s.processes)
  const openNewEditor = useEditorStore((s) => s.openNewEditor)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setCurrentPage(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Get all apps, filtered by search
  const allApps = getAllApps()
  const filteredApps = query.trim()
    ? allApps.filter((app) =>
        app.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        app.id.toLowerCase().includes(query.trim().toLowerCase())
      )
    : allApps

  const totalPages = Math.max(1, Math.ceil(filteredApps.length / itemsPerPage))
  const pageApps = filteredApps.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  )

  // Clamp page when filter changes
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1))
    }
  }, [totalPages, currentPage])

  const handleLaunch = useCallback((appId: string) => {
    onClose()
    // Check if already running — activate existing window
    const appWindows = windows.filter(w => w.type === appId || w.appId === appId)
    if (appWindows.length > 0) {
      const sorted = [...appWindows].sort((a, b) => b.zIndex - a.zIndex)
      activateWindow(sorted[0].id)
      return
    }
    // Check for background processes
    const appProcesses = processes.filter(p => p.appId === appId)
    if (appProcesses.length > 0) {
      openWindow(appId)
      return
    }
    if (appId === 'editor') {
      openNewEditor()
      return
    }
    const config = getAppConfig(appId)
    if (config.url) {
      openWebviewWindow(config.url, config.name, appId)
    } else {
      openWindow(appId)
    }
  }, [windows, processes, activateWindow, openWindow, openNewEditor, openWebviewWindow, onClose])

  // Keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "ArrowLeft") {
      if (!query) setCurrentPage((p) => Math.max(0, p - 1))
    } else if (e.key === "ArrowRight") {
      if (!query) setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
    }
  }

  // Scroll to change page
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (e.deltaX > 30) setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
      else if (e.deltaX < -30) setCurrentPage((p) => Math.max(0, p - 1))
    } else {
      if (e.deltaY > 30) setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
      else if (e.deltaY < -30) setCurrentPage((p) => Math.max(0, p - 1))
    }
  }, [totalPages])

  // Touch swipe to change page
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    touchStartRef.current = null
    // Only swipe if horizontal movement is dominant and > 50px
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
      else setCurrentPage((p) => Math.max(0, p - 1))
    }
  }, [totalPages])

  const isSmall = cols <= 4

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="launchpad"
          className="fixed inset-0 z-[9000] flex flex-col select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl" />

          {/* Search bar */}
          <div className={`relative z-10 flex justify-center ${isSmall ? 'pt-6 pb-4' : 'pt-10 pb-6'}`}>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg w-56"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "0.5px solid rgba(255,255,255,0.18)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Search className="w-3.5 h-3.5 text-white/50 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                name="launchpad-search"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCurrentPage(0)
                }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={(e) => {
                  composingRef.current = false
                  setQuery((e.target as HTMLInputElement).value)
                  setCurrentPage(0)
                }}
                placeholder="搜索"
                className="flex-1 bg-transparent text-[0.8125rem] text-white placeholder:text-white/40 outline-none"
              />
            </div>
          </div>

          {/* App grid */}
          <div
            ref={containerRef}
            className={`relative z-10 flex-1 flex items-start justify-center overflow-hidden ${isSmall ? 'px-4 pt-2' : 'px-16 pt-4'}`}
          >
            <motion.div
              key={currentPage}
              className="grid gap-y-8 gap-x-4 justify-items-center"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${isSmall ? '4.5rem' : '5.5rem'})`,
              }}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              {pageApps.map((app) => {
                const Icon = resolveIcon(app.icon)
                return (
                  <button
                    key={app.id}
                    className={`flex flex-col items-center gap-1.5 group ${isSmall ? 'w-[4.5rem]' : 'w-[5.5rem]'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleLaunch(app.id)
                    }}
                  >
                    <div
                      className={`${isSmall ? 'w-13 h-13' : 'w-16 h-16'} rounded-[1rem] bg-gradient-to-br ${app.gradient} flex items-center justify-center shadow-lg ${app.shadow} group-hover:scale-110 group-active:scale-95 transition-transform duration-150`}
                      style={{
                        border: "0.5px solid rgba(255,255,255,0.25)",
                      }}
                    >
                      <Icon className={`${isSmall ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />
                    </div>
                    <span className="text-[0.6875rem] text-white/90 leading-tight text-center truncate w-full px-1">
                      {app.name}
                    </span>
                  </button>
                )
              })}
            </motion.div>
          </div>

          {/* Page dots */}
          {totalPages > 1 && (
            <div className={`relative z-10 flex justify-center gap-1.5 ${isSmall ? 'pb-16' : 'pb-20'} pt-4`}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    i === currentPage
                      ? "bg-white scale-110"
                      : "bg-white/30 hover:bg-white/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentPage(i)
                  }}
                />
              ))}
            </div>
          )}

          {/* Bottom spacer for dock */}
          {totalPages <= 1 && <div className={isSmall ? 'pb-16' : 'pb-20'} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
