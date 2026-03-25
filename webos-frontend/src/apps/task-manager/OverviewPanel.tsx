import { Cpu, MemoryStick, HardDrive, Network, Clock } from "lucide-react"
import { useTranslation } from 'react-i18next'
import type { SystemOverview } from "./types"
import { formatBytes } from "./types"

export function OverviewPanel({
  overview,
  cpuUsage,
  memUsage,
  networkSpeed,
}: {
  overview: SystemOverview | null
  cpuUsage: number
  memUsage: number
  networkSpeed: { iface: string; rxSpeed: number; txSpeed: number }[]
}) {
  const { t } = useTranslation()
  if (!overview) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        {t('apps.taskManager.overview.loading')}
      </div>
    )
  }

  const disks = overview.disks || []
  const network = overview.network || []

  return (
    <div className="h-full overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
      {/* System Info Bar */}
      <div className="flex items-center gap-3 text-[0.6875rem] text-slate-500 bg-white/50 rounded-lg px-3 py-2 border border-slate-100">
        <span className="font-medium text-slate-700">{overview.hostname}</span>
        <span className="w-px h-3 bg-slate-200" />
        <span>{overview.os}/{overview.arch}</span>
        <span className="w-px h-3 bg-slate-200" />
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {overview.uptime}
        </span>
        {overview.loadAvg && (
          <>
            <span className="w-px h-3 bg-slate-200" />
            <span>{t('apps.taskManager.overview.load')}: {overview.loadAvg.join(" / ")}</span>
          </>
        )}
      </div>

      {/* 2x2 Grid: CPU / Memory / Disk / Network */}
      <div className="grid grid-cols-2 gap-3">
        {/* CPU */}
        <div className="bg-white/60 rounded-xl border border-slate-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-[0.6875rem] text-slate-500">{t('apps.taskManager.overview.cpu')}</div>
                <div className="text-[0.625rem] text-slate-400">{t('apps.taskManager.overview.cores', { count: overview.numCPU })}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-semibold tabular-nums ${cpuUsage > 80 ? "text-red-500" : cpuUsage > 50 ? "text-amber-500" : "text-blue-600"}`}>
                {cpuUsage.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cpuUsage > 80 ? "bg-gradient-to-r from-red-400 to-red-500" :
                cpuUsage > 50 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                "bg-gradient-to-r from-blue-400 to-blue-500"
              }`}
              style={{ width: `${Math.min(cpuUsage, 100)}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="bg-white/60 rounded-xl border border-slate-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                <MemoryStick className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <div className="text-[0.6875rem] text-slate-500">{t('apps.taskManager.overview.memory')}</div>
                <div className="text-[0.625rem] text-slate-400">
                  {formatBytes(overview.memory?.used || 0)} / {formatBytes(overview.memory?.total || 0)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-semibold tabular-nums ${memUsage > 80 ? "text-red-500" : memUsage > 60 ? "text-amber-500" : "text-purple-600"}`}>
                {memUsage.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                memUsage > 80 ? "bg-gradient-to-r from-red-400 to-red-500" :
                memUsage > 60 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                "bg-gradient-to-r from-purple-400 to-purple-500"
              }`}
              style={{ width: `${Math.min(memUsage, 100)}%` }}
            />
          </div>
          {overview.memory?.swapTotal > 0 && (
            <div className="mt-1.5 text-[0.625rem] text-slate-400">
              {t('apps.taskManager.overview.swap')}: {formatBytes(overview.memory.swapUsed)} / {formatBytes(overview.memory.swapTotal)}
            </div>
          )}
        </div>

        {/* Disk */}
        <div className="bg-white/60 rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-[0.6875rem] text-slate-500 font-medium">{t('apps.taskManager.overview.disk')}</div>
          </div>
          {disks.length > 0 ? (
            <div className="space-y-2 max-h-[10rem] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
              {disks.map((disk, i) => {
                const pct = parseFloat(disk.usePercent) || 0
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[0.6875rem] mb-1">
                      <span className="text-slate-600 truncate max-w-[7.5rem]" title={`${disk.device} → ${disk.mountPoint}`}>
                        {disk.mountPoint}
                      </span>
                      <span className="text-slate-400 ml-2 shrink-0">
                        {formatBytes(disk.used)} / {formatBytes(disk.size)}
                        <span className={`ml-1 font-medium ${pct > 90 ? "text-red-500" : pct > 70 ? "text-amber-500" : "text-green-600"}`}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-green-400"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[0.6875rem] text-slate-400 py-2">{t('apps.taskManager.overview.noData')}</div>
          )}
        </div>

        {/* Network */}
        <div className="bg-white/60 rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
              <Network className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-[0.6875rem] text-slate-500 font-medium">{t('apps.taskManager.overview.network')}</div>
          </div>
          {network.length > 0 ? (
            <div className="space-y-1.5 max-h-[10rem] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
              {network.map((net, i) => {
                const speed = networkSpeed.find((s) => s.iface === net.interface)
                return (
                  <div key={i} className="text-[0.6875rem] py-1 border-b border-slate-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-medium">{net.interface}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-green-600 tabular-nums">
                          <span className="text-[0.5625rem] text-slate-400 mr-0.5">↓</span>
                          {formatBytes(net.rxBytes)}
                        </span>
                        <span className="text-blue-600 tabular-nums">
                          <span className="text-[0.5625rem] text-slate-400 mr-0.5">↑</span>
                          {formatBytes(net.txBytes)}
                        </span>
                      </div>
                    </div>
                    {speed && (speed.rxSpeed > 0 || speed.txSpeed > 0) && (
                      <div className="flex items-center justify-end gap-3 mt-0.5">
                        <span className="text-[0.625rem] text-green-500/70 tabular-nums">
                          ↓ {formatBytes(speed.rxSpeed)}/s
                        </span>
                        <span className="text-[0.625rem] text-blue-500/70 tabular-nums">
                          ↑ {formatBytes(speed.txSpeed)}/s
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[0.6875rem] text-slate-400 py-2">{t('apps.taskManager.overview.noData')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
