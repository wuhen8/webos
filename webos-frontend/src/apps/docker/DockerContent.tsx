import { useState, useEffect, useRef } from "react"
import { useTranslation } from 'react-i18next'
import { useToast } from "@/hooks/use-toast"
import { useDataStore } from "@/stores/dataStore"
import { useWindowStore } from "@/stores/windowStore"
import { useUIStore } from "@/stores/uiStore"
import { exec, dockerService } from "@/lib/services"
import { subscribeChannel } from "@/lib/dataSync"
import ComposeCreator from "./ComposeCreator"
import DockerSettings from "./DockerSettings"
import {
  Box, Image, Layers, RefreshCw, AlertCircle, Wifi, WifiOff, Settings, Network, HardDrive,
} from "lucide-react"
import {
  ContainersPanel, ImagesPanel, ComposePanel, NetworksPanel, VolumesPanel, LogsModal,
  type TabType, type DockerContainer, type DockerImage, type ComposeProject, type DockerNetwork, type DockerVolume,
} from "./components"

function DockerContent() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>("compose")

  // 从全局 store 读取数据
  const available = useDataStore((s) => s.dockerAvailable)
  const containers = useDataStore((s) => s.dockerContainers)
  const images = useDataStore((s) => s.dockerImages)
  const composeProjects = useDataStore((s) => s.dockerComposeProjects)
  const networks = useDataStore((s) => s.dockerNetworks)
  const volumes = useDataStore((s) => s.dockerVolumes)
  const [searchQuery, setSearchQuery] = useState("")
  const [logsModal, setLogsModal] = useState<{ title: string; logs: string } | null>(null)
  const [inspectModal, setInspectModal] = useState<{ title: string; data: string } | null>(null)
  const [showComposeCreator, setShowComposeCreator] = useState(false)
  const [importedYaml, setImportedYaml] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [editingCompose, setEditingCompose] = useState<{ projectDir: string; yaml: string } | null>(null)

  // Docker 设置相关状态（仅用于 UI 控制，不影响数据订阅）
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(5000)

  const openWindow = useWindowStore((s) => s.openWindow)
  const connected = useDataStore((s) => s.dockerAvailable)

  const logsUnsubRef = useRef<(() => void) | null>(null)

  // 按需订阅 Docker 数据
  // 容器数据始终订阅（所有标签页都需要显示容器数量）
  useEffect(() => {
    if (!autoRefresh || activeTab === "settings") return

    const store = useDataStore.getState()
    const unsubs: Array<() => void> = []

    // 容器数据（所有标签页都需要）
    unsubs.push(
      subscribeChannel('sub.docker_containers', refreshInterval, (data: any) => {
        store.setDockerContainers(data)
      })
    )

    // 根据当前标签页订阅对应数据
    if (activeTab === "images") {
      unsubs.push(
        subscribeChannel('sub.docker_images', refreshInterval, (data: any) => {
          store.setDockerImages(data)
        })
      )
    } else if (activeTab === "compose") {
      unsubs.push(
        subscribeChannel('sub.docker_compose', refreshInterval, (data: any) => {
          store.setDockerComposeProjects(data)
        })
      )
    } else if (activeTab === "networks") {
      unsubs.push(
        subscribeChannel('sub.docker_networks', refreshInterval, (data: any) => {
          store.setDockerNetworks(data)
        })
      )
    } else if (activeTab === "volumes") {
      unsubs.push(
        subscribeChannel('sub.docker_volumes', refreshInterval, (data: any) => {
          store.setDockerVolumes(data)
        })
      )
    }

    return () => {
      unsubs.forEach(fn => fn())
    }
  }, [activeTab, autoRefresh, refreshInterval])

  const dockerRefreshChannels = ['sub.docker_containers', 'sub.docker_images', 'sub.docker_compose', 'sub.docker_networks', 'sub.docker_volumes']

  const containerAction = (id: string, action: string) => {
    const actionMap: Record<string, string> = {
      start: t('apps.docker.content.actions.start'),
      stop: t('apps.docker.content.actions.stop'),
      restart: t('apps.docker.content.actions.restart'),
    }
    const label = actionMap[action] || action
    exec(`docker ${action} ${id}`, { background: true, title: t('apps.docker.content.exec.containerActionTitle', { action: label }), refreshChannels: dockerRefreshChannels })
    toast({ title: t('apps.docker.content.feedback.submitted'), description: t('apps.docker.content.feedback.containerActionSubmitted', { action: label }) })
  }

  const removeContainer = (id: string, force = false) => {
    exec(`docker rm ${force ? "-f " : ""}${id}`, { background: true, title: t('apps.docker.content.exec.removeContainerTitle'), refreshChannels: dockerRefreshChannels })
    toast({ title: t('apps.docker.content.feedback.submitted'), description: t('apps.docker.content.feedback.containerRemoveSubmitted') })
  }

  const removeImage = (id: string, force = false) => {
    exec(`docker rmi ${force ? "-f " : ""}${id}`, { background: true, title: t('apps.docker.content.exec.removeImageTitle'), refreshChannels: dockerRefreshChannels })
    toast({ title: t('apps.docker.content.feedback.submitted'), description: t('apps.docker.content.feedback.imageRemoveSubmitted') })
  }

  const pullImage = (imageName: string) => {
    const name = imageName.trim()
    if (name) { dockerService.pull(name); toast({ title: t('apps.docker.content.feedback.submitted'), description: t('apps.docker.content.feedback.imagePullSubmitted', { name }) }) }
  }

  const viewLogs = (id: string, name: string) => {
    logsUnsubRef.current?.()
    setLogsModal({ title: name, logs: t('apps.docker.content.logs.loading') })
    logsUnsubRef.current = dockerService.logsSubscribe(id, "200", (chunk, isFirst) => {
      setLogsModal((prev) => prev ? { ...prev, logs: isFirst ? (chunk || t('apps.docker.content.logs.empty')) : prev.logs + chunk } : null)
    })
  }

  const doComposeAction = (configFile: string, action: string) => {
    const actionMap: Record<string, string> = {
      up: t('apps.docker.content.actions.start'),
      down: t('apps.docker.content.actions.stop'),
      restart: t('apps.docker.content.actions.restart'),
      pull: t('apps.docker.content.actions.pull'),
      stop: t('apps.docker.content.actions.pause'),
    }
    const label = actionMap[action] || action
    const cmd = action === "up" ? `docker compose -f ${configFile} up -d` : `docker compose -f ${configFile} ${action}`
    exec(cmd, { background: true, title: t('apps.docker.content.exec.composeActionTitle', { action: label }), refreshChannels: dockerRefreshChannels })
    toast({ title: t('apps.docker.content.feedback.submitted'), description: t('apps.docker.content.feedback.composeActionSubmitted', { action: label }) })
  }

  const createComposeProject = async (projectDir: string, yamlContent: string, autoUp: boolean) => {
    try {
      await dockerService.composeCreate(projectDir, yamlContent, autoUp)
      if (!autoUp) toast({ title: t('apps.docker.content.feedback.success'), description: t('apps.docker.content.feedback.composeCreateSuccess') })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.createFailed'), variant: "destructive" }) }
  }

  const closeLogsModal = () => { logsUnsubRef.current?.(); logsUnsubRef.current = null; setLogsModal(null) }

  const createNetwork = async (name: string, driver: string) => {
    try {
      await dockerService.networkCreate(name, driver)
      toast({ title: t('apps.docker.content.feedback.success'), description: t('apps.docker.content.feedback.networkCreateSuccess', { name }) })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.createFailed'), variant: "destructive" }) }
  }

  const removeNetwork = async (id: string) => {
    try {
      await dockerService.networkRemove(id)
      toast({ title: t('apps.docker.content.feedback.success'), description: t('apps.docker.content.feedback.networkRemoveSuccess') })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.deleteFailed'), variant: "destructive" }) }
  }

  const inspectNetwork = async (id: string, name: string) => {
    try {
      const data = await dockerService.networkInspect(id)
      setInspectModal({ title: t('apps.docker.content.inspect.networkTitle', { name }), data: JSON.stringify(data, null, 2) })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.inspectFailed'), variant: "destructive" }) }
  }

  const createVolume = async (name: string, driver: string) => {
    try {
      await dockerService.volumeCreate(name, driver)
      toast({ title: t('apps.docker.content.feedback.success'), description: t('apps.docker.content.feedback.volumeCreateSuccess', { name }) })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.createFailed'), variant: "destructive" }) }
  }

  const removeVolume = async (name: string) => {
    try {
      await dockerService.volumeRemove(name, true)
      toast({ title: t('apps.docker.content.feedback.success'), description: t('apps.docker.content.feedback.volumeRemoveSuccess') })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.deleteFailed'), variant: "destructive" }) }
  }

  const inspectVolume = async (name: string) => {
    try {
      const data = await dockerService.volumeInspect(name)
      setInspectModal({ title: t('apps.docker.content.inspect.volumeTitle', { name }), data: JSON.stringify(data, null, 2) })
    } catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.inspectFailed'), variant: "destructive" }) }
  }

  const editComposeProject = async (projectDir: string) => {
    try { const data = await dockerService.composeRead(projectDir); setEditingCompose({ projectDir, yaml: data.content }) }
    catch (err: any) { toast({ title: t('apps.docker.content.feedback.failed'), description: err?.message || t('apps.docker.content.feedback.readFailed'), variant: "destructive" }) }
  }

  const openContainerTerminal = (containerId: string, _name: string) => {
    openWindow('terminal', { forceNew: true, initialCommand: `docker exec -it ${containerId} sh` })
  }

  const handleImportCompose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImportedYaml(reader.result as string); setShowComposeCreator(true) }
    reader.onerror = () => { toast({ title: t('apps.docker.content.feedback.failed'), description: t('apps.docker.content.feedback.fileReadFailed'), variant: "destructive" }) }
    reader.readAsText(file)
    e.target.value = ""
  }

  const confirmDelete = (title: string, onConfirm: () => void) => {
    useUIStore.getState().showConfirm({
      title,
      description: t('apps.docker.content.confirm.deleteDescription'),
      variant: 'destructive',
      onConfirm,
    })
  }

  if (available === false) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-50/80 to-white/60 text-slate-500 gap-3">
        <AlertCircle className="w-12 h-12 text-slate-300" />
        <div className="text-[0.875rem] font-medium">{t('apps.docker.content.unavailable.title')}</div>
        <div className="text-[0.75rem] text-slate-400">{t('apps.docker.content.unavailable.description')}</div>
      </div>
    )
  }

  const tabClass = (tab: TabType) =>
    `px-4 py-1.5 text-[0.75rem] font-medium rounded-md transition-all duration-150 shrink-0 whitespace-nowrap ${
      activeTab === tab ? "bg-white/70 text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/30"
    }`

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50/80 to-white/60 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
        <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg p-0.5 overflow-x-auto">
          <button className={tabClass("compose")} onClick={() => setActiveTab("compose")}>
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Compose <span className="text-[0.625rem] opacity-60">({composeProjects.length})</span></span>
          </button>
          <button className={tabClass("containers")} onClick={() => setActiveTab("containers")}>
            <span className="flex items-center gap-1.5"><Box className="w-3.5 h-3.5" /> {t('apps.docker.content.tabs.containers')} <span className="text-[0.625rem] opacity-60">({containers.length})</span></span>
          </button>
          <button className={tabClass("images")} onClick={() => setActiveTab("images")}>
            <span className="flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> {t('apps.docker.content.tabs.images')} <span className="text-[0.625rem] opacity-60">({images.length})</span></span>
          </button>
          <button className={tabClass("networks")} onClick={() => setActiveTab("networks")}>
            <span className="flex items-center gap-1.5"><Network className="w-3.5 h-3.5" /> {t('apps.docker.content.tabs.networks')} <span className="text-[0.625rem] opacity-60">({networks.length})</span></span>
          </button>
          <button className={tabClass("volumes")} onClick={() => setActiveTab("volumes")}>
            <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> {t('apps.docker.content.tabs.volumes')} <span className="text-[0.625rem] opacity-60">({volumes.length})</span></span>
          </button>
          <button className={tabClass("settings")} onClick={() => setActiveTab("settings")}>
            <span className="flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> {t('apps.docker.content.tabs.settings')}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="text-[0.6875rem] bg-white/60 border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 outline-none">
            <option value={3000}>3s</option><option value={5000}>5s</option><option value={10000}>10s</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded-md transition-colors ${autoRefresh ? connected ? "text-green-600 bg-green-50" : "text-amber-500 bg-amber-50" : "text-slate-400 hover:text-slate-600"}`}
            title={autoRefresh ? (connected ? t('apps.docker.content.connection.connected') : t('apps.docker.content.connection.connecting')) : t('apps.docker.content.connection.paused')}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : autoRefresh ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-4 pb-3">
        {activeTab === "containers" && (
          <ContainersPanel containers={containers} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onAction={containerAction}
            onRemove={(id) => confirmDelete(t('apps.docker.content.confirm.deleteContainerTitle', { id: id.slice(0, 12) }), () => removeContainer(id, true))}
            onViewLogs={viewLogs} onTerminal={openContainerTerminal} />
        )}
        {activeTab === "images" && (
          <ImagesPanel images={images} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onRemove={(id) => confirmDelete(t('apps.docker.content.confirm.deleteImageTitle', { id: id.slice(0, 12) }), () => removeImage(id, true))}
            onPull={pullImage} />
        )}
        {activeTab === "compose" && (
          <ComposePanel projects={composeProjects} containers={containers} onAction={doComposeAction}
            onViewLogs={viewLogs} onTerminal={openContainerTerminal} onCreateProject={() => setShowComposeCreator(true)}
            onImport={() => importFileRef.current?.click()} onEdit={editComposeProject} />
        )}
        {activeTab === "networks" && (
          <NetworksPanel networks={networks} containers={containers} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onRemove={(id) => confirmDelete(t('apps.docker.content.confirm.deleteNetworkTitle', { id: id.slice(0, 12) }), () => removeNetwork(id))}
            onCreate={createNetwork} onInspect={inspectNetwork} />
        )}
        {activeTab === "volumes" && (
          <VolumesPanel volumes={volumes} containers={containers} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onRemove={(name) => confirmDelete(t('apps.docker.content.confirm.deleteVolumeTitle', { name }), () => removeVolume(name))}
            onCreate={createVolume} onInspect={inspectVolume} />
        )}
        {activeTab === "settings" && <DockerSettings />}
      </div>

      {(showComposeCreator || editingCompose) && (
        <ComposeCreator onClose={() => { setShowComposeCreator(false); setEditingCompose(null); setImportedYaml(null) }}
          onSubmit={createComposeProject} editMode={!!editingCompose}
          initialProjectDir={editingCompose?.projectDir} initialYaml={editingCompose?.yaml || importedYaml || undefined} />
      )}

      <input ref={importFileRef} type="file" accept=".yml,.yaml" className="hidden" onChange={handleImportCompose} />

      {logsModal && <LogsModal title={logsModal.title} logs={logsModal.logs} onClose={closeLogsModal} />}

      {inspectModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setInspectModal(null)}>
          <div className="w-[90%] h-[80%] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <span className="text-[0.8125rem] font-medium text-slate-700">{inspectModal.title}</span>
              <button onClick={() => setInspectModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[0.6875rem] font-mono text-green-400 bg-slate-900 leading-relaxed whitespace-pre-wrap"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
              {inspectModal.data}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default DockerContent
