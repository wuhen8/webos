export interface ProcessInfo {
  pid: number
  user: string
  cpu: number
  mem: number
  vsz: number
  rss: number
  tty: string
  stat: string
  start: string
  time: string
  command: string
}

export interface SystemOverview {
  hostname: string
  os: string
  arch: string
  numCPU: number
  uptime: string
  uptimeSeconds: number
  loadAvg: string[]
  cpuUsage: string
  memory: {
    total: number
    used: number
    available: number
    usagePercent: string
    swapTotal: number
    swapUsed: number
  }
  disks: {
    device: string
    fsType: string
    size: number
    used: number
    available: number
    usePercent: string
    mountPoint: string
  }[]
  network: {
    interface: string
    rxBytes: number
    txBytes: number
    rxPackets: number
    txPackets: number
  }[]
}

export interface ServiceInfo {
  name: string
  loadState: string
  activeState: string
  subState: string
  description: string
  enabled: string
}

export interface WasmProcInfo {
  appId: string
  name: string
  state: "running" | "stopped" | "failed" | "starting"
  error?: string
  memory?: number      // WASM memory size in bytes
  eventCount?: number  // Number of processed events
  lastUpdated?: number // Last update timestamp
  autostart?: boolean  // Whether autostart is enabled
}

export interface UnifiedTask {
  id: string
  type: string
  title: string
  category?: string
  status: string
  message?: string
  createdAt: number
  doneAt?: number
  progress?: number
  itemCurrent?: number
  itemTotal?: number
  bytesCurrent?: number
  bytesTotal?: number
  cancellable?: boolean
  silent?: boolean
  outputMode?: 'progress' | 'log'
  logs?: string[]
}

export type SortField = "pid" | "cpu" | "mem" | "rss" | "user" | "command" | "serviceName" | "activeState" | "subState" | "enabled" | "appId" | "name" | "state" | "memory" | "eventCount"
export type SortDir = "asc" | "desc"
export type TabType = "overview" | "processes" | "tasks" | "services" | "wasm"

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i]
}
