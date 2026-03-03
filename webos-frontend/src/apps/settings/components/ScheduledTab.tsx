import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Play, Pencil } from "lucide-react"
import { taskService } from "@/lib/services"
import { SettingsIcon } from "./SettingsIcon"

interface ScheduledJob {
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

export default function ScheduledTab() {
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([])
  const [scheduledShowAdd, setScheduledShowAdd] = useState(false)
  const [scheduledEditId, setScheduledEditId] = useState<string | null>(null)
  const [scheduledForm, setScheduledForm] = useState({
    name: "",
    jobType: "shell" as "shell" | "builtin",
    command: "",
    operation: "rebuild-index-local",
    scheduleMode: "interval" as "interval" | "daily" | "weekly" | "monthly" | "cron" | "once",
    intervalValue: 60,
    intervalUnit: "minutes" as "seconds" | "minutes" | "hours",
    dailyHour: 0,
    dailyMinute: 0,
    weeklyDays: [1] as number[],
    weeklyHour: 0,
    weeklyMinute: 0,
    monthlyDays: [1] as number[],
    monthlyHour: 0,
    monthlyMinute: 0,
    cronExpr: "",
    opNodeId: "",
    opDstNodeId: "",
    opPaths: "",
    opPath: "",
    opTo: "",
    opOutput: "",
    opDest: "",
    silent: true,
    onceDateTime: "",
  })

  const loadScheduledJobs = useCallback(async () => {
    try {
      const jobs = await taskService.scheduledJobsList()
      setScheduledJobs(jobs || [])
    } catch {}
  }, [])

  const resetScheduledForm = () => {
    setScheduledForm({ name: "", jobType: "shell", command: "", operation: "rebuild-index-local", scheduleMode: "interval", intervalValue: 60, intervalUnit: "minutes", dailyHour: 0, dailyMinute: 0, weeklyDays: [1], weeklyHour: 0, weeklyMinute: 0, monthlyDays: [1], monthlyHour: 0, monthlyMinute: 0, cronExpr: "", opNodeId: "", opDstNodeId: "", opPaths: "", opPath: "", opTo: "", opOutput: "", opDest: "", silent: true, onceDateTime: "" })
    setScheduledEditId(null)
    setScheduledShowAdd(false)
  }

  const buildCronExpr = (): string => {
    const f = scheduledForm
    switch (f.scheduleMode) {
      case "once":
        return ""
      case "interval": {
        if (f.intervalUnit === "seconds") return `*/${f.intervalValue} * * * * *`
        if (f.intervalUnit === "minutes") return `0 */${f.intervalValue} * * * *`
        return `0 0 */${f.intervalValue} * * *`
      }
      case "daily":
        return `0 ${f.dailyMinute} ${f.dailyHour} * * *`
      case "weekly":
        return `0 ${f.weeklyMinute} ${f.weeklyHour} * * ${f.weeklyDays.join(",")}`
      case "monthly":
        return `0 ${f.monthlyMinute} ${f.monthlyHour} ${f.monthlyDays.join(",")} * *`
      case "cron":
        return f.cronExpr
    }
  }

  const parseCronToForm = (expr: string) => {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 6) return { scheduleMode: "cron" as const, cronExpr: expr }
    const [sec, min, hour, dom, month, dow] = parts
    if (month === "*" && dow === "*" && dom === "*") {
      if (sec.startsWith("*/") && min === "*" && hour === "*") {
        return { scheduleMode: "interval" as const, intervalValue: parseInt(sec.slice(2)) || 1, intervalUnit: "seconds" as const }
      }
      if (sec === "0" && min.startsWith("*/") && hour === "*") {
        return { scheduleMode: "interval" as const, intervalValue: parseInt(min.slice(2)) || 1, intervalUnit: "minutes" as const }
      }
      if (sec === "0" && min === "0" && hour.startsWith("*/")) {
        return { scheduleMode: "interval" as const, intervalValue: parseInt(hour.slice(2)) || 1, intervalUnit: "hours" as const }
      }
      if (sec === "0" && !min.includes("*") && !min.includes("/") && !hour.includes("*") && !hour.includes("/")) {
        return { scheduleMode: "daily" as const, dailyHour: parseInt(hour) || 0, dailyMinute: parseInt(min) || 0 }
      }
    }
    if (month === "*" && dom === "*" && sec === "0" && !min.includes("*") && !hour.includes("*") && dow !== "*") {
      return { scheduleMode: "weekly" as const, weeklyHour: parseInt(hour) || 0, weeklyMinute: parseInt(min) || 0, weeklyDays: dow.split(",").map(Number) }
    }
    if (month === "*" && dow === "*" && sec === "0" && !min.includes("*") && !hour.includes("*") && dom !== "*") {
      return { scheduleMode: "monthly" as const, monthlyHour: parseInt(hour) || 0, monthlyMinute: parseInt(min) || 0, monthlyDays: dom.split(",").map(Number) }
    }
    return { scheduleMode: "cron" as const, cronExpr: expr }
  }

  const handleSaveScheduledJob = async () => {
    const f = scheduledForm
    const isOnce = f.scheduleMode === "once"
    const cronExpr = isOnce ? "" : buildCronExpr()
    const scheduleType = isOnce ? "once" : "cron"
    const runAt = isOnce ? new Date(f.onceDateTime).getTime() : 0
    let config: string
    if (f.jobType === "shell") {
      config = JSON.stringify({ command: f.command })
    } else {
      const op = f.operation
      const base: Record<string, any> = { operation: op }
      if (op === "copy") {
        base.nodeId = f.opNodeId; base.paths = f.opPaths.split("\n").map(s => s.trim()).filter(Boolean); base.to = f.opTo
        if (f.opDstNodeId) base.dstNodeId = f.opDstNodeId
      } else if (op === "compress") {
        base.nodeId = f.opNodeId; base.paths = f.opPaths.split("\n").map(s => s.trim()).filter(Boolean); base.output = f.opOutput
      } else if (op === "extract") {
        base.nodeId = f.opNodeId; base.path = f.opPath
        if (f.opDest) base.dest = f.opDest
      }
      config = JSON.stringify(base)
    }
    try {
      if (scheduledEditId) {
        await taskService.scheduledJobUpdate({ jobId: scheduledEditId, jobName: scheduledForm.name, jobType: scheduledForm.jobType, jobConfig: config, cronExpr, enabled: true, silent: scheduledForm.silent, scheduleType, runAt })
      } else {
        await taskService.scheduledJobCreate({ jobName: scheduledForm.name, jobType: scheduledForm.jobType, jobConfig: config, cronExpr, enabled: true, silent: scheduledForm.silent, scheduleType, runAt })
      }
      resetScheduledForm()
      loadScheduledJobs()
    } catch {}
  }

  const handleDeleteScheduledJob = async (id: string) => {
    try { await taskService.scheduledJobDelete(id); loadScheduledJobs() } catch {}
  }

  const handleToggleScheduledJob = async (job: ScheduledJob) => {
    try {
      await taskService.scheduledJobUpdate({ jobId: job.id, jobName: job.name, jobType: job.jobType, jobConfig: job.config, cronExpr: job.cronExpr, enabled: !job.enabled, silent: job.silent, scheduleType: job.scheduleType || "cron", runAt: job.runAt || 0 })
      loadScheduledJobs()
    } catch {}
  }

  const handleRunScheduledJob = async (id: string) => {
    try { await taskService.scheduledJobRun(id) } catch {}
  }

  const handleEditScheduledJob = (job: ScheduledJob) => {
    const isOnce = job.scheduleType === "once"
    const parsed: any = isOnce ? { scheduleMode: "once" } : parseCronToForm(job.cronExpr)
    let onceDateTime = ""
    if (isOnce && job.runAt) {
      const d = new Date(job.runAt)
      onceDateTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    let command = "", operation = "rebuild-index-local"
    let opNodeId = "", opDstNodeId = "", opPaths = "", opPath = "", opTo = "", opOutput = "", opDest = ""
    try {
      const cfg = JSON.parse(job.config)
      if (job.jobType === "shell") { command = cfg.command || "" }
      else {
        operation = cfg.operation || "rebuild-index-local"; opNodeId = cfg.nodeId || ""; opDstNodeId = cfg.dstNodeId || ""
        opPaths = Array.isArray(cfg.paths) ? cfg.paths.join("\n") : ""; opPath = cfg.path || ""; opTo = cfg.to || ""; opOutput = cfg.output || ""; opDest = cfg.dest || ""
      }
    } catch {}
    setScheduledEditId(job.id)
    setScheduledForm({
      name: job.name, jobType: job.jobType as "shell" | "builtin", command, operation,
      scheduleMode: parsed.scheduleMode, intervalValue: parsed.intervalValue ?? 60, intervalUnit: parsed.intervalUnit ?? "minutes",
      dailyHour: parsed.dailyHour ?? 0, dailyMinute: parsed.dailyMinute ?? 0,
      weeklyDays: parsed.weeklyDays ?? [1], weeklyHour: parsed.weeklyHour ?? 0, weeklyMinute: parsed.weeklyMinute ?? 0,
      monthlyDays: parsed.monthlyDays ?? [1], monthlyHour: parsed.monthlyHour ?? 0, monthlyMinute: parsed.monthlyMinute ?? 0,
      cronExpr: parsed.cronExpr ?? job.cronExpr, opNodeId, opDstNodeId, opPaths, opPath, opTo, opOutput, opDest, silent: job.silent,
      onceDateTime,
    })
    setScheduledShowAdd(true)
  }

  const formatRelativeTime = (ms: number) => {
    if (!ms) return "从未运行"
    const diff = Date.now() - ms
    if (diff < 60000) return "刚刚"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${Math.floor(diff / 86400000)}天前`
  }

  const formatSchedule = (job: ScheduledJob) => {
    if (job.scheduleType === "once" && job.runAt) {
      const d = new Date(job.runAt)
      return `一次性 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    if (job.cronDesc) return job.cronDesc
    return job.cronExpr
  }

  useEffect(() => {
    loadScheduledJobs()
    const unsub = taskService.onScheduledJobChanged(() => { loadScheduledJobs() })
    return unsub
  }, [loadScheduledJobs])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-violet-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="scheduled" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">定时任务</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">管理计划任务，支持 Cron 表达式</p>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[0.75rem] font-medium text-gray-500 uppercase tracking-wide">任务列表</h2>
          <button
            onClick={() => { resetScheduledForm(); setScheduledShowAdd(true) }}
            className="flex items-center gap-1 px-2 py-1 text-[0.75rem] text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加
          </button>
        </div>
        <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
          {scheduledJobs.map((job, idx, arr) => {
            let configLabel = ""
            try {
              const cfg = JSON.parse(job.config)
              if (job.jobType === "shell") configLabel = cfg.command || ""
              else configLabel = cfg.operation || ""
            } catch {}
            return (
              <div key={job.id}>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleScheduledJob(job)}
                      className={`w-8 h-[1.125rem] rounded-full transition-colors relative flex-shrink-0 ${job.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${job.enabled ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-[0.8125rem] font-medium text-gray-900 flex-1 min-w-0 truncate">{job.name}</span>
                    <span className="text-[0.6875rem] text-gray-400 flex-shrink-0">{formatSchedule(job)}</span>
                    {job.silent && <span className="text-[0.6rem] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded flex-shrink-0">静默</span>}
                    {job.scheduleType === 'once' && <span className="text-[0.6rem] text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">一次性</span>}
                  </div>
                  <div className="mt-1 ml-10">
                    <span className="text-[0.6875rem] text-gray-400 font-mono">{job.jobType === 'shell' ? 'Shell' : '内置'}: {configLabel}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 ml-10">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[0.6875rem] text-gray-400">上次: {formatRelativeTime(job.lastRunAt)}</span>
                      {job.lastStatus === 'success' && <span className="text-[0.6875rem] text-green-500">成功</span>}
                      {job.lastStatus === 'failed' && <span className="text-[0.6875rem] text-red-500">失败</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleRunScheduledJob(job.id)} className="p-1 hover:bg-black/[0.05] rounded transition-colors" title="立即运行">
                        <Play className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => handleEditScheduledJob(job)} className="p-1 hover:bg-black/[0.05] rounded transition-colors" title="编辑">
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => handleDeleteScheduledJob(job.id)} className="p-1 hover:bg-black/[0.05] rounded transition-colors" title="删除">
                        <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
                {idx < arr.length - 1 && <div className="h-px bg-gray-200 ml-4" />}
              </div>
            )
          })}
          {scheduledJobs.length === 0 && !scheduledShowAdd && (
            <div className="px-4 py-3 text-[0.8125rem] text-gray-400">暂无任务</div>
          )}
        </div>
      </div>

      {/* 添加/编辑表单 */}
      {scheduledShowAdd && (
        <div className="bg-[#f5f5f7] rounded-xl overflow-hidden p-4 mb-4">
          <h3 className="text-[0.8125rem] font-medium text-gray-900 mb-3">{scheduledEditId ? '编辑任务' : '添加任务'}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[0.75rem] text-gray-500 mb-1 block">任务名称</label>
              <input type="text" value={scheduledForm.name} onChange={(e) => setScheduledForm(f => ({ ...f, name: e.target.value }))} placeholder="输入任务名称" className="w-full px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30" />
            </div>
            <div>
              <label className="text-[0.75rem] text-gray-500 mb-1 block">类型</label>
              <div className="flex gap-2">
                <button onClick={() => setScheduledForm(f => ({ ...f, jobType: "shell" }))} className={`px-3 py-1.5 text-[0.8125rem] rounded-md border transition-colors ${scheduledForm.jobType === 'shell' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>Shell 命令</button>
                <button onClick={() => setScheduledForm(f => ({ ...f, jobType: "builtin" }))} className={`px-3 py-1.5 text-[0.8125rem] rounded-md border transition-colors ${scheduledForm.jobType === 'builtin' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>内置操作</button>
              </div>
            </div>
            {scheduledForm.jobType === "shell" ? (
              <div>
                <label className="text-[0.75rem] text-gray-500 mb-1 block">Shell 命令</label>
                <input type="text" value={scheduledForm.command} onChange={(e) => setScheduledForm(f => ({ ...f, command: e.target.value }))} placeholder="例如: tar czf /backup/data.tar.gz /data" className="w-full px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-[0.75rem] text-gray-500 mb-1 block">内置操作</label>
                  <select value={scheduledForm.operation} onChange={(e) => setScheduledForm(f => ({ ...f, operation: e.target.value }))} className="w-full px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30">
                    <option value="rebuild-index-local">重建本地索引</option>
                    <option value="rebuild-index-s3">重建S3索引</option>
                    <option value="clean-uploads">清理过期上传</option>
                    <option value="copy">复制文件</option>
                    <option value="compress">压缩文件</option>
                    <option value="extract">解压文件</option>
                  </select>
                </div>
                {scheduledForm.operation === "copy" && (
                  <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">存储节点 ID</label><input type="text" value={scheduledForm.opNodeId} onChange={(e) => setScheduledForm(f => ({ ...f, opNodeId: e.target.value }))} placeholder="例如: local-1" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">源路径 (每行一个)</label><textarea value={scheduledForm.opPaths} onChange={(e) => setScheduledForm(f => ({ ...f, opPaths: e.target.value }))} placeholder={"/data/folder1\n/data/file.txt"} rows={3} className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono resize-none" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">目标目录</label><input type="text" value={scheduledForm.opTo} onChange={(e) => setScheduledForm(f => ({ ...f, opTo: e.target.value }))} placeholder="/backup" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">目标节点 ID (跨存储时填写)</label><input type="text" value={scheduledForm.opDstNodeId} onChange={(e) => setScheduledForm(f => ({ ...f, opDstNodeId: e.target.value }))} placeholder="留空则同源节点" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                  </div>
                )}
                {scheduledForm.operation === "compress" && (
                  <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">存储节点 ID</label><input type="text" value={scheduledForm.opNodeId} onChange={(e) => setScheduledForm(f => ({ ...f, opNodeId: e.target.value }))} placeholder="例如: local-1" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">要压缩的路径 (每行一个)</label><textarea value={scheduledForm.opPaths} onChange={(e) => setScheduledForm(f => ({ ...f, opPaths: e.target.value }))} placeholder={"/data/folder1\n/data/file.txt"} rows={3} className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono resize-none" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">输出文件路径</label><input type="text" value={scheduledForm.opOutput} onChange={(e) => setScheduledForm(f => ({ ...f, opOutput: e.target.value }))} placeholder="/backup/archive.zip" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                  </div>
                )}
                {scheduledForm.operation === "extract" && (
                  <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">存储节点 ID</label><input type="text" value={scheduledForm.opNodeId} onChange={(e) => setScheduledForm(f => ({ ...f, opNodeId: e.target.value }))} placeholder="例如: local-1" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">压缩文件路径</label><input type="text" value={scheduledForm.opPath} onChange={(e) => setScheduledForm(f => ({ ...f, opPath: e.target.value }))} placeholder="/data/archive.zip" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                    <div><label className="text-[0.6875rem] text-gray-500 mb-0.5 block">解压目标目录 (留空则解压到同目录)</label><input type="text" value={scheduledForm.opDest} onChange={(e) => setScheduledForm(f => ({ ...f, opDest: e.target.value }))} placeholder="/data/extracted" className="w-full px-2 py-1 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" /></div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-[0.75rem] text-gray-500 mb-1 block">执行计划</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {([["once", "一次性"], ["interval", "固定间隔"], ["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"], ["cron", "Cron 表达式"]] as const).map(([mode, label]) => (
                  <button key={mode} onClick={() => setScheduledForm(f => ({ ...f, scheduleMode: mode }))} className={`px-2.5 py-1 text-[0.75rem] rounded-md border transition-colors ${scheduledForm.scheduleMode === mode ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
                ))}
              </div>
              {scheduledForm.scheduleMode === "once" && (
                <div>
                  <input type="datetime-local" value={scheduledForm.onceDateTime} onChange={(e) => setScheduledForm(f => ({ ...f, onceDateTime: e.target.value }))} className="w-full px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30" />
                  <p className="text-[0.6875rem] text-gray-400 mt-1">任务将在指定时间执行一次后自动删除</p>
                </div>
              )}
              {scheduledForm.scheduleMode === "interval" && (
                <div className="flex gap-2">
                  <input type="number" min={1} value={scheduledForm.intervalValue} onChange={(e) => setScheduledForm(f => ({ ...f, intervalValue: parseInt(e.target.value) || 1 }))} className="w-24 px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30" />
                  <select value={scheduledForm.intervalUnit} onChange={(e) => setScheduledForm(f => ({ ...f, intervalUnit: e.target.value as any }))} className="px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30">
                    <option value="seconds">秒</option><option value="minutes">分钟</option><option value="hours">小时</option>
                  </select>
                </div>
              )}
              {scheduledForm.scheduleMode === "daily" && (
                <div className="flex items-center gap-2">
                  <span className="text-[0.8125rem] text-gray-600">每天</span>
                  <input type="number" min={0} max={23} value={scheduledForm.dailyHour} onChange={(e) => setScheduledForm(f => ({ ...f, dailyHour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                  <span className="text-[0.8125rem] text-gray-600">:</span>
                  <input type="number" min={0} max={59} value={scheduledForm.dailyMinute} onChange={(e) => setScheduledForm(f => ({ ...f, dailyMinute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                </div>
              )}
              {scheduledForm.scheduleMode === "weekly" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(["日", "一", "二", "三", "四", "五", "六"]).map((d, i) => (
                      <button key={i} onClick={() => setScheduledForm(f => { const days = f.weeklyDays.includes(i) ? f.weeklyDays.filter(v => v !== i) : [...f.weeklyDays, i].sort(); return { ...f, weeklyDays: days.length ? days : [i] } })} className={`w-8 h-8 text-[0.75rem] rounded-md border transition-colors ${scheduledForm.weeklyDays.includes(i) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{d}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={23} value={scheduledForm.weeklyHour} onChange={(e) => setScheduledForm(f => ({ ...f, weeklyHour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                    <span className="text-[0.8125rem] text-gray-600">:</span>
                    <input type="number" min={0} max={59} value={scheduledForm.weeklyMinute} onChange={(e) => setScheduledForm(f => ({ ...f, weeklyMinute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                  </div>
                </div>
              )}
              {scheduledForm.scheduleMode === "monthly" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <button key={d} onClick={() => setScheduledForm(f => { const days = f.monthlyDays.includes(d) ? f.monthlyDays.filter(v => v !== d) : [...f.monthlyDays, d].sort((a, b) => a - b); return { ...f, monthlyDays: days.length ? days : [d] } })} className={`w-7 h-7 text-[0.6875rem] rounded border transition-colors ${scheduledForm.monthlyDays.includes(d) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{d}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={23} value={scheduledForm.monthlyHour} onChange={(e) => setScheduledForm(f => ({ ...f, monthlyHour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                    <span className="text-[0.8125rem] text-gray-600">:</span>
                    <input type="number" min={0} max={59} value={scheduledForm.monthlyMinute} onChange={(e) => setScheduledForm(f => ({ ...f, monthlyMinute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))} className="w-16 px-2 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 text-center" />
                  </div>
                </div>
              )}
              {scheduledForm.scheduleMode === "cron" && (
                <div>
                  <input type="text" value={scheduledForm.cronExpr} onChange={(e) => setScheduledForm(f => ({ ...f, cronExpr: e.target.value }))} placeholder="秒 分 时 日 月 周  例: 0 30 2 * * 1-5" className="w-full px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono" />
                  <p className="text-[0.6875rem] text-gray-400 mt-1">6位: 秒(0-59) 分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-6,0=日)</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <button onClick={() => setScheduledForm(f => ({ ...f, silent: !f.silent }))} className={`w-8 h-[1.125rem] rounded-full transition-colors relative ${scheduledForm.silent ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${scheduledForm.silent ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-[0.8125rem] text-gray-600">静默执行</span>
                <span className="text-[0.6875rem] text-gray-400">完成时不弹出通知</span>
              </label>
              <div className="flex gap-2">
                <button onClick={resetScheduledForm} className="px-3 py-1.5 text-[0.8125rem] bg-white hover:bg-gray-100 text-gray-700 rounded-md border border-gray-200 transition-colors">取消</button>
                <button onClick={handleSaveScheduledJob} disabled={!scheduledForm.name.trim() || (scheduledForm.jobType === 'shell' && !scheduledForm.command.trim()) || (scheduledForm.scheduleMode === 'once' && !scheduledForm.onceDateTime)} className="px-3 py-1.5 text-[0.8125rem] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-md transition-colors">{scheduledEditId ? '保存' : '添加'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
