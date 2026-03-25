import { useState, useEffect, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import FmEdit from "@/components/FmEdit"
import { useSettingsStore, useUIStore } from "@/stores"
import { dockerService } from "@/lib/services"
import { useToast } from "@/hooks/use-toast"
import {
  Save,
  RotateCw,
  Plus,
  Trash2,
  FileText,
  Code2,
  Loader2,
} from "lucide-react"

interface DaemonConfig {
  "registry-mirrors"?: string[]
  "data-root"?: string
  dns?: string[]
  "insecure-registries"?: string[]
  "log-driver"?: string
  "log-opts"?: Record<string, string>
  "storage-driver"?: string
  "exec-opts"?: string[]
  "live-restore"?: boolean
  ipv6?: boolean
  "fixed-cidr-v6"?: string
  iptables?: boolean
  hosts?: string[]
  [key: string]: unknown
}

const LOG_DRIVERS = ["json-file", "local", "journald", "syslog", "none"]
const STORAGE_DRIVERS = ["overlay2", "btrfs", "zfs", "devicemapper"]
const CGROUP_DRIVERS = ["systemd", "cgroupfs"]

export default function DockerSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const dockerDaemonConfigRead = dockerService.daemonConfigRead
  const dockerDaemonConfigWrite = dockerService.daemonConfigWrite
  const dockerDaemonRestart = dockerService.daemonRestart
  const dataDir = useSettingsStore((s) => s.dataDir)
  const composeBaseDir = dataDir ? dataDir + '/compose' : ''
  const showConfirm = useUIStore((s) => s.showConfirm)

  const [viewMode, setViewMode] = useState<"form" | "json">("form")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)

  // Full config preserves unknown fields
  const [fullConfig, setFullConfig] = useState<DaemonConfig>({})

  // Form fields
  const [registryMirrors, setRegistryMirrors] = useState<string[]>([])
  const [dataRoot, setDataRoot] = useState("")
  const [dns, setDns] = useState<string[]>([])
  const [insecureRegistries, setInsecureRegistries] = useState<string[]>([])
  const [logDriver, setLogDriver] = useState("json-file")
  const [logMaxSize, setLogMaxSize] = useState("")
  const [logMaxFile, setLogMaxFile] = useState("")
  const [storageDriver, setStorageDriver] = useState("")
  const [cgroupDriver, setCgroupDriver] = useState("")
  const [liveRestore, setLiveRestore] = useState(false)
  const [ipv6Enabled, setIpv6Enabled] = useState(false)
  const [fixedCidrV6, setFixedCidrV6] = useState("")
  const [iptablesEnabled, setIptablesEnabled] = useState(true)
  const [dockerHosts, setDockerHosts] = useState<string[]>([])

  // JSON editor content
  const [jsonContent, setJsonContent] = useState("{}")

  // Parse config object into form fields
  const configToForm = useCallback((cfg: DaemonConfig) => {
    setRegistryMirrors(cfg["registry-mirrors"] || [])
    setDataRoot(cfg["data-root"] || "")
    setDns(cfg.dns || [])
    setInsecureRegistries(cfg["insecure-registries"] || [])
    setLogDriver(cfg["log-driver"] || "json-file")
    setLogMaxSize(cfg["log-opts"]?.["max-size"] || "")
    setLogMaxFile(cfg["log-opts"]?.["max-file"] || "")
    setStorageDriver(cfg["storage-driver"] || "")
    // cgroup driver is stored in exec-opts as "native.cgroupdriver=xxx"
    const cgroupOpt = (cfg["exec-opts"] || []).find((o) => o.startsWith("native.cgroupdriver="))
    setCgroupDriver(cgroupOpt ? cgroupOpt.split("=")[1] || "" : "")
    setLiveRestore(cfg["live-restore"] || false)
    setIpv6Enabled(cfg.ipv6 || false)
    setFixedCidrV6(cfg["fixed-cidr-v6"] || "")
    setIptablesEnabled(cfg.iptables !== false)
    setDockerHosts(cfg.hosts || [])
  }, [])

  // Merge form fields into fullConfig (incremental merge)
  const formToConfig = useCallback((): DaemonConfig => {
    const cfg = { ...fullConfig }

    // registry-mirrors
    const mirrors = registryMirrors.filter(Boolean)
    if (mirrors.length > 0) cfg["registry-mirrors"] = mirrors
    else delete cfg["registry-mirrors"]

    // data-root
    if (dataRoot.trim()) cfg["data-root"] = dataRoot.trim()
    else delete cfg["data-root"]

    // dns
    const dnsArr = dns.filter(Boolean)
    if (dnsArr.length > 0) cfg.dns = dnsArr
    else delete cfg.dns

    // insecure-registries
    const insecure = insecureRegistries.filter(Boolean)
    if (insecure.length > 0) cfg["insecure-registries"] = insecure
    else delete cfg["insecure-registries"]

    // log-driver
    if (logDriver && logDriver !== "json-file") cfg["log-driver"] = logDriver
    else delete cfg["log-driver"]

    // log-opts
    if (logDriver === "json-file" && (logMaxSize || logMaxFile)) {
      const opts: Record<string, string> = {}
      if (logMaxSize) opts["max-size"] = logMaxSize
      if (logMaxFile) opts["max-file"] = logMaxFile
      cfg["log-opts"] = opts
    } else {
      delete cfg["log-opts"]
    }

    // storage-driver
    if (storageDriver) cfg["storage-driver"] = storageDriver
    else delete cfg["storage-driver"]

    // cgroup driver via exec-opts
    // Preserve other exec-opts entries, only manage native.cgroupdriver
    const existingExecOpts = (fullConfig["exec-opts"] || []).filter((o) => !o.startsWith("native.cgroupdriver="))
    if (cgroupDriver) {
      cfg["exec-opts"] = [...existingExecOpts, `native.cgroupdriver=${cgroupDriver}`]
    } else if (existingExecOpts.length > 0) {
      cfg["exec-opts"] = existingExecOpts
    } else {
      delete cfg["exec-opts"]
    }

    // live-restore
    if (liveRestore) cfg["live-restore"] = true
    else delete cfg["live-restore"]

    // ipv6
    if (ipv6Enabled) {
      cfg.ipv6 = true
      if (fixedCidrV6.trim()) cfg["fixed-cidr-v6"] = fixedCidrV6.trim()
      else delete cfg["fixed-cidr-v6"]
    } else {
      delete cfg.ipv6
      delete cfg["fixed-cidr-v6"]
    }

    // iptables
    if (!iptablesEnabled) cfg.iptables = false
    else delete cfg.iptables

    // hosts (socket path)
    const hosts = dockerHosts.filter(Boolean)
    if (hosts.length > 0) cfg.hosts = hosts
    else delete cfg.hosts

    return cfg
  }, [fullConfig, registryMirrors, dataRoot, dns, insecureRegistries, logDriver, logMaxSize, logMaxFile, storageDriver, cgroupDriver, liveRestore, ipv6Enabled, fixedCidrV6, iptablesEnabled, dockerHosts])

  // Load config on mount
  useEffect(() => {
    setLoading(true)
    dockerDaemonConfigRead()
      .then((data) => {
        try {
          const cfg = JSON.parse(data.content) as DaemonConfig
          setFullConfig(cfg)
          configToForm(cfg)
          setJsonContent(JSON.stringify(cfg, null, 2))
        } catch {
          setFullConfig({})
          configToForm({})
          setJsonContent("{}")
        }
      })
      .catch((err) => {
        toast({ title: t('apps.docker.settings.feedback.loadFailed'), description: err?.message || t('apps.docker.settings.feedback.readDaemonFailed'), variant: "destructive" })
      })
      .finally(() => setLoading(false))
  }, [])

  // Switch views
  const switchToJson = useCallback(() => {
    const merged = formToConfig()
    setFullConfig(merged)
    setJsonContent(JSON.stringify(merged, null, 2))
    setViewMode("json")
  }, [formToConfig])

  const switchToForm = useCallback(() => {
    try {
      const cfg = JSON.parse(jsonContent) as DaemonConfig
      setFullConfig(cfg)
      configToForm(cfg)
    } catch {
      toast({ title: t('apps.docker.settings.feedback.invalidJson'), description: t('apps.docker.settings.feedback.parseJsonFailed'), variant: "destructive" })
      return
    }
    setViewMode("form")
  }, [jsonContent, configToForm, toast])

  // Save
  const handleSave = async () => {
    setSaving(true)
    try {
      let content: string
      if (viewMode === "json") {
        // Validate JSON
        JSON.parse(jsonContent)
        content = jsonContent
      } else {
        const merged = formToConfig()
        content = JSON.stringify(merged, null, 2)
      }
      await dockerDaemonConfigWrite(content)
      // Update fullConfig after save
      try {
        const cfg = JSON.parse(content) as DaemonConfig
        setFullConfig(cfg)
        if (viewMode === "form") {
          setJsonContent(JSON.stringify(cfg, null, 2))
        }
      } catch {}
      toast({ title: t('apps.docker.settings.feedback.saveSuccess'), description: t('apps.docker.settings.feedback.daemonUpdated') })
      // Ask to restart
      showConfirm({
        title: t('apps.docker.settings.confirm.restartTitle'),
        description: t('apps.docker.settings.confirm.restartDescription'),
        confirmText: t('apps.docker.settings.confirm.restartAction'),
        onConfirm: () => handleRestart(),
      })
    } catch (err: any) {
      toast({ title: t('apps.docker.settings.feedback.saveFailed'), description: err?.message || t('apps.docker.settings.feedback.writeFailed'), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Restart Docker
  const handleRestart = async () => {
    setRestarting(true)
    try {
      await dockerDaemonRestart()
      toast({ title: t('apps.docker.settings.feedback.restartSuccess'), description: t('apps.docker.settings.feedback.dockerRestarted') })
    } catch (err: any) {
      toast({ title: t('apps.docker.settings.feedback.restartFailed'), description: err?.message || t('apps.docker.settings.feedback.restartFailed'), variant: "destructive" })
    } finally {
      setRestarting(false)
    }
  }

  // Array field helpers
  const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, ""])
  }
  const updateItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number, value: string) => {
    setter((prev) => prev.map((v, i) => (i === idx ? value : v)))
  }
  const removeItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) => {
    setter((prev) => prev.filter((_, i) => i !== idx))
  }

  const inputClass =
    "w-full px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
  const smallInputClass =
    "px-2 py-1 text-[0.6875rem] bg-white/70 border border-slate-200 rounded-md outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
  const labelClass = "text-[0.6875rem] font-medium text-slate-600 mb-1 block"
  const sectionClass = "bg-white/60 rounded-lg border border-slate-100 p-4"

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('apps.docker.settings.loading')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={viewMode === "json" ? switchToForm : undefined}
            className={`flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors ${
              viewMode === "form"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="w-3 h-3" /> {t('apps.docker.settings.view.form')}
          </button>
          <button
            onClick={viewMode === "form" ? switchToJson : undefined}
            className={`flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors ${
              viewMode === "json"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Code2 className="w-3 h-3" /> JSON
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} /> {t('apps.docker.settings.actions.restartDocker')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-3 h-3" /> {saving ? t('apps.docker.settings.actions.saving') : t('apps.docker.settings.actions.saveConfig')}
          </button>
        </div>
      </div>

      {/* Form View */}
      {viewMode === "form" && (
        <div className="flex-1 overflow-auto space-y-4 pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>
          {/* Registry Mirrors */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.registryMirrors.title')}</label>
              <button onClick={() => addItem(setRegistryMirrors)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> {t('apps.docker.settings.common.add')}
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.registryMirrors.description')}</p>
            {registryMirrors.map((m, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={m}
                  onChange={(e) => updateItem(setRegistryMirrors, i, e.target.value)}
                  placeholder="https://mirror.example.com"
                  className={`${smallInputClass} flex-1`}
                />
                <button onClick={() => removeItem(setRegistryMirrors, i)} className="p-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {registryMirrors.length === 0 && (
              <div className="text-[0.625rem] text-slate-300">{t('apps.docker.settings.registryMirrors.empty')}</div>
            )}
          </div>

          {/* Data Root */}
          <div className={sectionClass}>
            <label className={labelClass}>{t('apps.docker.settings.dataRoot.title')}</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.dataRoot.description')}</p>
            <input
              type="text"
              value={dataRoot}
              onChange={(e) => setDataRoot(e.target.value)}
              placeholder="/var/lib/docker"
              className={inputClass}
            />
          </div>

          {/* DNS */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.dns.title')}</label>
              <button onClick={() => addItem(setDns)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> {t('apps.docker.settings.common.add')}
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.dns.description')}</p>
            {dns.map((d, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => updateItem(setDns, i, e.target.value)}
                  placeholder="8.8.8.8"
                  className={`${smallInputClass} flex-1`}
                />
                <button onClick={() => removeItem(setDns, i)} className="p-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {dns.length === 0 && (
              <div className="text-[0.625rem] text-slate-300">{t('apps.docker.settings.dns.empty')}</div>
            )}
          </div>

          {/* Insecure Registries */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.insecureRegistries.title')}</label>
              <button onClick={() => addItem(setInsecureRegistries)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> {t('apps.docker.settings.common.add')}
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.insecureRegistries.description')}</p>
            {insecureRegistries.map((r, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={r}
                  onChange={(e) => updateItem(setInsecureRegistries, i, e.target.value)}
                  placeholder="192.168.1.100:5000"
                  className={`${smallInputClass} flex-1`}
                />
                <button onClick={() => removeItem(setInsecureRegistries, i)} className="p-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {insecureRegistries.length === 0 && (
              <div className="text-[0.625rem] text-slate-300">{t('apps.docker.settings.insecureRegistries.empty')}</div>
            )}
          </div>

          {/* IPv6 */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.ipv6.title')}</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">{t('apps.docker.settings.ipv6.description')}</p>
              </div>
              <button
                onClick={() => setIpv6Enabled(!ipv6Enabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${ipv6Enabled ? "bg-blue-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ipv6Enabled ? "left-[1.125rem]" : "left-0.5"}`} />
              </button>
            </div>
            {ipv6Enabled && (
              <div className="mt-3">
                <label className={labelClass}>{t('apps.docker.settings.ipv6.subnet')}</label>
                <input
                  type="text"
                  value={fixedCidrV6}
                  onChange={(e) => setFixedCidrV6(e.target.value)}
                  placeholder="fd00::/80"
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* Log Driver & Options */}
          <div className={sectionClass}>
            <label className="text-[0.75rem] font-semibold text-slate-700 mb-2 block">{t('apps.docker.settings.logConfig.title')}</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>{t('apps.docker.settings.logConfig.driver')}</label>
                <select
                  value={logDriver}
                  onChange={(e) => setLogDriver(e.target.value)}
                  className={inputClass}
                >
                  {LOG_DRIVERS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              {logDriver === "json-file" && (
                <>
                  <div>
                    <label className={labelClass}>{t('apps.docker.settings.logConfig.maxSize')}</label>
                    <input
                      type="text"
                      value={logMaxSize}
                      onChange={(e) => setLogMaxSize(e.target.value)}
                      placeholder="10m"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('apps.docker.settings.logConfig.maxFile')}</label>
                    <input
                      type="text"
                      value={logMaxFile}
                      onChange={(e) => setLogMaxFile(e.target.value)}
                      placeholder="3"
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Storage Driver */}
          <div className={sectionClass}>
            <label className={labelClass}>{t('apps.docker.settings.storageDriver.title')}</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.storageDriver.description')}</p>
            <select
              value={storageDriver}
              onChange={(e) => setStorageDriver(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('apps.docker.settings.common.default')}</option>
              {STORAGE_DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Cgroup Driver */}
          <div className={sectionClass}>
            <label className={labelClass}>{t('apps.docker.settings.cgroupDriver.title')}</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.cgroupDriver.description')}</p>
            <select
              value={cgroupDriver}
              onChange={(e) => setCgroupDriver(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('apps.docker.settings.common.default')}</option>
              {CGROUP_DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Live Restore */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.liveRestore.title')}</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">{t('apps.docker.settings.liveRestore.description')}</p>
              </div>
              <button
                onClick={() => setLiveRestore(!liveRestore)}
                className={`relative w-9 h-5 rounded-full transition-colors ${liveRestore ? "bg-blue-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${liveRestore ? "left-[1.125rem]" : "left-0.5"}`} />
              </button>
            </div>
          </div>

          {/* iptables */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.iptables.title')}</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">{t('apps.docker.settings.iptables.description')}</p>
              </div>
              <button
                onClick={() => setIptablesEnabled(!iptablesEnabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${iptablesEnabled ? "bg-blue-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${iptablesEnabled ? "left-[1.125rem]" : "left-0.5"}`} />
              </button>
            </div>
          </div>

          {/* Socket Path (hosts) */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.settings.socketHosts.title')}</label>
              <button onClick={() => addItem(setDockerHosts)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> {t('apps.docker.settings.common.add')}
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.socketHosts.description')}</p>
            {dockerHosts.map((h, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={h}
                  onChange={(e) => updateItem(setDockerHosts, i, e.target.value)}
                  placeholder="unix:///var/run/docker.sock"
                  className={`${smallInputClass} flex-1`}
                />
                <button onClick={() => removeItem(setDockerHosts, i)} className="p-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {dockerHosts.length === 0 && (
              <div className="text-[0.625rem] text-slate-300">{t('apps.docker.settings.socketHosts.empty')}</div>
            )}
          </div>

          {/* Compose Base Dir - moved from system settings */}
          <div className={sectionClass}>
            <label className={labelClass}>{t('apps.docker.settings.composeBaseDir.title')}</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">{t('apps.docker.settings.composeBaseDir.description')}</p>
            <input
              type="text"
              value={composeBaseDir}
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-500 cursor-not-allowed`}
            />
          </div>
        </div>
      )}

      {/* JSON View */}
      {viewMode === "json" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="text-[0.625rem] text-slate-400 mb-1.5">
            {t('apps.docker.settings.jsonHint')}
          </div>
          <div className="flex-1 rounded-lg overflow-hidden border border-slate-200">
            <FmEdit
              value={jsonContent}
              onChange={(value) => setJsonContent(value || "{}")}
              language="json"
              theme="vs-dark"
              fontSize={13}
            />
          </div>
        </div>
      )}
    </div>
  )
}
