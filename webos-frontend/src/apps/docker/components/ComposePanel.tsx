import { useState } from "react"
import { useTranslation } from 'react-i18next'
import {
  ChevronDown, ChevronRight, CheckCircle2, PauseCircle, CircleDot,
  ArrowUpFromLine, ArrowDownFromLine, RotateCw, RefreshCw, Square,
  FileText, Pencil, Plus, Upload, ExternalLink, TerminalSquare,
} from "lucide-react"
import type { DockerContainer, ComposeProject } from "./types"
import { formatBytes, parsePorts } from "./types"

interface ComposePanelProps {
  projects: ComposeProject[]
  containers: DockerContainer[]
  onAction: (configFile: string, action: string) => void
  onViewLogs: (containerId: string, name: string) => void
  onTerminal: (containerId: string, name: string) => void
  onCreateProject: () => void
  onImport: () => void
  onEdit: (projectDir: string) => void
}

export function ComposePanel({
  projects, containers, onAction, onViewLogs, onTerminal, onCreateProject, onImport, onEdit,
}: ComposePanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(null)

  const handleExpand = (name: string) => {
    setExpanded(expanded === name ? null : name)
  }

  const statusColor = (status: string) => {
    const s = status?.toLowerCase() || ""
    if (s === t('apps.docker.compose.status.notStarted')) return "text-slate-400 bg-slate-100"
    if (s.includes("running")) return "text-green-600 bg-green-50"
    if (s.includes("exited") || s.includes("dead")) return "text-red-500 bg-red-50"
    return "text-slate-500 bg-slate-50"
  }

  const statusLabel = (status: string) => {
    if (!status) return status
    if (status === t('apps.docker.compose.status.notStarted')) return t('apps.docker.compose.status.notStarted')
    return status
      .replace(/running/gi, t('apps.docker.compose.status.running')).replace(/exited/gi, t('apps.docker.compose.status.exited'))
      .replace(/dead/gi, t('apps.docker.compose.status.dead')).replace(/created/gi, t('apps.docker.compose.status.created'))
      .replace(/paused/gi, t('apps.docker.compose.status.paused')).replace(/restarting/gi, t('apps.docker.compose.status.restarting'))
  }

  const statusIcon = (status: string) => {
    const s = status?.toLowerCase() || ""
    if (s === t('apps.docker.compose.status.notStarted')) return <CircleDot className="w-4 h-4 text-slate-300" />
    if (s.includes("running")) return <CheckCircle2 className="w-4 h-4 text-green-500" />
    return <CircleDot className="w-4 h-4 text-slate-400" />
  }

  const containerStateIcon = (state: string) => {
    const s = state?.toLowerCase() || ""
    if (s === "running") return <CheckCircle2 className="w-3 h-3 text-green-500" />
    if (s === "paused") return <PauseCircle className="w-3 h-3 text-amber-500" />
    if (s === "exited" || s === "dead") return <CircleDot className="w-3 h-3 text-red-400" />
    return <CircleDot className="w-3 h-3 text-slate-400" />
  }

  const containerStateLabel = (state: string) => {
    const map: Record<string, string> = {
      running: t('apps.docker.compose.containerStates.running'),
      paused: t('apps.docker.compose.containerStates.paused'),
      exited: t('apps.docker.compose.containerStates.exited'),
      dead: t('apps.docker.compose.containerStates.dead'),
      created: t('apps.docker.compose.containerStates.created'),
      restarting: t('apps.docker.compose.containerStates.restarting'),
    }
    return map[state?.toLowerCase()] || state
  }

  const btnClass = "flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-medium rounded-md transition-colors"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <button onClick={onImport} className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
          <Upload className="w-3.5 h-3.5" /> {t('apps.docker.compose.import')}
        </button>
        <button onClick={onCreateProject} className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> {t('apps.docker.compose.newProject')}
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
        {projects.map((p) => {
          const isExpanded = expanded === p.name
          return (
            <div key={p.name} className="bg-white/60 rounded-xl border border-slate-100 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => handleExpand(p.name)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  {statusIcon(p.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.8125rem] font-semibold text-slate-800">{p.name}</span>
                      {p.source === "appstore" && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full font-medium text-indigo-600 bg-indigo-50">{t('apps.docker.compose.sources.appStore')}</span>}
                      {p.source === "local" && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full font-medium text-slate-500 bg-slate-100">{t('apps.docker.compose.sources.local')}</span>}
                      {p.source === "docker" && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full font-medium text-sky-600 bg-sky-50">{t('apps.docker.compose.sources.docker')}</span>}
                    </div>
                    <div className="text-[0.625rem] text-slate-400 mt-0.5 truncate max-w-[25rem]">{p.configFile}</div>
                  </div>
                </div>
                <span className={`text-[0.625rem] px-2 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>
                  {statusLabel(p.status)}
                </span>
              </div>
              {isExpanded && p.configFile && (
                <div className="border-t border-slate-50">
                  <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
                    <button onClick={() => onAction(p.configFile, "up")} className={`${btnClass} text-green-600 bg-green-50 hover:bg-green-100`}>
                      <ArrowUpFromLine className="w-3 h-3" /> {t('apps.docker.compose.actions.up')}
                    </button>
                    <button onClick={() => onAction(p.configFile, "down")} className={`${btnClass} text-red-500 bg-red-50 hover:bg-red-100`}>
                      <ArrowDownFromLine className="w-3 h-3" /> {t('apps.docker.compose.actions.down')}
                    </button>
                    <button onClick={() => onAction(p.configFile, "restart")} className={`${btnClass} text-blue-600 bg-blue-50 hover:bg-blue-100`}>
                      <RotateCw className="w-3 h-3" /> {t('apps.docker.compose.actions.restart')}
                    </button>
                    <button onClick={() => onAction(p.configFile, "pull")} className={`${btnClass} text-purple-600 bg-purple-50 hover:bg-purple-100`}>
                      <RefreshCw className="w-3 h-3" /> {t('apps.docker.compose.actions.pull')}
                    </button>
                    <button onClick={() => onAction(p.configFile, "stop")} className={`${btnClass} text-amber-600 bg-amber-50 hover:bg-amber-100`}>
                      <Square className="w-3 h-3" /> {t('apps.docker.compose.actions.stop')}
                    </button>
                    <div className="w-px h-5 bg-slate-200 mx-1" />
                    <button onClick={() => onEdit(p.projectDir)} className={`${btnClass} text-slate-600 bg-slate-50 hover:bg-slate-100`}>
                      <Pencil className="w-3 h-3" /> {t('apps.docker.compose.actions.edit')}
                    </button>
                  </div>
                  <div className="px-4 pb-3">
                    {(() => {
                      const projectContainers = containers.filter((c) => c.composeProject === p.name)
                      return projectContainers.length > 0 ? (
                      <div className="space-y-1.5">
                        {projectContainers.map((c, i) => (
                          <div key={c.id || i} className="flex items-center gap-3 px-3 py-2 bg-slate-50/80 rounded-lg text-[0.6875rem]">
                            {containerStateIcon(c.state)}
                            <span className="font-medium text-slate-700 truncate min-w-[8rem]">{c.name || "—"}</span>
                            <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium ${
                              c.state?.toLowerCase() === "running" ? "text-green-600 bg-green-50" : "text-slate-500 bg-slate-100"
                            }`}>{containerStateLabel(c.state)}</span>
                            {c.ports && parsePorts(c.ports).length > 0 && (
                              <span className="flex items-center gap-1">
                                {parsePorts(c.ports).map((port) => (
                                  <a
                                    key={port.host}
                                    href={port.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-50 text-[0.6rem] text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer"
                                    title={t('apps.docker.compose.openPort', { url: port.url })}
                                  >
                                    :{port.host}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ))}
                              </span>
                            )}
                            <span className="text-slate-500 ml-auto">
                              CPU <span className={`font-medium tabular-nums ${c.cpuPercent ? "text-blue-600" : "text-slate-400"}`}>{c.cpuPercent ? c.cpuPercent.toFixed(2) + "%" : "--"}</span>
                            </span>
                            <span className="text-slate-500">
                              {t('apps.docker.compose.memory')} <span className={`font-medium tabular-nums ${c.memPercent ? "text-purple-600" : "text-slate-400"}`}>{c.memPercent ? c.memPercent.toFixed(2) + "%" : "--"}</span>
                            </span>
                            <span className="text-slate-400 tabular-nums text-[0.625rem]">{c.memUsage ? formatBytes(c.memUsage) + " / " + formatBytes(c.memLimit) : "--"}</span>
                            <button onClick={() => onViewLogs(c.id, c.name || c.id)} className="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 text-[0.625rem] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded transition-colors">
                              <FileText className="w-2.5 h-2.5" /> {t('apps.docker.compose.actions.logs')}
                            </button>
                            {c.state?.toLowerCase() === "running" && (
                              <button onClick={() => onTerminal(c.id, c.name || c.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[0.625rem] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded transition-colors">
                                <TerminalSquare className="w-2.5 h-2.5" /> {t('apps.docker.compose.actions.terminal')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[0.6875rem] text-slate-400 py-2">{t('apps.docker.compose.emptyContainers')}</div>
                    )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {projects.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-[0.75rem]">
            {t('apps.docker.compose.emptyProjects')}
          </div>
        )}
      </div>
    </div>
  )
}
