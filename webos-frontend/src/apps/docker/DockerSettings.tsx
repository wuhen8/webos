import { useState, useEffect, useCallback } from "react"
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
        toast({ title: "加载失败", description: err?.message || "无法读取 daemon.json", variant: "destructive" })
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
      toast({ title: "JSON 格式错误", description: "无法解析 JSON，请检查格式", variant: "destructive" })
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
      toast({ title: "保存成功", description: "daemon.json 已更新" })
      // Ask to restart
      showConfirm({
        title: "重启 Docker",
        description: "配置已保存，是否立即重启 Docker 使配置生效？",
        confirmText: "重启",
        onConfirm: () => handleRestart(),
      })
    } catch (err: any) {
      toast({ title: "保存失败", description: err?.message || "写入失败", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Restart Docker
  const handleRestart = async () => {
    setRestarting(true)
    try {
      await dockerDaemonRestart()
      toast({ title: "重启成功", description: "Docker 服务已重启" })
    } catch (err: any) {
      toast({ title: "重启失败", description: err?.message || "重启失败", variant: "destructive" })
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
        <Loader2 className="w-4 h-4 animate-spin" /> 加载配置...
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
            <FileText className="w-3 h-3" /> 表单
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
            <RotateCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} /> 重启 Docker
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-3 h-3" /> {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>

      {/* Form View */}
      {viewMode === "form" && (
        <div className="flex-1 overflow-auto space-y-4 pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>
          {/* Registry Mirrors */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">镜像加速源</label>
              <button onClick={() => addItem(setRegistryMirrors)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> 添加
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">配置 Docker 镜像拉取加速地址 (registry-mirrors)</p>
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
              <div className="text-[0.625rem] text-slate-300">未配置加速源</div>
            )}
          </div>

          {/* Data Root */}
          <div className={sectionClass}>
            <label className={labelClass}>数据存储目录 (data-root)</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">Docker 数据存储路径，默认 /var/lib/docker</p>
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
              <label className="text-[0.75rem] font-semibold text-slate-700">DNS 服务器</label>
              <button onClick={() => addItem(setDns)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> 添加
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">容器使用的 DNS 服务器地址</p>
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
              <div className="text-[0.625rem] text-slate-300">未配置 DNS</div>
            )}
          </div>

          {/* Insecure Registries */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.75rem] font-semibold text-slate-700">非安全仓库</label>
              <button onClick={() => addItem(setInsecureRegistries)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> 添加
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">允许使用 HTTP 协议的镜像仓库 (insecure-registries)</p>
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
              <div className="text-[0.625rem] text-slate-300">未配置非安全仓库</div>
            )}
          </div>

          {/* IPv6 */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[0.75rem] font-semibold text-slate-700">IPv6</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">启用 Docker 容器的 IPv6 网络支持</p>
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
                <label className={labelClass}>IPv6 子网 (fixed-cidr-v6)</label>
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
            <label className="text-[0.75rem] font-semibold text-slate-700 mb-2 block">日志配置</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>日志驱动 (log-driver)</label>
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
                    <label className={labelClass}>单文件大小上限 (max-size)</label>
                    <input
                      type="text"
                      value={logMaxSize}
                      onChange={(e) => setLogMaxSize(e.target.value)}
                      placeholder="10m"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>最大文件数 (max-file)</label>
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
            <label className={labelClass}>存储驱动 (storage-driver)</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">Docker 使用的存储驱动，留空使用默认值</p>
            <select
              value={storageDriver}
              onChange={(e) => setStorageDriver(e.target.value)}
              className={inputClass}
            >
              <option value="">默认</option>
              {STORAGE_DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Cgroup Driver */}
          <div className={sectionClass}>
            <label className={labelClass}>Cgroup 驱动 (exec-opts: native.cgroupdriver)</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">容器的 cgroup 驱动，Kubernetes 环境通常需要设为 systemd</p>
            <select
              value={cgroupDriver}
              onChange={(e) => setCgroupDriver(e.target.value)}
              className={inputClass}
            >
              <option value="">默认</option>
              {CGROUP_DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Live Restore */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[0.75rem] font-semibold text-slate-700">Live Restore</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">允许在 Docker 守护进程发生意外停机或崩溃时保留正在运行的容器状态</p>
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
                <label className="text-[0.75rem] font-semibold text-slate-700">iptables</label>
                <p className="text-[0.625rem] text-slate-400 mt-0.5">Docker 对 iptables 规则的自动配置</p>
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
              <label className="text-[0.75rem] font-semibold text-slate-700">Socket 路径</label>
              <button onClick={() => addItem(setDockerHosts)} className="text-[0.625rem] text-blue-500 hover:text-blue-600">
                <Plus className="w-3 h-3 inline" /> 添加
              </button>
            </div>
            <p className="text-[0.625rem] text-slate-400 mb-2">Docker 守护进程监听的地址，配置后需同步修改 systemd 的 -H fd:// 参数</p>
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
              <div className="text-[0.625rem] text-slate-300">未设置</div>
            )}
          </div>

          {/* Compose Base Dir - moved from system settings */}
          <div className={sectionClass}>
            <label className={labelClass}>Compose 项目目录</label>
            <p className="text-[0.625rem] text-slate-400 mb-2">由数据目录 (WEBOS_DATA_DIR) 自动派生，不可单独修改</p>
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
            直接编辑 daemon.json，切换回表单视图时会自动同步
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
