import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { Search, XCircle } from "lucide-react"
import type { ServiceInfo } from "./types"

export function ServicePanel({
  services,
  onContextMenu,
}: {
  services: ServiceInfo[]
  onContextMenu: (e: React.MouseEvent, serviceName: string) => void
}) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const filtered = services.filter((s) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  const activeStateColor = (state: string) => {
    switch (state) {
      case "active": return "text-green-600"
      case "failed": return "text-red-600"
      default: return "text-slate-500"
    }
  }

  const activeStateLabel = (state: string) => {
    switch (state) {
      case "active": return t('apps.taskManager.services.state.active')
      case "inactive": return t('apps.taskManager.services.state.inactive')
      case "failed": return t('apps.taskManager.services.state.failed')
      case "activating": return t('apps.taskManager.services.state.activating')
      case "deactivating": return t('apps.taskManager.services.state.deactivating')
      default: return state
    }
  }

  const enabledLabel = (enabled: string) => {
    switch (enabled) {
      case "enabled": return t('apps.taskManager.services.enabledState.enabled')
      case "disabled": return t('apps.taskManager.services.enabledState.disabled')
      case "static": return t('apps.taskManager.services.enabledState.static')
      case "masked": return t('apps.taskManager.services.enabledState.masked')
      default: return enabled
    }
  }

  const enabledColor = (enabled: string) => {
    switch (enabled) {
      case "enabled": return "text-green-600"
      case "disabled": return "text-slate-400"
      case "masked": return "text-red-500"
      default: return "text-slate-500"
    }
  }

  const thClass = "px-2 py-1.5 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('apps.taskManager.services.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-[0.6875rem] text-slate-400 shrink-0">{t('apps.taskManager.services.resultCount', { count: filtered.length })}</div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className={thClass}>{t('apps.taskManager.services.name')}</th>
              <th className={thClass}>{t('apps.taskManager.services.status')}</th>
              <th className={thClass}>{t('apps.taskManager.services.subState')}</th>
              <th className={thClass}>{t('apps.taskManager.services.enabled')}</th>
              <th className={thClass}>{t('apps.taskManager.services.description')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.name}
                onClick={() => setSelectedService(selectedService === s.name ? null : s.name)}
                onContextMenu={(e) => onContextMenu(e, s.name)}
                className={`border-b border-slate-50 cursor-pointer transition-colors ${
                  selectedService === s.name ? "bg-blue-50/80" : "hover:bg-slate-50/80"
                }`}
              >
                <td className="px-2 py-1 text-slate-700 font-mono text-[0.625rem]">{s.name}</td>
                <td className="px-2 py-1">
                  <span className={`inline-block py-0.5 rounded text-[0.625rem] font-medium ${activeStateColor(s.activeState)}`}>
                    {activeStateLabel(s.activeState)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 text-[0.625rem]">{s.subState}</td>
                <td className="px-2 py-1">
                  <span className={`text-[0.625rem] font-medium ${enabledColor(s.enabled)}`}>
                    {enabledLabel(s.enabled)}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-500 truncate max-w-[18.75rem]" title={s.description}>
                  {s.description}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {searchQuery ? t('apps.taskManager.services.noMatches') : t('apps.taskManager.overview.loading')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
