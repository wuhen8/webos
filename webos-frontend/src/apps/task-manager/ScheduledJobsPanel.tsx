import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { request as wsRequest, registerMessageHandler } from "@/stores/webSocketStore"
import { Play, Pause, Trash2, RotateCw, Plus, X } from "lucide-react"

export interface ScheduledJob {
  id: string
  name: string
  silent: boolean
  enabled: boolean
  cronExpr: string
  cronDesc: string
  jobType: string
  config: string
  lastRunAt: number
  nextRunAt: number
  lastStatus: string
  lastMessage: string
  scheduleType: string
  runAt: number
}

interface JobFormData {
  jobName: string
  jobType: string
  scheduleType: string
  cronExpr: string
  runAt: string
  command: string
  operation: string
  silent: boolean
}

const emptyForm: JobFormData = {
  jobName: "",
  jobType: "shell",
  scheduleType: "cron",
  cronExpr: "",
  runAt: "",
  command: "",
  operation: "",
  silent: false,
}

export function ScheduledJobsPanel() {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<JobFormData>(emptyForm)

  const fetchJobs = useCallback(async () => {
    try {
      const data = await wsRequest("scheduled_jobs_list", {})
      setJobs(data || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchJobs()
    const unsub = registerMessageHandler((msg) => {
      if (msg.type === "scheduled_job_changed") {
        setJobs(prev => {
          const idx = prev.findIndex(j => j.id === msg.data.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = msg.data
            return next
          }
          return [...prev, msg.data]
        })
        return true
      }
      return false
    })
    return unsub
  }, [fetchJobs])

  const runJob = async (id: string) => {
    try {
      await wsRequest("scheduled_job_run", { jobId: id })
      toast({ title: "已触发", description: "任务已开始执行" })
    } catch {
      toast({ title: "失败", variant: "destructive" })
    }
  }

  const toggleJob = async (job: ScheduledJob) => {
    try {
      await wsRequest("scheduled_job_update", { jobId: job.id, enabled: !job.enabled })
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: !j.enabled } : j))
    } catch {
      toast({ title: "更新失败", variant: "destructive" })
    }
  }

  const deleteJob = async (id: string) => {
    try {
      await wsRequest("scheduled_job_delete", { jobId: id })
      setJobs(prev => prev.filter(j => j.id !== id))
      toast({ title: "已删除" })
    } catch {
      toast({ title: "删除失败", variant: "destructive" })
    }
  }

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (job: ScheduledJob) => {
    let command = ""
    let operation = ""
    try {
      const cfg = JSON.parse(job.config)
      command = cfg.command || ""
      operation = cfg.operation || ""
    } catch { /* ignore */ }
    setForm({
      jobName: job.name,
      jobType: job.jobType || "shell",
      scheduleType: job.scheduleType || "cron",
      cronExpr: job.cronExpr,
      runAt: job.runAt ? new Date(job.runAt).toISOString().slice(0, 16) : "",
      command,
      operation,
      silent: job.silent,
    })
    setEditingId(job.id)
    setShowForm(true)
  }

  const submitForm = async () => {
    const config = form.jobType === "builtin"
      ? JSON.stringify({ operation: form.operation })
      : JSON.stringify({ command: form.command })

    const payload: Record<string, any> = {
      jobName: form.jobName,
      jobType: form.jobType,
      jobConfig: config,
      scheduleType: form.scheduleType,
      silent: form.silent,
    }
    if (form.scheduleType === "cron") {
      payload.cronExpr = form.cronExpr
    } else {
      payload.runAt = new Date(form.runAt).getTime()
    }

    try {
      if (editingId) {
        await wsRequest("scheduled_job_update", { jobId: editingId, ...payload })
        toast({ title: "已更新" })
      } else {
        await wsRequest("scheduled_job_create", payload)
        toast({ title: "已创建" })
      }
      setShowForm(false)
      fetchJobs()
    } catch (e: any) {
      toast({ title: "失败", description: e.message, variant: "destructive" })
    }
  }

  const formatTime = (ts: number) => {
    if (!ts) return "—"
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "success": return "text-green-600 bg-green-50"
      case "running": return "text-blue-600 bg-blue-50"
      case "failed": return "text-red-600 bg-red-50"
      default: return "text-slate-500 bg-slate-50"
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case "success": return "成功"
      case "running": return "运行中"
      case "failed": return "失败"
      case "idle": return "空闲"
      default: return s || "—"
    }
  }

  const jobTypeLabel = (t: string) => {
    switch (t) {
      case "shell": return "Shell"
      case "command": return "命令"
      case "builtin": return "内置"
      default: return t
    }
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.6875rem] text-slate-400">
          {jobs.length} 个定时任务
          {jobs.filter(j => j.enabled).length < jobs.length && (
            <span className="ml-2 text-amber-500">
              ({jobs.filter(j => !j.enabled).length} 已禁用)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchJobs} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors" title="刷新">
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openCreate} className="flex items-center gap-1 px-2 py-0.5 text-[0.625rem] text-blue-600 hover:bg-blue-50 rounded transition-colors">
            <Plus className="w-3 h-3" /> 新建
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border border-slate-200 rounded-lg bg-white p-3 text-[0.6875rem] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">{editingId ? "编辑任务" : "新建任务"}</span>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          <input className="w-full border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none focus:border-blue-300" placeholder="任务名称" value={form.jobName} onChange={e => setForm(f => ({ ...f, jobName: e.target.value }))} />
          <div className="flex gap-2">
            <select className="border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none" value={form.jobType} onChange={e => setForm(f => ({ ...f, jobType: e.target.value }))}>
              <option value="shell">Shell 命令</option>
              <option value="command">WebOS 命令</option>
              <option value="builtin">内置操作</option>
            </select>
            <select className="border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none" value={form.scheduleType} onChange={e => setForm(f => ({ ...f, scheduleType: e.target.value }))}>
              <option value="cron">周期性</option>
              <option value="once">一次性</option>
            </select>
            <label className="flex items-center gap-1 text-slate-500">
              <input type="checkbox" checked={form.silent} onChange={e => setForm(f => ({ ...f, silent: e.target.checked }))} /> 静默
            </label>
          </div>
          {form.jobType === "builtin" ? (
            <select className="w-full border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none" value={form.operation} onChange={e => setForm(f => ({ ...f, operation: e.target.value }))}>
              <option value="">选择操作...</option>
              <option value="rebuild-index-local">重建本地索引</option>
              <option value="rebuild-index-s3">重建 S3 索引</option>
              <option value="clean-uploads">清理过期上传</option>
            </select>
          ) : (
            <input className="w-full border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none focus:border-blue-300" placeholder={form.jobType === "command" ? "WebOS 命令，如 notify 你好" : "Shell 命令"} value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} />
          )}
          {form.scheduleType === "cron" ? (
            <input className="w-full border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none focus:border-blue-300" placeholder="Cron 表达式：秒 分 时 日 月 周" value={form.cronExpr} onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value }))} />
          ) : (
            <input type="datetime-local" className="w-full border border-slate-200 rounded px-2 py-1 text-[0.6875rem] outline-none focus:border-blue-300" value={form.runAt} onChange={e => setForm(f => ({ ...f, runAt: e.target.value }))} />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-[0.625rem] text-slate-500 hover:bg-slate-100 rounded">取消</button>
            <button onClick={submitForm} className="px-3 py-1 text-[0.625rem] text-white bg-blue-500 hover:bg-blue-600 rounded">
              {editingId ? "保存" : "创建"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass}>名称</th>
              <th className={thClass} style={{ width: 50 }}>类型</th>
              <th className={thClass}>计划</th>
              <th className={thClass} style={{ width: 60 }}>状态</th>
              <th className={thClass} style={{ width: 90 }}>上次执行</th>
              <th className={thClass} style={{ width: 90 }}>下次执行</th>
              <th className={thClass} style={{ width: 100 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer" onClick={() => openEdit(job)}>
                <td className="px-2 py-1.5 text-slate-700">
                  <div className="flex items-center gap-1.5">
                    {!job.enabled && <span className="text-[0.5rem] text-amber-500">●</span>}
                    <span className={job.enabled ? "" : "text-slate-400"}>{job.name || job.id}</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem]">{jobTypeLabel(job.jobType)}</td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem]">
                  {job.scheduleType === "once"
                    ? `一次性 ${formatTime(job.runAt)}`
                    : (job.cronDesc || job.cronExpr)}
                </td>
                <td className="px-2 py-1">
                  <span className={`inline-block px-1 py-0.5 rounded text-[0.625rem] font-medium ${statusColor(job.lastStatus)}`}>
                    {statusLabel(job.lastStatus)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem] tabular-nums">{formatTime(job.lastRunAt)}</td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem] tabular-nums">{formatTime(job.nextRunAt)}</td>
                <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => runJob(job.id)} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="立即执行">
                      <Play className="w-3 h-3" />
                    </button>
                    <button onClick={() => toggleJob(job)} className="p-1 text-amber-500 hover:bg-amber-50 rounded" title={job.enabled ? "禁用" : "启用"}>
                      <Pause className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteJob(job.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="删除">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  暂无定时任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
