import { getHostname } from '@/lib/env'

export type TabType = "containers" | "images" | "compose" | "networks" | "volumes" | "settings"

export interface DockerContainer {
  id: string
  shortId: string
  name: string
  image: string
  command: string
  state: string
  status: string
  createdAt: number
  ports: string
  networks: string
  composeProject?: string
  cpuPercent: number
  memUsage: number
  memLimit: number
  memPercent: number
  netRx: number
  netTx: number
  blockRead: number
  blockWrite: number
  pids: number
  mounts: { type: string; name: string; source: string; destination: string; driver: string; rw: boolean }[]
}

export interface DockerImage {
  id: string
  shortId: string
  repository: string
  tag: string
  size: number
  createdAt: number
}

export interface ComposeProject {
  name: string
  status: string
  configFile: string
  projectDir: string
  source: string // "docker" | "appstore" | "local"
}

export interface DockerNetwork {
  id: string
  shortId: string
  name: string
  driver: string
  scope: string
  subnet: string
  gateway: string
  containers: number
  internal: boolean
  createdAt: string
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  scope: string
  createdAt: string
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0B"
  const units = ["B", "kB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const idx = Math.min(i, units.length - 1)
  return (bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1) + units[idx]
}

export function formatTimeSince(unixSeconds: number): string {
  if (!unixSeconds) return ""
  const diff = Math.floor(Date.now() / 1000 - unixSeconds)
  if (diff < 60) return "刚刚"
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前"
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前"
  if (diff < 2592000) return Math.floor(diff / 86400) + " 天前"
  return Math.floor(diff / 2592000) + " 个月前"
}

/** Parse ports string like "0.0.0.0:8080->80/tcp, :::443->443/tcp" into clickable entries */
export function parsePorts(ports: string): { host: number; container: number; protocol: string; url: string }[] {
  if (!ports) return []
  const results: { host: number; container: number; protocol: string; url: string }[] = []
  const seen = new Set<number>()
  for (const part of ports.split(",")) {
    const m = part.trim().match(/(?:\S+?):(\d+)->(\d+)\/(\w+)/)
    if (m) {
      const host = parseInt(m[1])
      if (seen.has(host)) continue
      seen.add(host)
      results.push({ host, container: parseInt(m[2]), protocol: m[3], url: `http://${getHostname()}:${host}` })
    }
  }
  return results
}
