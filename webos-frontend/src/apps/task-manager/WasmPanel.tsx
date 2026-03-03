import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { request as wsRequest } from "@/stores/webSocketStore"
import { Square, Play, RotateCw } from "lucide-react"
import type { WasmProcInfo } from "./types"

export function WasmPanel({
  procs,
  onRefresh,
}: {
  procs: WasmProcInfo[]
  onRefresh: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const doAction = async (action: "wasm_start" | "wasm_stop" | "wasm_restart", appId: string, label: string) => {
    setLoading(appId)
    try {
      await wsRequest(action, { appId })
      toast({ title: "成功", description: `${label} ${appId}` })
      setTimeout(onRefresh, 300)
    } catch (e: any) {
      toast({ title: "失败", description: e?.message || `${label}失败`, variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }

  const stateColor = (state: string) => {
    switch (state) {
      case "running": return "text-green-600 bg-green-50"
      case "starting": return "text-blue-600 bg-blue-50"
      case "failed": return "text-red-600 bg-red-50"
      case "stopped": return "text-slate-500 bg-slate-50"
      default: return "text-slate-500 bg-slate-50"
    }
  }

  const stateLabel = (state: string) => {
    switch (state) {
      case "running": return "运行中"
      case "starting": return "启动中"
      case "failed": return "失败"
      case "stopped": return "已停止"
      default: return state
    }
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.6875rem] text-slate-400">
          {procs.length} 个 Wasm 进程
          {procs.filter(p => p.state === "running").length > 0 && (
            <span className="ml-2 text-green-600">
              ({procs.filter(p => p.state === "running").length} 运行中)
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass}>应用 ID</th>
              <th className={thClass}>名称</th>
              <th className={thClass} style={{ width: 80 }}>状态</th>
              <th className={thClass}>错误信息</th>
              <th className={thClass} style={{ width: 120 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {procs.map((p) => (
              <tr key={p.appId} className="border-b border-slate-50 hover:bg-slate-50/80">
                <td className="px-2 py-1.5 text-slate-700 font-mono text-[0.625rem]">{p.appId}</td>
                <td className="px-2 py-1.5 text-slate-600">{p.name || p.appId}</td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[0.625rem] font-medium ${stateColor(p.state)}`}>
                    {stateLabel(p.state)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-red-500 truncate max-w-[12.5rem] text-[0.625rem]" title={p.error || ""}>
                  {p.error || "—"}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {p.state === "running" ? (
                      <>
                        <button
                          onClick={() => doAction("wasm_stop", p.appId, "已停止")}
                          disabled={loading === p.appId}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="停止"
                        >
                          <Square className="w-3 h-3" />
                          停止
                        </button>
                        <button
                          onClick={() => doAction("wasm_restart", p.appId, "已重启")}
                          disabled={loading === p.appId}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          title="重启"
                        >
                          <RotateCw className="w-3 h-3" />
                          重启
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => doAction("wasm_start", p.appId, "已启动")}
                        disabled={loading === p.appId}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                        title="启动"
                      >
                        <Play className="w-3 h-3" />
                        启动
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {procs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  暂无 Wasm 进程
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
