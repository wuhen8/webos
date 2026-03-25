import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from 'react-i18next'
import {
  Search,
  Download,
  Trash2,
  Play,
  Square,
  RefreshCw,
  PackageOpen,
  ExternalLink,
  ChevronLeft,
  Loader2,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Settings,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { appStoreService } from "@/lib/services/appStoreService"
import { syncInstalledApps } from "@/config/appRegistry"
import { toast } from "@/hooks/use-toast"

interface CatalogApp {
  id: string
  name: string
  description: string
  icon: string
  category: string
  type: string
  version: string
  author?: string
  defaultPort?: number
  configSchema?: ConfigField[]
  composeTemplate?: string
  shell?: Record<string, any>
  static?: { zipUrl: string }
  accessMode?: string
}

interface ConfigField {
  key: string
  label: string
  type: string
  default: any
}

interface InstalledApp {
  id: string
  appType: string
  status: string
  config: string
  manifest: {
    name: string
    description?: string
    icon?: string
    version?: string
    category?: string
    configSchema?: ConfigField[]
    accessMode?: string
    accessUrl?: string
    composeTemplate?: string
    wasmModule?: string
    background?: boolean
    pollInterval?: number
    permissions?: string[]
    fileAssociations?: any[]
    defaultSize?: { width: number; height: number }
  }
  installDir: string
  installedAt: number
  updatedAt: number
  autostart?: boolean
}

type NavSection = 'discover' | 'installed' | 'upload' | 'skills'

export default function AppStoreContent() {
  const { t } = useTranslation()
  const [nav, setNav] = useState<NavSection>('discover')
  const [catalog, setCatalog] = useState<CatalogApp[]>([])
  const [installed, setInstalled] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, any>>({})
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [externalAccess, setExternalAccess] = useState(false)
  const [editingConfigApp, setEditingConfigApp] = useState<string | null>(null)
  const [editConfigValues, setEditConfigValues] = useState<Record<string, any>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  // Load data
  const loadCatalog = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const apps = await appStoreService.getCatalog(refresh)
      setCatalog(apps || [])
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.loadFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadInstalled = useCallback(async () => {
    try {
      const apps = await appStoreService.getInstalled()
      setInstalled(apps || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadInstalled()
    loadCatalog()
  }, [loadInstalled, loadCatalog])

  useEffect(() => {
    if (nav === 'discover') {
      loadCatalog()
    }
  }, [nav, loadCatalog])

  // Listen for installed apps changes
  useEffect(() => {
    const unsub = appStoreService.onInstalledAppsChanged((apps) => {
      setInstalled(apps || [])
      setInstalling(new Set())
    })
    return unsub
  }, [])

  // Categories from catalog
  const categories = [...new Set(catalog.map((a) => a.category).filter(Boolean))]

  // Filtered catalog
  const filteredCatalog = catalog.filter((app) => {
    if (searchQuery && !app.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !app.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (categoryFilter && app.category !== categoryFilter) return false
    return true
  })

  // Install handler
  const handleInstall = async (app: CatalogApp) => {
    const config: Record<string, any> = {}
    if (app.configSchema) {
      for (const field of app.configSchema) {
        config[field.key] = configValues[field.key] ?? field.default
      }
    }
    // Docker apps: pass externalAccess flag; when off, remove port keys
    if (app.type === 'docker') {
      config._externalAccess = externalAccess
      if (!externalAccess) {
        const portKeys = (app.configSchema || []).filter(f => f.type === 'number' && /port/i.test(f.key)).map(f => f.key)
        for (const k of portKeys) {
          delete config[k]
        }
      }
    }
    setInstalling((prev) => new Set(prev).add(app.id))
    try {
      await appStoreService.install(app.id, config)
      toast({ title: t('apps.appStore.feedback.installing'), description: t('apps.appStore.feedback.installingDescription', { name: app.name }) })
      setSelectedApp(null)
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.installFailed'), description: e.message, variant: 'destructive' })
      setInstalling((prev) => { const s = new Set(prev); s.delete(app.id); return s })
    }
  }

  const handleUninstall = async (appId: string) => {
    try {
      await appStoreService.uninstall(appId)
      toast({ title: t('apps.appStore.feedback.uninstalling'), description: t('apps.appStore.feedback.uninstallingDescription') })
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.uninstallFailed'), description: e.message, variant: 'destructive' })
    }
  }

  const handleStart = async (appId: string) => {
    try {
      await appStoreService.start(appId)
      loadInstalled()
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.startFailed'), description: e.message, variant: 'destructive' })
    }
  }

  const handleStop = async (appId: string) => {
    try {
      await appStoreService.stop(appId)
      loadInstalled()
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.stopFailed'), description: e.message, variant: 'destructive' })
    }
  }

  const handleUpdate = async (appId: string) => {
    try {
      await appStoreService.update(appId)
      toast({ title: t('apps.appStore.feedback.updating'), description: t('apps.appStore.feedback.updatingDescription') })
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.updateFailed'), description: e.message, variant: 'destructive' })
    }
  }

  const getAppConfigSchema = (app: InstalledApp): ConfigField[] => {
    if (app.manifest.configSchema && app.manifest.configSchema.length > 0) {
      return app.manifest.configSchema
    }
    // Fallback to catalog if installed app has no schema
    return catalog.find((c) => c.id === app.id)?.configSchema || []
  }

  const toggleEditConfig = (app: InstalledApp) => {
    if (editingConfigApp === app.id) {
      setEditingConfigApp(null)
      return
    }
    // Parse current config from DB
    let current: Record<string, any> = {}
    try { current = JSON.parse(app.config || '{}') } catch { /* empty */ }
    // Merge with defaults from schema
    const schema = getAppConfigSchema(app)
    const defaults: Record<string, any> = {}
    for (const field of schema) {
      defaults[field.key] = field.default
    }
    setEditConfigValues({ ...defaults, ...current })
    setEditingConfigApp(app.id)
  }

  const handleSaveConfig = async (appId: string) => {
    setSavingConfig(true)
    try {
      await appStoreService.updateConfig(appId, editConfigValues)
      toast({ title: t('apps.appStore.feedback.saved'), description: t('apps.appStore.feedback.configUpdated') })
      setEditingConfigApp(null)
      loadInstalled()
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.saveFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setSavingConfig(false)
    }
  }

  // Select app and init config defaults
  const selectApp = (app: CatalogApp) => {
    const defaults: Record<string, any> = {}
    if (app.configSchema) {
      for (const field of app.configSchema) {
        defaults[field.key] = field.default
      }
    }
    setConfigValues(defaults)
    setExternalAccess(false)
    setSelectedApp(app)
  }

  const appTypeLabel = (type: string) => {
    if (type === 'docker') return 'Docker'
    if (type === 'shell') return 'Shell'
    return t('apps.appStore.common.sideloadApp')
  }

  const navItems = [
    { id: 'discover' as NavSection, label: t('apps.appStore.nav.discover'), icon: PackageOpen, color: 'bg-violet-500' },
    { id: 'skills' as NavSection, label: 'Skills', icon: Zap, color: 'bg-amber-500' },
    { id: 'installed' as NavSection, label: t('apps.appStore.nav.installed'), icon: Download, color: 'bg-emerald-500' },
    { id: 'upload' as NavSection, label: t('apps.appStore.nav.upload'), icon: Upload, color: 'bg-blue-500' },
  ]

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 640)

  return (
    <div className="flex h-full bg-[#f5f5f7]">
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-10' : 'w-[12.5rem]'} bg-[#f5f5f7]/80 backdrop-blur-2xl overflow-y-auto flex flex-col border-r border-black/[0.06] transition-all duration-200 shrink-0`}>
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pt-3 pb-2 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && <div className="text-[0.6875rem] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{t('apps.appStore.name')}</div>}
          <button onClick={() => setSidebarCollapsed(v => !v)} className="p-0.5 rounded hover:bg-black/[0.06] text-gray-500 transition-colors" title={sidebarCollapsed ? t('settings.sidebar.expand') : t('settings.sidebar.collapse')}>
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {!sidebarCollapsed && (
        <div className="flex-1 px-3 py-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setNav(item.id); setSelectedApp(null) }}
              className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg mb-0.5 transition-colors ${
                nav === item.id
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-black/[0.04] text-gray-900'
              }`}
            >
              <div className={`w-6 h-6 rounded-md ${nav === item.id ? 'bg-white/20' : item.color} flex items-center justify-center`}>
                <item.icon className={`w-3.5 h-3.5 ${nav === item.id ? 'text-white' : 'text-white'}`} />
              </div>
              <span className="text-[0.8125rem]">{item.label}</span>
              {item.id === 'installed' && installed.length > 0 && (
                <span className={`ml-auto text-[0.6875rem] ${nav === item.id ? 'text-white/70' : 'text-gray-400'}`}>
                  {installed.length}
                </span>
              )}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {nav === 'discover' && !selectedApp && (
          <div className="p-6">
            {/* Search + filter bar */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('apps.appStore.discover.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-white/80 border border-black/[0.06] text-[0.8125rem] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
              {categories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8 px-3 rounded-lg bg-white/80 border border-black/[0.06] text-[0.8125rem] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                >
                  <option value="">{t('apps.appStore.discover.allCategories')}</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button
                onClick={() => loadCatalog(true)}
                className="h-8 w-8 rounded-lg bg-white/80 border border-black/[0.06] flex items-center justify-center hover:bg-white transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading && (
              <div className="text-center py-16">
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-gray-400 animate-spin" />
                <p className="text-[0.8125rem] text-gray-400">{t('apps.appStore.common.loading')}</p>
              </div>
            )}

            {!loading && filteredCatalog.length === 0 && catalog.length > 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-[0.8125rem]">{t('apps.appStore.discover.noMatches')}</p>
              </div>
            )}

            {/* App grid */}
            {!loading && filteredCatalog.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCatalog.map((app) => {
                  const installedApp = installed.find((a) => a.id === app.id)
                  const isInstalling = installing.has(app.id) || installedApp?.status === 'installing'
                  const isRunning = installedApp?.status === 'running'
                  const isError = installedApp?.status === 'error'
                  return (
                    <div
                      key={app.id}
                      onClick={() => selectApp(app)}
                      className="bg-white/80 rounded-xl border border-black/[0.06] p-4 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        {app.icon ? (
                          <img src={app.icon} alt="" className="w-10 h-10 rounded-xl shadow-sm flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                            <PackageOpen className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[0.8125rem] font-medium text-gray-900 truncate">{app.name}</div>
                          <div className="text-[0.6875rem] text-gray-400 mt-0.5">{app.category}</div>
                        </div>
                      </div>
                      <p className="text-[0.6875rem] text-gray-500 mt-2 line-clamp-2 leading-relaxed">{app.description}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[0.625rem] text-gray-400">v{app.version} · {appTypeLabel(app.type)}{app.author ? ` · ${app.author}` : ''}</span>
                        {isInstalling ? (
                          <span className="text-[0.6875rem] text-blue-500 font-medium flex items-center gap-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('apps.appStore.common.installing')}
                          </span>
                        ) : isError ? (
                          <span className="text-[0.6875rem] text-red-500 font-medium">{t('apps.appStore.common.installFailed')}</span>
                        ) : isRunning || installedApp?.status === 'stopped' ? (
                          <span className="text-[0.6875rem] text-emerald-500 font-medium">{t('apps.appStore.common.installed')}</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); selectApp(app) }}
                            className="text-[0.6875rem] text-blue-500 font-medium hover:text-blue-600"
                          >
                            {t('apps.appStore.common.install')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* App detail view */}
        {nav === 'discover' && selectedApp && (
          <div className="p-6">
            <button
              onClick={() => setSelectedApp(null)}
              className="flex items-center gap-1 text-[0.8125rem] text-blue-500 hover:text-blue-600 mb-4"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('apps.appStore.common.back')}
            </button>

            <div className="bg-white/80 rounded-xl border border-black/[0.06] p-6">
              <div className="flex items-start gap-4 mb-5">
                {selectedApp.icon ? (
                  <img src={selectedApp.icon} alt="" className="w-16 h-16 rounded-2xl shadow-md" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-md">
                    <PackageOpen className="w-8 h-8 text-white" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">{selectedApp.name}</h2>
                  <p className="text-[0.8125rem] text-gray-500 mt-1">{selectedApp.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[0.6875rem] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{selectedApp.category}</span>
                    <span className="text-[0.6875rem] text-gray-400">v{selectedApp.version}</span>
                    <span className="text-[0.6875rem] text-gray-400">{appTypeLabel(selectedApp.type)}</span>
                    {selectedApp.author && <span className="text-[0.6875rem] text-gray-400">{selectedApp.author}</span>}
                  </div>
                </div>
              </div>

              {/* External access toggle for docker apps */}
              {selectedApp.type === 'docker' && (
                <div className="mb-5">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <h3 className="text-[0.8125rem] font-medium text-gray-700">{t('apps.appStore.details.externalAccess')}</h3>
                      <p className="text-[0.6875rem] text-gray-400 mt-0.5">{t('apps.appStore.details.externalAccessHint')}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={externalAccess}
                      onClick={() => setExternalAccess(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${externalAccess ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${externalAccess ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Config form (not for static apps) */}
              {selectedApp.configSchema && selectedApp.configSchema.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-[0.8125rem] font-medium text-gray-700 mb-3">{t('apps.appStore.details.configuration')}</h3>
                  <div className="space-y-3">
                    {selectedApp.configSchema
                      .filter((field) => {
                        // Hide port fields when external access is off for docker apps
                        if (selectedApp.type === 'docker' && !externalAccess && field.type === 'number' && /port/i.test(field.key)) {
                          return false
                        }
                        return true
                      })
                      .map((field) => (
                      <div key={field.key} className="flex items-center gap-3">
                        <label className="text-[0.8125rem] text-gray-600 w-24 flex-shrink-0">{field.label}</label>
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={configValues[field.key] ?? field.default ?? ''}
                          onChange={(e) => setConfigValues((prev) => ({
                            ...prev,
                            [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                          }))}
                          className="flex-1 h-8 px-3 rounded-lg bg-white border border-black/[0.08] text-[0.8125rem] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action button */}
              {(() => {
                const installedApp = installed.find((a) => a.id === selectedApp.id)
                const isInstalling = installing.has(selectedApp.id) || installedApp?.status === 'installing'
                const isError = installedApp?.status === 'error'
                const isInstalled = installedApp && !isError && !isInstalling

                if (isInstalling) {
                  return (
                    <div className="flex items-center gap-2 text-[0.8125rem] text-blue-500 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('apps.appStore.common.installingWithEllipsis')}
                    </div>
                  )
                }
                if (isError) {
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-[0.8125rem] text-red-500 font-medium">{t('apps.appStore.common.installFailed')}</span>
                      <button
                        onClick={() => { handleUninstall(selectedApp.id); setSelectedApp(null) }}
                        className="h-8 px-4 rounded-lg bg-red-50 text-red-600 text-[0.8125rem] font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('apps.appStore.common.uninstall')}
                      </button>
                      <button
                        onClick={() => handleInstall(selectedApp)}
                        className="h-8 px-4 rounded-lg bg-blue-500 text-white text-[0.8125rem] font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> {t('apps.appStore.common.retry')}
                      </button>
                    </div>
                  )
                }
                if (isInstalled) {
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-[0.8125rem] text-emerald-500 font-medium">{t('apps.appStore.common.installed')}</span>
                      <button
                        onClick={() => { handleUninstall(selectedApp.id); setSelectedApp(null) }}
                        className="h-8 px-4 rounded-lg bg-red-50 text-red-600 text-[0.8125rem] font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('apps.appStore.common.uninstall')}
                      </button>
                    </div>
                  )
                }
                return (
                  <button
                    onClick={() => handleInstall(selectedApp)}
                    className="h-8 px-5 rounded-lg bg-blue-500 text-white text-[0.8125rem] font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" /> {t('apps.appStore.common.install')}
                  </button>
                )
              })()}
            </div>
          </div>
        )}

        {/* Installed apps */}
        {nav === 'installed' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[0.9375rem] font-semibold text-gray-900">{t('apps.appStore.installed.title')}</h2>
              <button
                onClick={() => { loadInstalled(); syncInstalledApps() }}
                className="h-7 w-7 rounded-lg bg-white/80 border border-black/[0.06] flex items-center justify-center hover:bg-white transition-colors"
              >
                <RefreshCw className="w-3 h-3 text-gray-500" />
              </button>
            </div>

            {installed.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-[0.8125rem]">{t('apps.appStore.installed.empty')}</p>
              </div>
            )}

            <div className="space-y-2">
              {installed.map((app) => (
                <div key={app.id} className="bg-white/80 rounded-xl border border-black/[0.06] p-4">
                  <div className="flex items-center gap-3">
                    {app.manifest.icon ? (
                      <img src={app.manifest.icon} alt="" className="w-10 h-10 rounded-xl shadow-sm flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                        <PackageOpen className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.8125rem] font-medium text-gray-900">{app.manifest.name || app.id}</span>
                        <StatusBadge status={app.status} />
                      </div>
                      <div className="text-[0.6875rem] text-gray-400 mt-0.5">
                        {app.manifest.version ? `v${app.manifest.version} · ` : ''}{appTypeLabel(app.appType)}
                        {app.manifest.accessUrl && app.appType === 'docker' && (
                          <> · <a href={`http://${window.location.hostname}:${app.manifest.accessUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5">
                            {t('apps.appStore.installed.openAccess')} <ExternalLink className="w-2.5 h-2.5" />
                          </a></>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {app.status === 'running' && (app.appType === 'docker' || (app.appType === 'sideload' && app.manifest.wasmModule)) && (
                        <button
                          onClick={() => handleStop(app.id)}
                          className="h-7 px-2.5 rounded-md bg-gray-100 text-[0.75rem] text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-1"
                        >
                          <Square className="w-3 h-3" /> {t('apps.appStore.installed.stop')}
                        </button>
                      )}
                      {app.status === 'stopped' && (app.appType === 'docker' || (app.appType === 'sideload' && app.manifest.wasmModule)) && (
                        <button
                          onClick={() => handleStart(app.id)}
                          className="h-7 px-2.5 rounded-md bg-emerald-50 text-[0.75rem] text-emerald-600 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" /> {t('apps.appStore.installed.start')}
                        </button>
                      )}
                      {(app.appType === 'docker' || app.appType === 'sideload') && (
                        <button
                          onClick={() => handleUpdate(app.id)}
                          className="h-7 px-2.5 rounded-md bg-blue-50 text-[0.75rem] text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> {t('apps.appStore.installed.update')}
                        </button>
                      )}
                      <button
                        onClick={() => handleUninstall(app.id)}
                        className="h-7 px-2.5 rounded-md bg-red-50 text-[0.75rem] text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> {t('apps.appStore.common.uninstall')}
                      </button>
                      {getAppConfigSchema(app).length > 0 ? (
                        <button
                          onClick={() => toggleEditConfig(app)}
                          className={`h-7 px-2.5 rounded-md text-[0.75rem] transition-colors flex items-center gap-1 ${
                            editingConfigApp === app.id
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Settings className="w-3 h-3" />
                          {editingConfigApp === app.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {/* Expandable config editor */}
                  {editingConfigApp === app.id && (() => {
                    const schema = getAppConfigSchema(app)
                    return (
                      <div className="mt-3 pt-3 border-t border-black/[0.06]">
                        <div className="space-y-2">
                          {schema.map((field) => (
                            <div key={field.key} className="flex items-center gap-3">
                              <label className="text-[0.75rem] text-gray-600 w-28 flex-shrink-0">{field.label}</label>
                              <input
                                type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                                value={editConfigValues[field.key] ?? ''}
                                onChange={(e) => setEditConfigValues((prev) => ({
                                  ...prev,
                                  [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                                }))}
                                className="flex-1 h-7 px-2.5 rounded-md bg-white border border-black/[0.08] text-[0.75rem] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end mt-3">
                          <button
                            onClick={() => handleSaveConfig(app.id)}
                            disabled={savingConfig}
                            className="h-7 px-3 rounded-md bg-blue-500 text-[0.75rem] text-white hover:bg-blue-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            {t('apps.appStore.installed.save')}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills marketplace */}
        {nav === 'skills' && (
          <SkillsSection />
        )}

        {/* Upload static app */}
        {nav === 'upload' && (
          <UploadSection onUploaded={() => { loadInstalled(); syncInstalledApps() }} />
        )}

      </div>
    </div>
  )
}

interface CatalogSkill {
  id: string
  name: string
  description: string
  icon: string
  version: string
  author: string
  zipUrl: string
}

interface InstalledSkill {
  id: string
  name: string
  description: string
  version?: string
}

function SkillsSection() {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<CatalogSkill[]>([])
  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkill | null>(null)
  const [operating, setOperating] = useState<Set<string>>(new Set())

  const loadData = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const [skills, inst] = await Promise.all([
        appStoreService.getSkillsCatalog(refresh),
        appStoreService.getInstalledSkills(),
      ])
      setCatalog(skills || [])
      setInstalled(inst || [])
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.loadFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  const filtered = catalog.filter((s) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  const isInstalled = (id: string) => installed.some((s) => s.id === id)

  const handleInstall = async (skill: CatalogSkill) => {
    setOperating((prev) => new Set(prev).add(skill.id))
    try {
      await appStoreService.installSkill(skill.id, skill.zipUrl)
      toast({ title: t('apps.appStore.feedback.installSucceeded'), description: t('apps.appStore.feedback.skillInstalled', { name: skill.name }) })
      const inst = await appStoreService.getInstalledSkills()
      setInstalled(inst || [])
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.installFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setOperating((prev) => { const s = new Set(prev); s.delete(skill.id); return s })
    }
  }

  const handleUninstall = async (skillId: string) => {
    setOperating((prev) => new Set(prev).add(skillId))
    try {
      await appStoreService.uninstallSkill(skillId)
      toast({ title: t('apps.appStore.feedback.uninstalled'), description: t('apps.appStore.feedback.skillUninstalled') })
      const inst = await appStoreService.getInstalledSkills()
      setInstalled(inst || [])
      if (selectedSkill?.id === skillId) setSelectedSkill(null)
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.uninstallFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setOperating((prev) => { const s = new Set(prev); s.delete(skillId); return s })
    }
  }

  if (selectedSkill) {
    const inst = isInstalled(selectedSkill.id)
    const busy = operating.has(selectedSkill.id)
    return (
      <div className="p-6">
        <button
          onClick={() => setSelectedSkill(null)}
          className="flex items-center gap-1 text-[0.8125rem] text-blue-500 hover:text-blue-600 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('apps.appStore.common.back')}
        </button>
        <div className="bg-white/80 rounded-xl border border-black/[0.06] p-6">
          <div className="flex items-start gap-4 mb-5">
            {selectedSkill.icon ? (
              <img src={selectedSkill.icon} alt="" className="w-16 h-16 rounded-2xl shadow-md" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                <Zap className="w-8 h-8 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">{selectedSkill.name}</h2>
              <p className="text-[0.8125rem] text-gray-500 mt-1">{selectedSkill.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[0.6875rem] text-gray-400">v{selectedSkill.version}</span>
                <span className="text-[0.6875rem] text-gray-400">{selectedSkill.author}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {busy ? (
              <div className="flex items-center gap-2 text-[0.8125rem] text-blue-500 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('apps.appStore.common.processingWithEllipsis')}
              </div>
            ) : inst ? (
              <>
                <span className="text-[0.8125rem] text-emerald-500 font-medium">{t('apps.appStore.common.installed')}</span>
                <button
                  onClick={() => handleUninstall(selectedSkill.id)}
                  className="h-8 px-4 rounded-lg bg-red-50 text-red-600 text-[0.8125rem] font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t('apps.appStore.common.uninstall')}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleInstall(selectedSkill)}
                className="h-8 px-5 rounded-lg bg-blue-500 text-white text-[0.8125rem] font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> {t('apps.appStore.common.install')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder={t('apps.appStore.skills.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-white/80 border border-black/[0.06] text-[0.8125rem] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
          />
        </div>
        <button
          onClick={() => loadData(true)}
          className="h-8 w-8 rounded-lg bg-white/80 border border-black/[0.06] flex items-center justify-center hover:bg-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-gray-400 animate-spin" />
          <p className="text-[0.8125rem] text-gray-400">{t('apps.appStore.common.loading')}</p>
        </div>
      )}

      {!loading && filtered.length === 0 && catalog.length > 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-[0.8125rem]">{t('apps.appStore.skills.noMatches')}</p>
        </div>
      )}

      {!loading && catalog.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-[0.8125rem]">{t('apps.appStore.skills.empty')}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((skill) => {
            const inst = isInstalled(skill.id)
            const busy = operating.has(skill.id)
            return (
              <div
                key={skill.id}
                onClick={() => setSelectedSkill(skill)}
                className="bg-white/80 rounded-xl border border-black/[0.06] p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {skill.icon ? (
                    <img src={skill.icon} alt="" className="w-10 h-10 rounded-xl shadow-sm flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.8125rem] font-medium text-gray-900 truncate">{skill.name}</div>
                    <div className="text-[0.6875rem] text-gray-400 mt-0.5">{skill.author}</div>
                  </div>
                </div>
                <p className="text-[0.6875rem] text-gray-500 mt-2 line-clamp-2 leading-relaxed">{skill.description}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[0.625rem] text-gray-400">v{skill.version}</span>
                  {busy ? (
                    <span className="text-[0.6875rem] text-blue-500 font-medium flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('apps.appStore.common.processing')}
                    </span>
                  ) : inst ? (
                    <span className="text-[0.6875rem] text-emerald-500 font-medium">{t('apps.appStore.common.installed')}</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleInstall(skill) }}
                      className="text-[0.6875rem] text-blue-500 font-medium hover:text-blue-600"
                    >
                      {t('apps.appStore.common.install')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UploadSection({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast({ title: t('apps.appStore.upload.invalidFormat'), description: t('apps.appStore.upload.invalidFormatDescription'), variant: 'destructive' })
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: t('apps.appStore.upload.fileTooLarge'), description: t('apps.appStore.upload.fileTooLargeDescription'), variant: 'destructive' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('fm_token') || ''
      const resp = await fetch('/api/webapps/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data.error || t('apps.appStore.upload.uploadFailed'))
      }
      toast({ title: t('apps.appStore.feedback.installSucceeded'), description: t('apps.appStore.feedback.appInstalled', { name: data.app?.name || t('apps.appStore.common.app') }) })
      onUploaded()
    } catch (e: any) {
      toast({ title: t('apps.appStore.feedback.installFailed'), description: e.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="p-6">
      <h2 className="text-[0.9375rem] font-semibold text-gray-900 mb-5">{t('apps.appStore.upload.title')}</h2>
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-black/[0.08] bg-white/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div>
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-500 animate-spin" />
            <p className="text-[0.8125rem] text-gray-500">{t('apps.appStore.upload.uploading')}</p>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-[0.8125rem] text-gray-600 mb-1">{t('apps.appStore.upload.dropZip')}</p>
            <p className="text-[0.6875rem] text-gray-400 mb-4">{t('apps.appStore.upload.selectFileHint')}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-5 rounded-lg bg-blue-500 text-white text-[0.8125rem] font-medium hover:bg-blue-600 transition-colors"
            >
              {t('apps.appStore.upload.selectFile')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
      <div className="mt-5 bg-white/80 rounded-xl border border-black/[0.06] p-4">
        <h3 className="text-[0.8125rem] font-medium text-gray-700 mb-2">{t('apps.appStore.upload.requirementsTitle')}</h3>
        <ul className="text-[0.6875rem] text-gray-500 space-y-1 list-disc list-inside">
          <li>{t('apps.appStore.upload.requirementManifestAndIndex')} <code className="bg-gray-100 px-1 rounded">manifest.json</code> {t('apps.appStore.upload.requirementAnd')} <code className="bg-gray-100 px-1 rounded">index.html</code></li>
          <li>{t('apps.appStore.upload.requirementManifestFields')}</li>
          <li>{t('apps.appStore.upload.requirementSdkPrefix')} <code className="bg-gray-100 px-1 rounded">/webos-sdk.js</code> {t('apps.appStore.upload.requirementSdkSuffix')}</li>
          <li>{t('apps.appStore.upload.requirementAppId')}</li>
        </ul>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const styles: Record<string, string> = {
    running: 'bg-emerald-100 text-emerald-700',
    stopped: 'bg-gray-100 text-gray-500',
    installing: 'bg-blue-100 text-blue-600',
    error: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = {
    running: t('apps.appStore.status.running'),
    stopped: t('apps.appStore.status.stopped'),
    installing: t('apps.appStore.status.installing'),
    error: t('apps.appStore.status.error'),
  }
  return (
    <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full font-medium ${styles[status] || styles.error}`}>
      {labels[status] || status}
    </span>
  )
}
