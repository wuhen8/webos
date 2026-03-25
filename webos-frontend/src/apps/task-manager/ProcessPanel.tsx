import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { Search, XCircle } from "lucide-react"
import type { ProcessInfo, SortField } from "./types"
import { formatBytes } from "./types"

export function ProcessPanel({
  processes,
  searchQuery,
  setSearchQuery,
  sortField,
  handleSort,
  SortIcon,
  onContextMenu,
}: {
  processes: ProcessInfo[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  sortField: SortField
  sortDir: string
  handleSort: (f: SortField) => void
  SortIcon: React.FC<{ field: SortField }>
  onContextMenu: (e: React.MouseEvent, pid: number) => void
}) {
  const { t } = useTranslation()
  const [selectedPid, setSelectedPid] = useState<number | null>(null)

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 transition-colors select-none whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('apps.taskManager.processes.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-[0.6875rem] text-slate-400 shrink-0">{t('apps.taskManager.processes.resultCount', { count: processes.length })}</div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass} onClick={() => handleSort("pid")} style={{ width: 60 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.pid')} <SortIcon field="pid" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("user")} style={{ width: 80 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.user')} <SortIcon field="user" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("cpu")} style={{ width: 70 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.cpuPercent')} <SortIcon field="cpu" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("mem")} style={{ width: 70 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.memoryPercent')} <SortIcon field="mem" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("rss")} style={{ width: 80 }}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.rss')} <SortIcon field="rss" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("command")}>
                <span className="flex items-center gap-1">{t('apps.taskManager.processes.command')} <SortIcon field="command" /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => (
              <tr
                key={p.pid}
                onClick={() => setSelectedPid(selectedPid === p.pid ? null : p.pid)}
                onContextMenu={(e) => onContextMenu(e, p.pid)}
                className={`border-b border-slate-50 cursor-pointer transition-colors ${
                  selectedPid === p.pid ? "bg-blue-50/80" : "hover:bg-slate-50/80"
                }`}
              >
                <td className="px-2 py-1 text-slate-600 tabular-nums font-mono">{p.pid}</td>
                <td className="px-2 py-1 text-slate-500 truncate max-w-[5rem]">{p.user}</td>
                <td className="px-2 py-1 tabular-nums">
                  <span className={`font-medium ${p.cpu > 50 ? "text-red-500" : p.cpu > 10 ? "text-amber-500" : "text-slate-600"}`}>
                    {p.cpu.toFixed(1)}
                  </span>
                </td>
                <td className="px-2 py-1 tabular-nums">
                  <span className={`font-medium ${p.mem > 50 ? "text-red-500" : p.mem > 10 ? "text-amber-500" : "text-slate-600"}`}>
                    {p.mem.toFixed(1)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 tabular-nums">{formatBytes(p.rss)}</td>
                <td className="px-2 py-1 text-slate-600 truncate max-w-[18.75rem] font-mono text-[0.625rem]" title={p.command}>
                  {p.command}
                </td>
              </tr>
            ))}
            {processes.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {searchQuery ? t('apps.taskManager.processes.noMatches') : t('apps.taskManager.overview.loading')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
