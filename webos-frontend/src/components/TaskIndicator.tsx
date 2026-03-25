import { useState, useRef, useEffect } from "react"
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, Trash2, X, RotateCcw } from "lucide-react"
import { useTaskStore, type BackgroundTask } from "@/stores/taskStore"
import { taskService } from "@/lib/services"
import { openTaskDetailWindow } from "@/components/TaskDetailWindow"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + "/s"
}

// Track previous bytesCurrent for speed calculation
const speedSnapshots = new Map<string, { bytes: number; time: number; speed: number }>()

function getSpeed(taskId: string, bytesCurrent: number): number {
  const now = Date.now()
  const prev = speedSnapshots.get(taskId)
  if (!prev) {
    speedSnapshots.set(taskId, { bytes: bytesCurrent, time: now, speed: 0 })
    return 0
  }
  // Only recalculate when bytes actually changed
  if (bytesCurrent === prev.bytes) return prev.speed
  const dt = (now - prev.time) / 1000
  if (dt < 0.3) return prev.speed
  const speed = (bytesCurrent - prev.bytes) / dt
  speedSnapshots.set(taskId, { bytes: bytesCurrent, time: now, speed })
  return speed
}

function TaskProgress({ task }: { task: BackgroundTask }) {
  const { t } = useTranslation()
  if (task.status !== "running" || task.progress == null) return null

  const pct = Math.round(task.progress * 100)
  const hasBytes = (task.bytesTotal ?? 0) > 0
  const speed = hasBytes ? getSpeed(task.id, task.bytesCurrent ?? 0) : 0

  return (
    <div className="mt-1 space-y-0.5">
      {/* Progress bar */}
      <div className="h-[3px] rounded-full bg-black/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Info line */}
      <div className="flex items-center justify-between text-[0.5625rem] text-black/40">
        <span>
          {hasBytes
            ? `${formatBytes(task.bytesCurrent ?? 0)} / ${formatBytes(task.bytesTotal ?? 0)}`
            : (task.itemTotal ?? 0) > 0
              ? t('task.itemsProgress', { current: task.itemCurrent ?? 0, total: task.itemTotal })
              : ""}
        </span>
        <span>
          {hasBytes && speed > 0 ? formatSpeed(speed) + "  " : ""}
          {pct}%
        </span>
      </div>
    </div>
  )
}

function IndeterminateProgress() {
  return (
    <div className="mt-1 h-[3px] rounded-full bg-black/[0.06] overflow-hidden">
      <div className="h-full w-1/3 rounded-full bg-blue-400/60 animate-indeterminate" />
    </div>
  )
}

export function TaskIndicator() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const clearCompleted = useTaskStore((s) => s.clearCompleted)
  const taskCancel = taskService.cancel
  const taskRetry = taskService.retry
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const runningCount = tasks.filter((t) => t.status === "running").length
  const hasCompleted = tasks.some((t) => t.status !== "running")

  // Clamp dropdown position so it doesn't overflow the viewport
  useEffect(() => {
    if (!open || !dropdownRef.current) return
    const el = dropdownRef.current
    // Reset any previous adjustment
    el.style.right = ''
    el.style.left = ''
    // Wait for layout
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const margin = 8
      const parentRect = el.offsetParent?.getBoundingClientRect() ?? rect

      // Right edge: ensure margin from viewport right
      const rightOverflow = rect.right - (window.innerWidth - margin)
      if (rightOverflow > 0) {
        el.style.right = `${rightOverflow}px`
      } else {
        el.style.right = '0'
      }

      // Re-check left edge after right adjustment
      const updatedRect = el.getBoundingClientRect()
      if (updatedRect.left < margin) {
        el.style.right = 'auto'
        el.style.left = `${margin - parentRect.left}px`
      }
    })
  }, [open])

  // Clean up speed snapshots for completed tasks
  useEffect(() => {
    const activeIds = new Set(tasks.filter(t => t.status === "running").map(t => t.id))
    for (const id of speedSnapshots.keys()) {
      if (!activeIds.has(id)) speedSnapshots.delete(id)
    }
  }, [tasks])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (tasks.length === 0) return null

  const statusIcon = (task: BackgroundTask) => {
    if (task.status === "running")
      return <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
    if (task.status === "success")
      return <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
    return <XCircle className="w-3 h-3 text-red-500 shrink-0" />
  }

  const statusBtnClass = [
    "flex items-center justify-center",
    "w-[1.625rem] h-[1.125rem] rounded-[0.25rem]",
    "hover:bg-black/[0.06] active:bg-black/[0.1]",
    "transition-colors duration-100",
  ].join(" ")

  return (
    <div className="relative" ref={panelRef}>
      <button className={statusBtnClass} onClick={() => setOpen(!open)}>
        {runningCount > 0 ? (
          <Loader2 className="w-[0.875rem] h-[0.875rem] text-blue-600 animate-spin" strokeWidth={2} />
        ) : (
          <CheckCircle2 className="w-[0.875rem] h-[0.875rem] text-green-600" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-[1.5rem] w-[18rem] max-w-[calc(100vw-1.5rem)] rounded-[0.875rem] overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            boxShadow: '0 24px 80px -16px rgba(0,0,0,0.18), 0 8px 24px -8px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06), inset 0 0.5px 0 rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          <div className="px-3 py-2 border-b border-black/[0.06]">
            <span className="text-[0.75rem] font-semibold text-black/70">
              {t('task.indicator.title', {
                runningCount,
                suffix: runningCount > 0 ? t('task.indicator.runningSuffix', { count: runningCount }) : '',
              })}
            </span>
          </div>
          <div className="max-h-[15rem] overflow-auto" style={{ scrollbarWidth: 'thin' }}>
            {tasks.map((task) => (
              <div key={task.id} className="group px-3 py-1.5 hover:bg-black/[0.03] cursor-pointer" onClick={() => { openTaskDetailWindow(task.id, task.title); setOpen(false) }}>
                <div className="flex items-center gap-2">
                  {statusIcon(task)}
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.6875rem] text-black/80 truncate">
                      {task.title}
                      {task.status === "running" && task.message && (
                        <span className="text-black/40 ml-1">— {task.message}</span>
                      )}
                    </div>
                    {task.message && task.status === "failed" && (
                      <div className="text-[0.625rem] text-red-500/80 truncate">{task.message}</div>
                    )}
                  </div>
                  {task.status === "running" && task.cancellable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); taskCancel(task.id) }}
                      className="shrink-0 p-0.5 rounded hover:bg-black/[0.08] text-black/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title={t('task.actions.cancel')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {task.status === "failed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); taskRetry(task.id) }}
                      className="shrink-0 p-0.5 rounded hover:bg-black/[0.08] text-black/30 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                      title={t('task.actions.retry')}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {task.status === "running" && (
                  task.progress != null
                    ? <TaskProgress task={task} />
                    : <IndeterminateProgress />
                )}
              </div>
            ))}
          </div>
          {hasCompleted && (
            <div className="px-3 py-1.5 border-t border-black/[0.06]">
              <button
                onClick={() => { clearCompleted(); if (tasks.filter(t => t.status === 'running').length === 0) setOpen(false) }}
                className="flex items-center gap-1 text-[0.6875rem] text-black/40 hover:text-black/70 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> {t('task.actions.clearCompleted')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TaskIndicator
