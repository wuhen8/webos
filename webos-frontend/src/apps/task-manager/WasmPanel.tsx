import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { useToast } from "@/hooks/use-toast"
import { request as wsRequest } from "@/stores/webSocketStore"
import { appStoreService } from "@/lib/services/appStoreService"
import { Square, Play, RotateCw, Power } from "lucide-react"
import type { WasmProcInfo, SortField } from "./types"

export function WasmPanel({
  procs,
  onRefresh,
  sortField,
  handleSort,
  SortIcon,
  onContextMenu,
}: {
  procs: WasmProcInfo[]
  onRefresh: () => void
  sortField: SortField
  handleSort: (f: SortField) => void
  SortIcon: React.FC<{ field: SortField }>
  onContextMenu?: (e: React.MouseEvent, appId: string) => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const doAction = async (action: "wasm.start" | "wasm.stop" | "wasm.restart", appId: string, label: string) => {
    setLoading(appId)
    try {
      await wsRequest(action, { appId })
      toast({ title: t('common.success'), description: t('apps.taskManager.wasm.actionSuccess', { action: label, appId }) })
      setTimeout(onRefresh, 300)
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message || t('apps.taskManager.wasm.actionFailed', { action: label }), variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }

  const toggleAutostart = async (appId: string, current: boolean) => {
    try {
      await appStoreService.setAutostart(appId, !current)
      toast({ title: t('common.success'), description: !current ? t('apps.taskManager.wasm.autostartEnabled', { appId }) : t('apps.taskManager.wasm.autostartDisabled', { appId }) })
      setTimeout(onRefresh, 300)
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message || t('apps.taskManager.wasm.autostartFailed'), variant: "destructive" })
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
      case "running": return t('apps.taskManager.wasm.stateLabel.running')
      case "starting": return t('apps.taskManager.wasm.stateLabel.starting')
      case "failed": return t('apps.taskManager.wasm.stateLabel.failed')
      case "stopped": return t('apps.taskManager.wasm.stateLabel.stopped')
      default: return state
    }
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 transition-colors select-none whitespace-nowrap"

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "—"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i]
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.6875rem] text-slate-400">
          {t('apps.taskManager.wasm.count', { count: procs.length })}
          {procs.filter(p => p.state === "running").length > 0 && (
            <span className="ml-2 text-green-600">
              {t('apps.taskManager.wasm.runningCount', { count: procs.filter(p => p.state === "running").length })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass} onClick={() => handleSort("appId")}>
                <span className="flex items-center gap-1">{t('apps.taskManager.wasm.appId')} <SortIcon field="appId" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("name")}>
                <span className="flex items-center gap-1">{t('apps.taskManager.wasm.name')} <SortIcon field="name" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("state")} style={{ width: 80 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.wasm.status')} <SortIcon field="state" /></span>
              </th>
              <th className={thClass} style={{ width: 60 }}>{t('apps.taskManager.wasm.autostart')}</th>
              <th className={thClass} onClick={() => handleSort("memory")} style={{ width: 70 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.wasm.memory')} <SortIcon field="memory" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("eventCount")} style={{ width: 60 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.wasm.events')} <SortIcon field="eventCount" /></span>
              </th>
              <th className={thClass}>{t('apps.taskManager.wasm.errorInfo')}</th>
              <th className={thClass} style={{ width: 120 }}>{t('apps.taskManager.wasm.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {procs.map((p) => (
              <tr
                key={p.appId}
                className="border-b border-slate-50 hover:bg-slate-50/80"
                onContextMenu={(e) => onContextMenu?.(e, p.appId)}
              >
                <td className="px-2 py-1.5 text-slate-700 font-mono text-[0.625rem]">{p.appId}</td>
                <td className="px-2 py-1.5 text-slate-600">{p.name || p.appId}</td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[0.625rem] font-medium ${stateColor(p.state)}`}>
                    {stateLabel(p.state)}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => toggleAutostart(p.appId, !!p.autostart)}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.5625rem] font-medium transition-colors ${
                      p.autostart
                        ? 'text-green-600 bg-green-50 hover:bg-green-100'
                        : 'text-slate-400 bg-slate-50 hover:bg-slate-100'
                    }`}
                    title={p.autostart ? t('apps.taskManager.wasm.autostartTitleOn') : t('apps.taskManager.wasm.autostartTitleOff')}
                  >
                    <Power className="w-3 h-3" />
                    {p.autostart ? t('apps.taskManager.wasm.autostartOn') : t('apps.taskManager.wasm.autostartOff')}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-slate-600">
                  {formatBytes(p.memory || 0)}
                </td>
                <td className="px-2 py-1.5 text-slate-600">
                  {p.eventCount !== undefined ? p.eventCount.toLocaleString() : "—"}
                </td>
                <td className="px-2 py-1.5 text-red-500 truncate max-w-[12.5rem] text-[0.625rem]" title={p.error || ""}>
                  {p.error || "—"}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {p.state === "running" ? (
                      <>
                        <button
                          onClick={() => doAction("wasm.stop", p.appId, t('apps.taskManager.wasm.stopSuccess'))}
                          disabled={loading === p.appId}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title={t('apps.taskManager.wasmMenu.stop')}
                        >
                          <Square className="w-3 h-3" />
                          {t('apps.taskManager.wasmMenu.stop')}
                        </button>
                        <button
                          onClick={() => doAction("wasm.restart", p.appId, t('apps.taskManager.wasm.restartSuccess'))}
                          disabled={loading === p.appId}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          title={t('apps.taskManager.wasmMenu.restart')}
                        >
                          <RotateCw className="w-3 h-3" />
                          {t('apps.taskManager.wasmMenu.restart')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => doAction("wasm.start", p.appId, t('apps.taskManager.wasm.startSuccess'))}
                        disabled={loading === p.appId}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                        title={t('apps.taskManager.wasmMenu.start')}
                      >
                        <Play className="w-3 h-3" />
                        {t('apps.taskManager.wasmMenu.start')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {procs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {t('apps.taskManager.wasm.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
