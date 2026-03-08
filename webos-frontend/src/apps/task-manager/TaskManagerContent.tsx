import { useState, useRef, useCallback, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useSystemWebSocket } from "@/hooks/useSystemWebSocket"
import { exec } from "@/lib/services"
import { request as wsRequest } from "@/stores/webSocketStore"
import { useUIStore } from "@/stores/uiStore"
import { getContextMenu } from "@/config/appRegistry"
import { appStoreService } from "@/lib/services/appStoreService"
import type { ContextMenuContext } from "@/types"
import {
  ArrowUpDown,
  Activity,
  Server,
  ChevronUp,
  ChevronDown,
  Wifi,
  RefreshCw,
  WifiOff,
  Zap,
  Cog,
  Box,
} from "lucide-react"

import type { SystemOverview, ProcessInfo, ServiceInfo, UnifiedTask, WasmProcInfo, SortField, SortDir, TabType } from "./types"
import { OverviewPanel } from "./OverviewPanel"
import { ProcessPanel } from "./ProcessPanel"
import { TaskPanel } from "./TaskPanel"
import { ServicePanel } from "./ServicePanel"
import { WasmPanel } from "./WasmPanel"

function TaskManagerContent() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>("overview")
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [processTotal, setProcessTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("cpu")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [wasmSortField, setWasmSortField] = useState<SortField>("appId")
  const [wasmSortDir, setWasmSortDir] = useState<SortDir>("asc")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(3000)
  const [prevNetwork, setPrevNetwork] = useState<SystemOverview["network"] | null>(null)
  const [networkSpeed, setNetworkSpeed] = useState<{ iface: string; rxSpeed: number; txSpeed: number }[]>([])
  const prevNetworkTimeRef = useRef<number>(0)
  const [tasks, setTasks] = useState<UnifiedTask[]>([])
  const [taskTotal, setTaskTotal] = useState(0)
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [serviceTotal, setServiceTotal] = useState(0)
  const [wasmProcs, setWasmProcs] = useState<WasmProcInfo[]>([])

  const fetchWasmProcs = useCallback(async () => {
    try {
      const list = await wsRequest('wasm.list', {})
      setWasmProcs(list || [])
    } catch {
      // 静默
    }
  }, [])

  const handleOverview = useCallback((data: SystemOverview) => {
    setPrevNetwork((prev) => {
      if (prev && data.network && prevNetworkTimeRef.current > 0) {
        const elapsed = (Date.now() - prevNetworkTimeRef.current) / 1000
        if (elapsed > 0) {
          const speeds = data.network.map((net) => {
            const p = prev.find((x) => x.interface === net.interface)
            if (p) {
              return {
                iface: net.interface,
                rxSpeed: Math.max(0, (net.rxBytes - p.rxBytes) / elapsed),
                txSpeed: Math.max(0, (net.txBytes - p.txBytes) / elapsed),
              }
            }
            return { iface: net.interface, rxSpeed: 0, txSpeed: 0 }
          })
          setNetworkSpeed(speeds)
        }
      }
      if (data.network) {
        prevNetworkTimeRef.current = Date.now()
        return data.network
      }
      return prev
    })
    setOverview(data)
  }, [])

  const handleProcesses = useCallback((data: { processes: ProcessInfo[]; total: number }) => {
    setProcesses(data.processes || [])
    setProcessTotal(data.total || 0)
  }, [])

  const handleTasks = useCallback((data: { tasks: UnifiedTask[]; total: number }) => {
    setTasks(data.tasks || [])
    setTaskTotal(data.total || 0)
  }, [])

  const handleServices = useCallback((data: { services: ServiceInfo[]; total: number }) => {
    setServices(data.services || [])
    setServiceTotal(data.total || 0)
  }, [])

  const wsChannel = activeTab === "tasks" ? "sub.tasks" : activeTab === "services" ? "sub.services" : activeTab === "wasm" ? "sub.overview" : ("sub." + activeTab) as any

  const { connected } = useSystemWebSocket({
    channel: wsChannel,
    interval: refreshInterval,
    enabled: autoRefresh && activeTab !== "wasm",
    onOverview: handleOverview,
    onProcesses: handleProcesses,
    onTasks: handleTasks,
    onServices: handleServices,
  })

  // Wasm tab: 用 request/response 轮询
  useEffect(() => {
    if (activeTab !== "wasm" || !autoRefresh) return
    fetchWasmProcs()
    const timer = setInterval(fetchWasmProcs, refreshInterval)
    return () => clearInterval(timer)
  }, [activeTab, autoRefresh, refreshInterval, fetchWasmProcs])

  const sendSignal = (pid: number, signal: string) => {
    exec(`kill -${signal} ${pid}`, { background: true, title: `发送 ${signal} 信号到进程 ${pid}`, refreshChannels: ['sub.processes'] })
    toast({ title: "已提交", description: `正在向进程 ${pid} 发送 ${signal} 信号` })
  }

  const handleProcessContextMenu = (e: React.MouseEvent, pid: number) => {
    e.preventDefault()
    e.stopPropagation()
    const ctx: ContextMenuContext = { pid }
    useUIStore.getState().openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: getContextMenu('taskManager', 'process'),
      context: ctx,
      onAction: (action: string) => {
        useUIStore.getState().closeGlobalMenu()
        const signalMap: Record<string, string> = {
          'process.sigterm': 'TERM',
          'process.sigkill': 'KILL',
          'process.sighup': 'HUP',
          'process.sigusr1': 'USR1',
          'process.sigusr2': 'USR2',
        }
        const signal = signalMap[action]
        if (signal) sendSignal(pid, signal)
      },
    })
  }

  const handleServiceAction = (serviceName: string, action: string) => {
    const actionMap: Record<string, string> = {
      'service.start': 'start',
      'service.stop': 'stop',
      'service.restart': 'restart',
      'service.reload': 'reload',
      'service.enable': 'enable',
      'service.disable': 'disable',
    }
    const cmd = actionMap[action]
    if (!cmd) return
    const labelMap: Record<string, string> = {
      start: '启动', stop: '停止', restart: '重启',
      reload: '重载', enable: '启用开机自启', disable: '禁用开机自启',
    }
    const label = labelMap[cmd]
    exec(`systemctl ${cmd} ${serviceName}`, { background: true, title: `${label}服务 ${serviceName}`, refreshChannels: ['sub.services'] })
    toast({ title: "已提交", description: `${label}服务 ${serviceName} 操作已提交到后台` })
  }

  const handleServiceContextMenu = (e: React.MouseEvent, serviceName: string) => {
    e.preventDefault()
    e.stopPropagation()
    const ctx: ContextMenuContext = { serviceName }
    useUIStore.getState().openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: getContextMenu('taskManager', 'service'),
      context: ctx,
      onAction: (action: string) => {
        useUIStore.getState().closeGlobalMenu()
        handleServiceAction(serviceName, action)
      },
    })
  }

  const handleWasmAction = async (appId: string, action: string) => {
    const labelMap: Record<string, string> = {
      start: '启动', stop: '停止', restart: '重启',
      enableAutostart: '启用开机自启', disableAutostart: '禁用开机自启',
    }
    const label = labelMap[action] || action
    try {
      if (action === 'start') {
        await wsRequest('wasm.start', { appId })
      } else if (action === 'stop') {
        await wsRequest('wasm.stop', { appId })
      } else if (action === 'restart') {
        await wsRequest('wasm.restart', { appId })
      } else if (action === 'enableAutostart') {
        await appStoreService.setAutostart(appId, true)
      } else if (action === 'disableAutostart') {
        await appStoreService.setAutostart(appId, false)
      }
      toast({ title: "成功", description: `${label} ${appId}` })
      setTimeout(fetchWasmProcs, 300)
    } catch (e: any) {
      toast({ title: "失败", description: e?.message || `${label}失败`, variant: "destructive" })
    }
  }

  const handleWasmContextMenu = (e: React.MouseEvent, appId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const ctx: ContextMenuContext = { appId }
    useUIStore.getState().openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: getContextMenu('taskManager', 'wasm'),
      context: ctx,
      onAction: (action: string) => {
        useUIStore.getState().closeGlobalMenu()
        const actionMap: Record<string, string> = {
          'wasm.start': 'start',
          'wasm.stop': 'stop',
          'wasm.restart': 'restart',
          'wasm.enableAutostart': 'enableAutostart',
          'wasm.disableAutostart': 'disableAutostart',
        }
        const cmd = actionMap[action]
        if (cmd) handleWasmAction(appId, cmd)
      },
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const handleWasmSort = (field: SortField) => {
    if (wasmSortField === field) {
      setWasmSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setWasmSortField(field)
      setWasmSortDir("desc")
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  const WasmSortIcon = ({ field }: { field: SortField }) => {
    if (wasmSortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return wasmSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  const filteredProcesses = processes
    .filter((p) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return p.command.toLowerCase().includes(q) || p.user.toLowerCase().includes(q) || String(p.pid).includes(q)
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      switch (sortField) {
        case "pid": return (a.pid - b.pid) * dir
        case "cpu": return (a.cpu - b.cpu) * dir
        case "mem": return (a.mem - b.mem) * dir
        case "rss": return (a.rss - b.rss) * dir
        case "user": return a.user.localeCompare(b.user) * dir
        case "command": return a.command.localeCompare(b.command) * dir
        default: return 0
      }
    })

  const sortedWasmProcs = [...wasmProcs].sort((a, b) => {
    const dir = wasmSortDir === "asc" ? 1 : -1
    switch (wasmSortField) {
      case "appId": return a.appId.localeCompare(b.appId) * dir
      case "name": return (a.name || a.appId).localeCompare(b.name || b.appId) * dir
      case "state": return a.state.localeCompare(b.state) * dir
      case "memory": return ((a.memory || 0) - (b.memory || 0)) * dir
      case "eventCount": return ((a.eventCount || 0) - (b.eventCount || 0)) * dir
      default: return 0
    }
  })

  const cpuUsage = parseFloat(overview?.cpuUsage || "0")
  const memUsage = parseFloat(overview?.memory?.usagePercent || "0")

  const tabClass = (tab: TabType) =>
    `px-4 py-1.5 text-[0.75rem] font-medium rounded-md transition-all duration-150 shrink-0 whitespace-nowrap ${
      activeTab === tab
        ? "bg-white/70 text-slate-800 shadow-sm"
        : "text-slate-500 hover:text-slate-700 hover:bg-white/30"
    }`

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50/80 to-white/60 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
        <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg p-0.5 overflow-x-auto">
          <button className={tabClass("overview")} onClick={() => setActiveTab("overview")}>
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              系统概览
            </span>
          </button>
          <button className={tabClass("processes")} onClick={() => setActiveTab("processes")}>
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              进程 {processTotal > 0 && <span className="text-[0.625rem] opacity-60">({processTotal})</span>}
            </span>
          </button>
          <button className={tabClass("services")} onClick={() => setActiveTab("services")}>
            <span className="flex items-center gap-1.5">
              <Cog className="w-3.5 h-3.5" />
              服务 {serviceTotal > 0 && <span className="text-[0.625rem] opacity-60">({serviceTotal})</span>}
            </span>
          </button>
          <button className={tabClass("tasks")} onClick={() => setActiveTab("tasks")}>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              任务 {taskTotal > 0 && <span className="text-[0.625rem] opacity-60">({taskTotal})</span>}
            </span>
          </button>
          <button className={tabClass("wasm")} onClick={() => setActiveTab("wasm")}>
            <span className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5" />
              Wasm {wasmProcs.length > 0 && <span className="text-[0.625rem] opacity-60">({wasmProcs.length})</span>}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="text-[0.6875rem] bg-white/60 border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 outline-none"
          >
            <option value={1000}>1s</option>
            <option value={3000}>3s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded-md transition-colors ${
              autoRefresh
                ? connected ? "text-green-600 bg-green-50" : "text-amber-500 bg-amber-50"
                : "text-slate-400 hover:text-slate-600"
            }`}
            title={autoRefresh ? (connected ? "已连接，推送中" : "连接中...") : "已暂停"}
          >
            {connected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : autoRefresh ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-4 pb-3">
        {activeTab === "overview" ? (
          <OverviewPanel overview={overview} cpuUsage={cpuUsage} memUsage={memUsage} networkSpeed={networkSpeed} />
        ) : activeTab === "tasks" ? (
          <TaskPanel tasks={tasks} />
        ) : activeTab === "services" ? (
          <ServicePanel services={services} onContextMenu={handleServiceContextMenu} />
        ) : activeTab === "wasm" ? (
          <WasmPanel
            procs={sortedWasmProcs}
            onRefresh={fetchWasmProcs}
            sortField={wasmSortField}
            handleSort={handleWasmSort}
            SortIcon={WasmSortIcon}
            onContextMenu={handleWasmContextMenu}
          />
        ) : (
          <ProcessPanel
            processes={filteredProcesses}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortField={sortField}
            sortDir={sortDir}
            handleSort={handleSort}
            SortIcon={SortIcon}
            onContextMenu={handleProcessContextMenu}
          />
        )}
      </div>
    </div>
  )
}

export default TaskManagerContent
