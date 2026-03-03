import { useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { useSystemWebSocket } from "@/hooks/useSystemWebSocket"
import { exec } from "@/lib/services"
import {
  Settings2,
  RefreshCw,
  Wifi,
  WifiOff,
  Layers,
  BarChart3,
} from "lucide-react"
import { PoolsTab } from "./components/PoolsTab"
import { AdvancedTab } from "./components/AdvancedTab"
import { OverviewTab } from "./components/OverviewTab"
import type {
  DiskInfo,
  LVMVolumeGroup,
  MountPointInfo,
  OSType,
  TabType,
} from "./types"

function DiskManagerContent() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>("overview")
  const [disks, setDisks] = useState<DiskInfo[]>([])
  const [osType, setOsType] = useState<OSType>("darwin")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(5000)
  const [volumeGroups, setVolumeGroups] = useState<LVMVolumeGroup[]>([])
  const [mountPoints, setMountPoints] = useState<MountPointInfo[]>([])

  const handleDisks = useCallback((data: any) => {
    if (data && typeof data === "object" && "disks" in data) {
      setDisks(data.disks || [])
      if (data.os === "linux" || data.os === "darwin") setOsType(data.os)
      if (data.lvm && data.lvm.volumeGroups) {
        setVolumeGroups(data.lvm.volumeGroups)
      } else {
        setVolumeGroups([])
      }
      setMountPoints(data.mountPoints || [])
    } else {
      setDisks(data || [])
      setVolumeGroups([])
      setMountPoints([])
    }
  }, [])

  const { connected } = useSystemWebSocket({
    channel: "disks",
    interval: refreshInterval,
    enabled: autoRefresh,
    onDisks: handleDisks,
  })

  const diskRefreshChannels = ['disks']

  const execCmd = async (cmd: string, successMsg: string) => {
    exec(cmd, { background: true, title: successMsg, refreshChannels: diskRefreshChannels })
    toast({ title: "已提交", description: `${successMsg}操作已提交到后台` })
  }

  const handleFormat = (device: string, fsType: string, label: string) => {
    if (osType === "linux") {
      const mkfsMap: Record<string, string> = { ext4: "mkfs.ext4", xfs: "mkfs.xfs", btrfs: "mkfs.btrfs", zfs: "mkfs.ext4", fat32: "mkfs.vfat -F 32", exfat: "mkfs.exfat", ntfs: "mkfs.ntfs -f" }
      const mkfs = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
      const labelFlag = label ? (fsType === "fat32" ? ` -n "${label}"` : ` -L "${label}"`) : ""
      return execCmd(`${mkfs}${labelFlag} ${device}`, "格式化成功")
    }
    const fsMap: Record<string, string> = { apfs: "APFS", "hfs+": "JHFS+", fat32: "FAT32", vfat: "FAT32", exfat: "ExFAT", ntfs: "NTFS" }
    const fs = fsMap[fsType.toLowerCase()] || "APFS"
    const vol = label || "Untitled"
    execCmd(`diskutil eraseVolume ${fs} "${vol}" ${device}`, "格式化成功")
  }

  const handleCreatePartition = (device: string, size: string, fsType: string) => {
    if (osType === "linux") {
      const end = size === "100%" ? "100%" : size
      return execCmd(`parted -s ${device} mklabel gpt && parted -s ${device} mkpart primary 0% ${end} && partprobe ${device}`, "分区创建成功")
    }
    const fsMap: Record<string, string> = { apfs: "APFS", "hfs+": "JHFS+", fat32: "FAT32", vfat: "FAT32", exfat: "ExFAT" }
    const fs = fsMap[fsType.toLowerCase()] || "APFS"
    execCmd(`diskutil partitionDisk ${device} 1 GPT ${fs} Untitled ${size}`, "分区创建成功")
  }

  const handleDeletePartition = (device: string) => {
    if (osType === "linux") {
      const nvmeMatch = device.match(/^(\/dev\/nvme\d+n\d+)p(\d+)$/)
      const sdMatch = device.match(/^(\/dev\/[a-z]+)(\d+)$/)
      const match = nvmeMatch || sdMatch
      if (match) {
        const parentDisk = match[1]
        const partNum = match[2]
        return execCmd(`wipefs -a ${device} && parted -s ${parentDisk} rm ${partNum} && partprobe ${parentDisk}`, "分区删除成功")
      }
      return execCmd(`wipefs -a ${device}`, "分区删除成功")
    }
    execCmd(`diskutil eraseVolume free free ${device}`, "分区删除成功")
  }

  const handleMountPartition = (device: string, mountPoint: string, fsType: string, persist: boolean, uuid: string) => {
    if (osType === "linux") {
      const cmds = [`mkdir -p ${mountPoint}`, `mount ${device} ${mountPoint}`]
      if (persist) {
        const fstabDev = uuid ? `UUID=${uuid}` : device
        const fstabLine = `${fstabDev} ${mountPoint} ${fsType || "auto"} defaults 0 2`
        cmds.push(`grep -qsE '^\\s*${fstabDev.replace(/\//g, "\\\\/")}\\s|^\\s*${device.replace(/\//g, "\\\\/")}\\s' /etc/fstab || echo '${fstabLine}' >> /etc/fstab`)
      }
      return execCmd(cmds.join(" && "), persist ? "挂载成功，已写入 fstab" : "挂载成功")
    }
    execCmd(`diskutil mount ${device}`, "挂载成功")
  }

  const handleUnmountPartition = (device: string, mountPoint: string, removeFstab: boolean) => {
    if (osType === "linux") {
      const cmds = [`umount ${device}`]
      if (removeFstab && mountPoint) {
        cmds.push(`sed -i '\\|${mountPoint.replace(/\//g, "\\\\/")}|d' /etc/fstab`)
      }
      return execCmd(cmds.join(" && "), removeFstab ? "卸载成功，已从 fstab 移除" : "卸载成功")
    }
    execCmd(`diskutil unmount ${device}`, "卸载成功")
  }

  const tabClass = (tab: TabType) =>
    `px-4 py-1.5 text-[0.75rem] font-medium rounded-md transition-all duration-150 shrink-0 whitespace-nowrap ${
      activeTab === tab
        ? "bg-white/70 text-slate-800 shadow-sm"
        : "text-slate-500 hover:text-slate-700 hover:bg-white/30"
    }`

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50/80 to-white/60 select-none">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
        <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg p-0.5 overflow-x-auto">
          <button className={tabClass("overview")} onClick={() => setActiveTab("overview")}>
            <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />概览</span>
          </button>
          <button className={tabClass("pools")} onClick={() => setActiveTab("pools")}>
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />存储池</span>
          </button>
          <button className={tabClass("advanced")} onClick={() => setActiveTab("advanced")}>
            <span className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" />高级</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="text-[0.6875rem] bg-white/60 border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 outline-none">
            <option value={3000}>3s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded-md transition-colors ${autoRefresh ? connected ? "text-green-600 bg-green-50" : "text-amber-500 bg-amber-50" : "text-slate-400 hover:text-slate-600"}`}
            title={autoRefresh ? (connected ? "已连接，推送中" : "连接中...") : "已暂停"}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : autoRefresh ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-4 pb-3">
        {activeTab === "overview" && <OverviewTab mountPoints={mountPoints} disks={disks} volumeGroups={volumeGroups} />}
        {activeTab === "pools" && <PoolsTab disks={disks} volumeGroups={volumeGroups} mountPoints={mountPoints} osType={osType} execCmd={execCmd} />}
        {activeTab === "advanced" && <AdvancedTab disks={disks} osType={osType} volumeGroups={volumeGroups} mountPoints={mountPoints} onFormat={handleFormat} onCreatePartition={handleCreatePartition} onDeletePartition={handleDeletePartition} onMountPartition={handleMountPartition} onUnmountPartition={handleUnmountPartition} execCmd={execCmd} />}
      </div>
    </div>
  )
}

export default DiskManagerContent
