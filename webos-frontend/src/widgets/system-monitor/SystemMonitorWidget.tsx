import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, HardDrive, Cpu, ArrowUp, ArrowDown } from 'lucide-react'
import type { WidgetProps } from '@/stores/widgetStore'
import { useSystemWebSocket } from '@/hooks/useSystemWebSocket'
import type { SystemOverview } from '@/apps/task-manager/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return Math.round(bytesPerSec / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

export function SystemMonitorWidget({ widget }: WidgetProps) {
  const { t } = useTranslation()
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [prevNetwork, setPrevNetwork] = useState<SystemOverview["network"] | null>(null)
  const [networkSpeed, setNetworkSpeed] = useState<{ rxSpeed: number; txSpeed: number }>({ rxSpeed: 0, txSpeed: 0 })
  const prevNetworkTimeRef = useRef<number>(0)

  const handleOverview = (data: SystemOverview) => {
    setPrevNetwork((prev) => {
      if (prev && data.network && prevNetworkTimeRef.current > 0) {
        const elapsed = (Date.now() - prevNetworkTimeRef.current) / 1000
        if (elapsed > 0) {
          let totalRx = 0
          let totalTx = 0
          data.network.forEach((net) => {
            const p = prev.find((x) => x.interface === net.interface)
            if (p) {
              totalRx += Math.max(0, (net.rxBytes - p.rxBytes) / elapsed)
              totalTx += Math.max(0, (net.txBytes - p.txBytes) / elapsed)
            }
          })
          setNetworkSpeed({ rxSpeed: totalRx, txSpeed: totalTx })
        }
      }
      if (data.network) {
        prevNetworkTimeRef.current = Date.now()
        return data.network
      }
      return prev
    })
    setOverview(data)
  }

  useSystemWebSocket({
    channel: 'sub.overview',
    interval: 2000,
    enabled: true,
    onOverview: handleOverview,
  })

  const cpuUsage = parseFloat(overview?.cpuUsage || '0')
  const memUsage = parseFloat(overview?.memory?.usagePercent || '0')
  const rootDisk = overview?.disks?.find(d => d.mountPoint === '/')
  const diskUsage = rootDisk ? parseFloat(rootDisk.usePercent || '0') : 0

  return (
    <div className="w-full h-full p-3 flex flex-col gap-2 text-xs">
      {/* CPU */}
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-blue-400" />
        <div className="flex-1">
          <div className="flex justify-between mb-0.5 text-black/80">
            <span>{t('widgets.systemMonitor.metrics.cpu')}</span>
            <span className="font-mono">{cpuUsage.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-300"
              style={{ width: `${cpuUsage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 内存 */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-green-400" />
        <div className="flex-1">
          <div className="flex justify-between mb-0.5 text-black/80">
            <span>{t('widgets.systemMonitor.metrics.memory')}</span>
            <span className="font-mono">{memUsage.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-300"
              style={{ width: `${memUsage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 磁盘 */}
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-purple-400" />
        <div className="flex-1">
          <div className="flex justify-between mb-0.5 text-black/80">
            <span>{t('widgets.systemMonitor.metrics.disk')}</span>
            <span className="font-mono">{diskUsage.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-500 transition-all duration-300"
              style={{ width: `${diskUsage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 网速 */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
        <div className="flex items-center gap-1 flex-1">
          <ArrowDown className="w-3 h-3 text-cyan-400" />
          <span className="font-mono text-cyan-400">{formatSpeed(networkSpeed.rxSpeed)}</span>
        </div>
        <div className="flex items-center gap-1 flex-1 justify-end">
          <ArrowUp className="w-3 h-3 text-orange-400" />
          <span className="font-mono text-orange-400">{formatSpeed(networkSpeed.txSpeed)}</span>
        </div>
      </div>
    </div>
  )
}
