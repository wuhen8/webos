import { useState } from "react"
import { useTranslation } from 'react-i18next'
import {
  Search, Play, Square, RotateCw, Trash2, FileText,
  CheckCircle2, PauseCircle, CircleDot, ExternalLink, TerminalSquare,
} from "lucide-react"
import type { DockerContainer } from "./types"
import { formatBytes, parsePorts } from "./types"

interface ContainersPanelProps {
  containers: DockerContainer[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  onAction: (id: string, action: string) => void
  onRemove: (id: string) => void
  onViewLogs: (id: string, name: string) => void
  onTerminal: (id: string, name: string) => void
}

export function ContainersPanel({
  containers, searchQuery, setSearchQuery, onAction, onRemove, onViewLogs, onTerminal,
}: ContainersPanelProps) {
  const { t } = useTranslation()
  const filtered = containers.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.image?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q)
  })

  const stateIcon = (state: string) => {
    const s = state?.toLowerCase()
    if (s === "running") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
    if (s === "paused") return <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
    if (s === "exited" || s === "dead") return <CircleDot className="w-3.5 h-3.5 text-red-400" />
    return <CircleDot className="w-3.5 h-3.5 text-slate-400" />
  }

  const stateLabel = (state: string) => {
    const map: Record<string, string> = {
      running: t('apps.docker.containers.states.running'),
      paused: t('apps.docker.containers.states.paused'),
      exited: t('apps.docker.containers.states.exited'),
      dead: t('apps.docker.containers.states.dead'),
      created: t('apps.docker.containers.states.created'),
      restarting: t('apps.docker.containers.states.restarting'),
    }
    return map[state?.toLowerCase()] || state
  }

  const stateColor = (state: string) => {
    const s = state?.toLowerCase()
    if (s === "running") return "text-green-600 bg-green-50"
    if (s === "paused") return "text-amber-600 bg-amber-50"
    return "text-slate-500 bg-slate-50"
  }

  const btnClass = "p-1 rounded-md transition-colors"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('apps.docker.containers.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
        {filtered.map((c) => (
          <div key={c.id} className="bg-white/60 rounded-lg border border-slate-100 p-3 hover:border-slate-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {stateIcon(c.state)}
                  <span className="text-[0.75rem] font-semibold text-slate-800 truncate">{c.name}</span>
                  <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full font-medium ${stateColor(c.state)}`}>
                    {stateLabel(c.state)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[0.625rem] text-slate-400">
                  <span className="font-mono">{c.shortId}</span>
                  <span className="text-slate-300">|</span>
                  <span className="truncate max-w-[12.5rem]">{c.image}</span>
                  {c.ports && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {parsePorts(c.ports).map((p) => (
                          <a
                            key={p.host}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer"
                            title={t('apps.docker.containers.openPort', { url: p.url })}
                          >
                            {p.host}<span className="text-blue-300">:</span>{p.container}/{p.protocol}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                        {parsePorts(c.ports).length === 0 && (
                          <span className="truncate max-w-[12.5rem]">{c.ports}</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-[0.625rem] text-slate-400 mt-0.5">{c.status}</div>
                {c.state?.toLowerCase() === "running" && (
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[0.625rem] text-slate-500">
                      CPU <span className={`font-medium tabular-nums ${c.cpuPercent > 50 ? "text-red-500" : c.cpuPercent > 20 ? "text-amber-500" : "text-blue-600"}`}>{c.cpuPercent.toFixed(2)}%</span>
                    </span>
                    <span className="text-[0.625rem] text-slate-500">
                      {t('apps.docker.containers.memory')} <span className={`font-medium tabular-nums ${c.memPercent > 80 ? "text-red-500" : c.memPercent > 50 ? "text-amber-500" : "text-purple-600"}`}>{c.memPercent.toFixed(2)}%</span>
                    </span>
                    <span className="text-[0.625rem] text-slate-400 tabular-nums">{formatBytes(c.memUsage)} / {formatBytes(c.memLimit)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 ml-2 shrink-0">
                {c.state?.toLowerCase() === "running" ? (
                  <>
                    <button onClick={() => onAction(c.id, "stop")} className={`${btnClass} text-slate-400 hover:text-amber-500 hover:bg-amber-50`} title={t('apps.docker.containers.actions.stop')}>
                      <Square className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onAction(c.id, "restart")} className={`${btnClass} text-slate-400 hover:text-blue-500 hover:bg-blue-50`} title={t('apps.docker.containers.actions.restart')}>
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onTerminal(c.id, c.name)} className={`${btnClass} text-slate-400 hover:text-emerald-500 hover:bg-emerald-50`} title={t('apps.docker.containers.actions.terminal')}>
                      <TerminalSquare className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => onAction(c.id, "start")} className={`${btnClass} text-slate-400 hover:text-green-500 hover:bg-green-50`} title={t('apps.docker.containers.actions.start')}>
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => onViewLogs(c.id, c.name)} className={`${btnClass} text-slate-400 hover:text-slate-600 hover:bg-slate-100`} title={t('apps.docker.containers.actions.logs')}>
                  <FileText className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onRemove(c.id)} className={`${btnClass} text-slate-300 hover:text-red-500 hover:bg-red-50`} title={t('apps.docker.containers.actions.delete')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-[0.75rem]">
            {searchQuery ? t('apps.docker.containers.noMatches') : t('apps.docker.containers.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
