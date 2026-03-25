import { useTranslation } from 'react-i18next'
import { useToast } from "@/hooks/use-toast"
import { notify } from "@/stores/webSocketStore"
import { openTaskDetailWindow } from "@/components/TaskDetailWindow"
import { Square } from "lucide-react"
import type { UnifiedTask } from "./types"

export function TaskPanel({ tasks }: { tasks: UnifiedTask[] }) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const cancelTask = async (id: string) => {
    try {
      notify("task.cancel", { data: id })
      toast({ title: t('common.success'), description: t('apps.taskManager.tasks.cancelSubmitted') })
    } catch {
      toast({ title: t('common.error'), description: t('apps.taskManager.tasks.cancelFailed'), variant: "destructive" })
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "running": return "text-green-600 bg-green-50"
      case "success": return "text-slate-500 bg-slate-50"
      case "failed": return "text-red-600 bg-red-50"
      case "cancelled": return "text-amber-600 bg-amber-50"
      default: return "text-slate-500 bg-slate-50"
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case "running": return t('apps.taskManager.tasks.statusLabel.running')
      case "success": return t('apps.taskManager.tasks.statusLabel.success')
      case "failed": return t('apps.taskManager.tasks.statusLabel.failed')
      case "cancelled": return t('apps.taskManager.tasks.statusLabel.cancelled')
      default: return status
    }
  }

  const categoryLabel = (cat?: string) => {
    if (!cat) return "-"
    switch (cat) {
      case "system": return t('apps.taskManager.tasks.categoryLabel.system')
      case "service": return t('apps.taskManager.tasks.categoryLabel.service')
      case "scheduler": return t('apps.taskManager.tasks.categoryLabel.scheduler')
      case "file": return t('apps.taskManager.tasks.categoryLabel.file')
      case "download": return t('apps.taskManager.tasks.categoryLabel.download')
      default: return cat
    }
  }

  const formatDuration = (task: UnifiedTask) => {
    const now = Date.now()
    const start = task.createdAt
    const end = task.status === "running" ? now : (task.doneAt || now)
    const ms = end - start
    if (ms < 1000) return `${ms}ms`
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rs = s % 60
    if (m < 60) return `${m}m${rs}s`
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h${rm}m`
  }

  const formatProgress = (task: UnifiedTask) => {
    if (task.progress != null && task.progress > 0) {
      return `${(task.progress * 100).toFixed(0)}%`
    }
    return ""
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.6875rem] text-slate-400">
          {t('apps.taskManager.tasks.count', { count: tasks.length })}
          {tasks.filter(t => t.status === "running").length > 0 && (
            <span className="ml-2 text-green-600">
              {t('apps.taskManager.tasks.runningCount', { count: tasks.filter(t => t.status === "running").length })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass} style={{ width: 100 }}>ID</th>
              <th className={thClass}>{t('apps.taskManager.tasks.title')}</th>
              <th className={thClass} style={{ width: 50 }}>{t('apps.taskManager.tasks.category')}</th>
              <th className={thClass} style={{ width: 70 }}>{t('apps.taskManager.tasks.status')}</th>
              <th className={thClass} style={{ width: 50 }}>{t('apps.taskManager.tasks.progress')}</th>
              <th className={thClass} style={{ width: 70 }}>{t('apps.taskManager.tasks.duration')}</th>
              <th className={thClass}>{t('apps.taskManager.tasks.message')}</th>
              <th className={thClass} style={{ width: 60 }}>{t('apps.taskManager.tasks.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer" onClick={() => openTaskDetailWindow(task.id, task.title)}>
                <td className="px-2 py-1 text-slate-500 font-mono text-[0.625rem]">{task.id.replace("task_", "").slice(0, 8)}</td>
                <td className="px-2 py-1 text-slate-700">{task.title}</td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem]">{categoryLabel(task.category)}</td>
                <td className="px-2 py-1">
                  <span className={`inline-block py-0.5 rounded text-[0.625rem] font-medium ${statusColor(task.status)}`}>
                    {statusLabel(task.status)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 tabular-nums text-[0.625rem]">
                  {task.status === "running" && formatProgress(task)}
                </td>
                <td className="px-2 py-1 text-slate-500 tabular-nums">{formatDuration(task)}</td>
                <td className="px-2 py-1 text-slate-500 truncate max-w-[12.5rem] text-[0.625rem]" title={task.message || ""}>
                  {task.message || "—"}
                </td>
                <td className="px-2 py-1">
                  {task.status === "running" && task.cancellable && (
                    <button
                      onClick={() => cancelTask(task.id)}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[0.5625rem] text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={t('apps.taskManager.tasks.cancelAction')}
                    >
                      <Square className="w-3 h-3" />
                      {t('apps.taskManager.tasks.cancelAction')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {t('apps.taskManager.tasks.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
