import { HardDrive, Database, Layers, BarChart3 } from "lucide-react"
import type { MountPointInfo, DiskInfo, LVMVolumeGroup } from "../types"
import { formatBytes, formatPercent } from "../utils"

interface Props {
  mountPoints: MountPointInfo[]
  disks: DiskInfo[]
  volumeGroups: LVMVolumeGroup[]
}

function progressColor(percent: number): string {
  if (percent >= 80) return "bg-red-500"
  if (percent >= 60) return "bg-amber-500"
  return "bg-emerald-500"
}

function progressBg(percent: number): string {
  if (percent >= 80) return "bg-red-100"
  if (percent >= 60) return "bg-amber-100"
  return "bg-emerald-100"
}

export function OverviewTab({ mountPoints, disks, volumeGroups }: Props) {
  const totalCapacity = mountPoints.reduce((s, m) => s + (m.size || 0), 0)
  const totalUsed = mountPoints.reduce((s, m) => s + (m.used || 0), 0)

  const summaryCards = [
    { icon: Database, label: "总容量", value: formatBytes(totalCapacity), color: "text-blue-600 bg-blue-50" },
    { icon: BarChart3, label: "已用", value: formatBytes(totalUsed), color: "text-amber-600 bg-amber-50" },
    { icon: Layers, label: "存储池", value: String(volumeGroups.length), color: "text-purple-600 bg-purple-50" },
    { icon: HardDrive, label: "磁盘数", value: String(disks.length), color: "text-emerald-600 bg-emerald-50" },
  ]

  return (
    <div className="h-full flex flex-col gap-3 overflow-auto">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="flex items-center gap-3 bg-white/60 rounded-xl border border-slate-200/60 px-4 py-3">
            <div className={`p-2 rounded-lg ${card.color}`}>
              <card.icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[0.6875rem] text-slate-500">{card.label}</div>
              <div className="text-sm font-semibold text-slate-800">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mount Points Table */}
      <div className="flex-1 bg-white/60 rounded-xl border border-slate-200/60 overflow-hidden">
        <table className="w-full text-[0.75rem]">
          <thead>
            <tr className="border-b border-slate-200/60 bg-slate-50/50">
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">文件系统</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">类型</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">容量</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">已用</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">可用</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-[180px]">使用率</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">挂载点</th>
            </tr>
          </thead>
          <tbody>
            {mountPoints.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">暂无挂载点数据</td>
              </tr>
            ) : (
              mountPoints.map((mp, i) => (
                <tr key={mp.mountPoint || mp.filesystem || `mp-${i}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2 text-slate-700 font-mono">{mp.filesystem}</td>
                  <td className="px-4 py-2 text-slate-500">{mp.fsType}</td>
                  <td className="px-4 py-2 text-slate-700">{formatBytes(mp.size)}</td>
                  <td className="px-4 py-2 text-slate-700">{formatBytes(mp.used)}</td>
                  <td className="px-4 py-2 text-slate-700">{formatBytes(mp.available)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 h-2 rounded-full ${progressBg(mp.usePercent)}`}>
                        <div
                          className={`h-full rounded-full transition-all ${progressColor(mp.usePercent)}`}
                          style={{ width: `${Math.min(mp.usePercent, 100)}%` }}
                        />
                      </div>
                      <span className={`text-[0.6875rem] font-medium min-w-[3rem] text-right ${
                        mp.usePercent >= 80 ? "text-red-600" : mp.usePercent >= 60 ? "text-amber-600" : "text-slate-600"
                      }`}>
                        {formatPercent(mp.usePercent)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-700 font-mono">{mp.mountPoint}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
