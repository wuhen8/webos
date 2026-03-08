import { useToast } from "@/hooks/use-toast"
import { sendMsg } from "@/stores/webSocketStore"
import { openTaskDetailWindow } from "@/components/TaskDetailWindow"
import { Square } from "lucide-react"
import type { UnifiedTask } from "./types"

export function TaskPanel({ tasks }: { tasks: UnifiedTask[] }) {
  const { toast } = useToast()

  const cancelTask = async (id: string) => {
    try {
      sendMsg({ type: "task.cancel", data: id })
      toast({ title: "成功", description: `已发送取消请求` })
    } catch {
      toast({ title: "失败", description: "取消任务失败", variant: "destructive" })
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
      case "running": return "运行中"
      case "success": return "已完成"
      case "failed": return "失败"
      case "cancelled": return "已取消"
      default: return status
    }
  }

  const categoryLabel = (cat?: string) => {
    if (!cat) return "-"
    switch (cat) {
      case "system": return "系统"
      case "service": return "服务"
      case "scheduler": return "定时"
      case "file": return "文件"
      case "download": return "下载"
      default: return cat
    }
  }

  const formatDuration = (t: UnifiedTask) => {
    const now = Date.now()
    const start = t.createdAt
    const end = t.status === "running" ? now : (t.doneAt || now)
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

  const formatProgress = (t: UnifiedTask) => {
    if (t.progress != null && t.progress > 0) {
      return `${(t.progress * 100).toFixed(0)}%`
    }
    return ""
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.6875rem] text-slate-400">
          {tasks.length} 个任务
          {tasks.filter(t => t.status === "running").length > 0 && (
            <span className="ml-2 text-green-600">
              ({tasks.filter(t => t.status === "running").length} 运行中)
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass} style={{ width: 100 }}>ID</th>
              <th className={thClass}>标题</th>
              <th className={thClass} style={{ width: 50 }}>类别</th>
              <th className={thClass} style={{ width: 70 }}>状态</th>
              <th className={thClass} style={{ width: 50 }}>进度</th>
              <th className={thClass} style={{ width: 70 }}>时长</th>
              <th className={thClass}>信息</th>
              <th className={thClass} style={{ width: 60 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer" onClick={() => openTaskDetailWindow(t.id, t.title)}>
                <td className="px-2 py-1 text-slate-500 font-mono text-[0.625rem]">{t.id.replace("task_", "").slice(0, 8)}</td>
                <td className="px-2 py-1 text-slate-700">{t.title}</td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem]">{categoryLabel(t.category)}</td>
                <td className="px-2 py-1">
                  <span className={`inline-block py-0.5 rounded text-[0.625rem] font-medium ${statusColor(t.status)}`}>
                    {statusLabel(t.status)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 tabular-nums text-[0.625rem]">
                  {t.status === "running" && formatProgress(t)}
                </td>
                <td className="px-2 py-1 text-slate-500 tabular-nums">{formatDuration(t)}</td>
                <td className="px-2 py-1 text-slate-500 truncate max-w-[12.5rem] text-[0.625rem]" title={t.message || ""}>
                  {t.message || "—"}
                </td>
                <td className="px-2 py-1">
                  {t.status === "running" && t.cancellable && (
                    <button
                      onClick={() => cancelTask(t.id)}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[0.5625rem] text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="取消"
                    >
                      <Square className="w-3 h-3" />
                      取消
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  暂无任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
