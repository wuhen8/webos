import { useEffect, useRef } from 'react'
import { Loader2, CheckCircle2, XCircle, AlertCircle, X, RotateCcw } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useProcessStore } from '@/stores/processStore'
import { useWindowStore } from '@/stores/windowStore'
import { taskService } from '@/lib/services'
import { useShallow } from 'zustand/shallow'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + '/s'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m}m${rs}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

const speedSnapshots = new Map<string, { bytes: number; time: number; speed: number }>()
function getSpeed(taskId: string, bytesCurrent: number): number {
  const now = Date.now()
  const prev = speedSnapshots.get(taskId)
  if (!prev) { speedSnapshots.set(taskId, { bytes: bytesCurrent, time: now, speed: 0 }); return 0 }
  if (bytesCurrent === prev.bytes) return prev.speed
  const dt = (now - prev.time) / 1000
  if (dt < 0.3) return prev.speed
  const speed = (bytesCurrent - prev.bytes) / dt
  speedSnapshots.set(taskId, { bytes: bytesCurrent, time: now, speed })
  return speed
}

const typeLabel: Record<string, string> = {
  fs_copy: '文件复制', fs_move: '文件移动', fs_delete: '文件删除',
  upload: '文件上传', download: '文件下载',
  docker_pull: 'Docker 拉取', appstore_install: '应用安装',
}

const statusConfig: Record<string, { icon: typeof Loader2; color: string; label: string }> = {
  running: { icon: Loader2, color: 'text-blue-500', label: '运行中' },
  success: { icon: CheckCircle2, color: 'text-green-500', label: '已完成' },
  failed:  { icon: XCircle, color: 'text-red-500', label: '失败' },
  cancelled: { icon: AlertCircle, color: 'text-amber-500', label: '已取消' },
}

function LogPanel({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs.length])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="text-[0.6875rem] font-medium text-black/50 mb-1">日志</div>
      <div
        className="flex-1 min-h-0 overflow-auto rounded-lg bg-black/[0.03] border border-black/[0.06] p-2 font-mono text-[0.625rem] leading-relaxed"
        style={{ scrollbarWidth: 'thin' }}
      >
        {logs.length === 0 && <div className="text-black/30 text-center py-4">暂无日志</div>}
        {logs.map((line, i) => (
          <div key={i} className="py-0.5 text-black/70 break-all whitespace-pre-wrap">
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function useTaskId(windowId: string): string {
  const pid = useWindowStore((s) => s.windows.find(w => w.id === windowId)?.pid)
  return useProcessStore((s) => {
    if (!pid) return ''
    const proc = s.processes.find(p => p.pid === pid)
    return (proc?.state?.taskId as string) || ''
  })
}

export default function TaskDetailWindow({ windowId }: { windowId: string }) {
  const taskId = useTaskId(windowId)

  // Use useShallow to do shallow comparison on the extracted fields,
  // preventing re-renders when the task object reference changes but values are the same
  const task = useTaskStore(useShallow((s) => {
    const t = s.tasks.find(x => x.id === taskId)
    if (!t) return null
    return {
      id: t.id, type: t.type, title: t.title, status: t.status,
      message: t.message, createdAt: t.createdAt, doneAt: t.doneAt,
      progress: t.progress, itemCurrent: t.itemCurrent, itemTotal: t.itemTotal,
      bytesCurrent: t.bytesCurrent, bytesTotal: t.bytesTotal, cancellable: t.cancellable,
      outputMode: t.outputMode, logs: t.logs,
    }
  }))

  const taskTitle = task?.title
  useEffect(() => {
    if (taskTitle) useWindowStore.getState().updateWindowTitle(windowId, `任务详情 - ${taskTitle}`)
  }, [taskTitle, windowId])

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-black/40 text-[0.75rem]">
        任务不存在或已被清除
      </div>
    )
  }

  const cfg = statusConfig[task.status] || statusConfig.running
  const StatusIcon = cfg.icon
  const isLogMode = task.outputMode === 'log'
  const pct = task.progress != null ? Math.round(task.progress * 100) : null
  const hasBytes = (task.bytesTotal ?? 0) > 0
  const speed = hasBytes && task.status === 'running' ? getSpeed(task.id, task.bytesCurrent ?? 0) : 0

  return (
    <div className="h-full flex flex-col p-4 gap-3 select-text" style={{ fontSize: '0.75rem' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <StatusIcon className={`w-5 h-5 ${cfg.color} ${task.status === 'running' ? 'animate-spin' : ''} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-[0.8125rem] font-semibold text-black/80 truncate">{task.title}</div>
          <div className={`text-[0.6875rem] ${cfg.color}`}>{cfg.label}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {task.status === 'running' && task.cancellable && (
            <button onClick={() => taskService.cancel(task.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.6875rem] text-red-600 hover:bg-red-50 transition-colors">
              <X className="w-3.5 h-3.5" /> 取消
            </button>
          )}
          {task.status === 'failed' && (
            <button onClick={() => taskService.retry(task.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.6875rem] text-blue-600 hover:bg-blue-50 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> 重试
            </button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.6875rem]">
        <InfoRow label="任务 ID" value={task.id} />
        <InfoRow label="类型" value={typeLabel[task.type] || task.type} />
        <InfoRow label="创建时间" value={formatTime(task.createdAt)} />
        <InfoRow label="耗时" value={formatDuration(task.createdAt, task.doneAt)} />
        {task.doneAt && <InfoRow label="完成时间" value={formatTime(task.doneAt)} />}
        {!isLogMode && task.message && <InfoRow label="信息" value={task.message} span />}
      </div>

      {/* Progress (only for progress mode) */}
      {!isLogMode && task.status === 'running' && (
        <div className="space-y-1">
          {pct != null ? (
            <>
              <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[0.625rem] text-black/40">
                <span>
                  {hasBytes
                    ? `${formatBytes(task.bytesCurrent ?? 0)} / ${formatBytes(task.bytesTotal ?? 0)}`
                    : (task.itemTotal ?? 0) > 0
                      ? `${task.itemCurrent ?? 0} / ${task.itemTotal} 个项目`
                      : ''}
                </span>
                <span>
                  {hasBytes && speed > 0 ? formatSpeed(speed) + '  ' : ''}
                  {pct}%
                </span>
              </div>
            </>
          ) : (
            <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-blue-400/60 animate-indeterminate" />
            </div>
          )}
        </div>
      )}

      {/* Logs (only for log mode) */}
      {isLogMode && <LogPanel logs={task.logs || []} />}
    </div>
  )
}

function InfoRow({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <span className="text-black/40">{label}：</span>
      <span className="text-black/70 break-all">{value}</span>
    </div>
  )
}

export function openTaskDetailWindow(taskId: string, taskTitle: string) {
  useWindowStore.getState().openChildWindow({
    type: 'taskDetail',
    title: `任务详情 - ${taskTitle}`,
    component: (ctx: any) => <TaskDetailWindow windowId={ctx.win.id} />,
    size: { width: 480, height: 420 },
    initialState: { taskId },
  })
}
