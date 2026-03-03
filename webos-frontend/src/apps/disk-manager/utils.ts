import type { SmartInfo, SmartAttr, OSType, DiskInfo, LVMVolumeGroup, StoragePool, PoolMemberDisk, DiskStatus, PartitionInfo, RAIDArray, RAIDMember } from "./types"

// ==================== Formatting ====================

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i]
}

export function formatHours(hours: number): string {
  if (!hours) return "-"
  const days = Math.floor(hours / 24)
  const h = hours % 24
  if (days > 365) return `${(days / 365).toFixed(1)} 年`
  if (days > 0) return `${days} 天 ${h} 小时`
  return `${h} 小时`
}

export function formatPercent(value: number): string {
  return value.toFixed(1) + "%"
}

// ==================== S.M.A.R.T ====================

export function smartAttrStatus(attr: { value: number; worst: number; threshold: number }): string {
  if (!attr.threshold) return "ok"
  if (attr.value <= attr.threshold) return "critical"
  if (attr.worst <= attr.threshold + 10) return "warning"
  return "ok"
}

export function parseSmartJSON(raw: string): SmartInfo {
  const info: SmartInfo = { available: false, healthy: false, temperature: 0, powerOnHours: 0, powerCycles: 0, model: "", serial: "", firmware: "", attributes: [] }
  try {
    const data = JSON.parse(raw)
    const messages = data.smartctl?.messages || []
    if (messages.some((m: any) => m.severity === "error") || !data.smart_status) {
      info.available = false
      return info
    }
    info.available = true
    info.healthy = data.smart_status?.passed ?? false
    info.model = data.model_name || ""
    info.serial = data.serial_number || ""
    info.firmware = data.firmware_version || ""
    info.temperature = data.temperature?.current || 0
    info.powerOnHours = data.power_on_time?.hours || 0
    info.powerCycles = data.power_cycle_count || 0
    const table = data.ata_smart_attributes?.table || []
    for (const a of table) {
      const attr: SmartAttr = {
        id: a.id || 0, name: a.name || "", value: a.value || 0,
        worst: a.worst || 0, threshold: a.thresh || 0,
        rawValue: a.raw?.string || String(a.raw?.value ?? ""),
        status: "",
      }
      attr.status = smartAttrStatus(attr)
      info.attributes.push(attr)
    }
  } catch { info.available = false }
  return info
}

// ==================== Filesystem Options ====================

export function getFilesystemOptions(os: OSType): { options: string[]; defaultFs: string } {
  if (os === "linux") return { options: ["ext4", "xfs", "btrfs", "zfs", "fat32", "exfat", "ntfs"], defaultFs: "ext4" }
  return { options: ["apfs", "hfs+", "fat32", "exfat", "ntfs"], defaultFs: "apfs" }
}

// ==================== Storage Pool Derivation ====================

export function deriveStoragePools(volumeGroups: LVMVolumeGroup[], disks: DiskInfo[]): StoragePool[] {
  return volumeGroups.map((vg) => {
    const memberDisks: PoolMemberDisk[] = (vg.pvs || []).map((pv) => {
      const disk = disks.find((d) => d.device === pv.device || d.partitions?.some((p) => p.device === pv.device))
      return {
        device: pv.device,
        model: disk?.model || "",
        size: pv.size,
        transport: disk?.transport || "",
      }
    })

    const volumes = (vg.lvs || []).map((lv) => ({
      name: lv.name,
      path: lv.path,
      size: lv.size,
      fsType: lv.fsType,
      mountPoint: lv.mountPoint,
      used: lv.used,
      available: lv.available,
      usePercent: lv.usePercent,
    }))

    const usedSpace = volumes.reduce((sum, v) => sum + (v.used || 0), 0)

    return {
      name: vg.name,
      totalSize: vg.size,
      freeSpace: vg.free,
      usedSpace,
      pvCount: vg.pvCount,
      lvCount: vg.lvCount,
      memberDisks,
      volumes,
    }
  })
}

export function classifyDiskStatus(disk: DiskInfo, volumeGroups: LVMVolumeGroup[]): { status: DiskStatus; poolName?: string } {
  // Check if disk is a PV in any VG
  if (disk.lvmVGName) {
    return { status: "in-pool", poolName: disk.lvmVGName }
  }
  for (const vg of volumeGroups) {
    for (const pv of (vg.pvs || [])) {
      if (pv.device === disk.device) {
        return { status: "in-pool", poolName: vg.name }
      }
    }
  }

  // Check if system disk (has / or /boot mount)
  const isSystem = disk.partitions?.some((p) =>
    p.mountPoint === "/" || p.mountPoint === "/boot" || p.mountPoint === "/boot/efi"
  )
  if (isSystem) return { status: "system-disk" }

  // Check if has partitions
  if (disk.partitions?.length > 0) return { status: "has-partitions" }

  // Available
  return { status: "available" }
}

// ==================== Command Builders ====================

const mkfsMap: Record<string, string> = {
  ext4: "mkfs.ext4", xfs: "mkfs.xfs", btrfs: "mkfs.btrfs",
  zfs: "mkfs.ext4", fat32: "mkfs.vfat -F 32", exfat: "mkfs.exfat", ntfs: "mkfs.ntfs -f",
}

export function buildCreatePoolCommands(devices: string[], poolName: string, fsType: string, mountPoint: string, lvName = "lv_data"): string {
  const mkfs = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
  const lvPath = `/dev/${poolName}/${lvName}`
  const cmds: string[] = []

  for (const dev of devices) {
    cmds.push(`wipefs -a ${dev}`)
    cmds.push(`pvcreate -f ${dev}`)
  }
  cmds.push(`vgcreate ${poolName} ${devices.join(" ")}`)
  cmds.push(`lvcreate -Wy --yes -l 100%FREE -n ${lvName} ${poolName}`)
  cmds.push(`${mkfs} ${lvPath}`)
  cmds.push(`mkdir -p ${mountPoint}`)
  cmds.push(`mount ${lvPath} ${mountPoint}`)
  cmds.push(`echo '${lvPath} ${mountPoint} ${fsType} defaults 0 2' >> /etc/fstab`)

  return cmds.join(" && ")
}

/** HDD -> mdadm RAID -> LVM -> FS -> mount 全链路命令 */
export function buildCreatePoolWithRAIDCommands(
  devices: string[], raidLevel: string, arrayName: string,
  poolName: string, lvName: string, fsType: string, mountPoint: string
): string {
  const mdDev = arrayName.startsWith("/dev/") ? arrayName : `/dev/${arrayName}`
  const mkfs = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
  const lvPath = `/dev/${poolName}/${lvName}`
  const cmds: string[] = []

  // 1. 清除磁盘
  for (const dev of devices) {
    cmds.push(`wipefs -a ${dev}`)
  }
  // 2. 创建 RAID
  cmds.push(`mdadm --create ${mdDev} --level=${raidLevel} --raid-devices=${devices.length} ${devices.join(" ")} --run`)
  // 3. 保存 RAID 配置
  cmds.push(`mkdir -p /etc/mdadm && mdadm --detail --scan >> /etc/mdadm/mdadm.conf 2>/dev/null || mdadm --detail --scan >> /etc/mdadm.conf`)
  // 4. LVM: PV -> VG -> LV
  cmds.push(`pvcreate -f ${mdDev}`)
  cmds.push(`vgcreate ${poolName} ${mdDev}`)
  cmds.push(`lvcreate -Wy --yes -l 100%FREE -n ${lvName} ${poolName}`)
  // 5. 格式化
  cmds.push(`${mkfs} ${lvPath}`)
  // 6. 挂载 + fstab
  cmds.push(`mkdir -p ${mountPoint}`)
  cmds.push(`mount ${lvPath} ${mountPoint}`)
  cmds.push(`echo '${lvPath} ${mountPoint} ${fsType} defaults 0 2' >> /etc/fstab`)

  return cmds.join(" && ")
}

export function buildAddDiskToPoolCommands(device: string, poolName: string, lvPath?: string, fsType?: string): string {
  const cmds = [
    `wipefs -a ${device}`,
    `pvcreate -f ${device}`,
    `vgextend ${poolName} ${device}`,
  ]
  if (lvPath) {
    cmds.push(`lvextend -l +100%FREE ${lvPath}`)
    if (fsType === "xfs") {
      cmds.push(`xfs_growfs ${lvPath}`)
    } else {
      cmds.push(`resize2fs ${lvPath}`)
    }
  }
  return cmds.join(" && ")
}

/** 添加磁盘到 RAID 存储池: bash 脚本方式，确保 wait 循环正确执行 */
export function buildExpandPoolWithRAIDCommands(
  diskDevice: string, raidDevice: string, newTotalDevices: number,
  poolName: string, lvPath: string, fsType: string
): string {
  const lines = [
    `set -e`,
    `wipefs -a ${diskDevice}`,
    `mdadm --add ${raidDevice} ${diskDevice}`,
    `sleep 2`,
    `echo "等待 RAID recovery 完成..."`,
    `while grep -qE 'recovery|resync' /proc/mdstat 2>/dev/null; do sleep 5; done`,
    `mdadm --grow ${raidDevice} --raid-devices=${newTotalDevices}`,
    `sleep 2`,
    `echo "等待 RAID reshape 完成..."`,
    `while grep -qE 'reshape|resync|recovery' /proc/mdstat 2>/dev/null; do sleep 5; done`,
    `mdadm --detail --scan > /etc/mdadm/mdadm.conf 2>/dev/null || mdadm --detail --scan > /etc/mdadm.conf`,
    `pvresize ${raidDevice}`,
    `lvextend -l +100%FREE ${lvPath}`,
  ]
  if (fsType === "xfs") {
    lines.push(`xfs_growfs ${lvPath}`)
  } else if (fsType === "btrfs") {
    lines.push(`btrfs filesystem resize max ${lvPath}`)
  } else {
    lines.push(`resize2fs ${lvPath}`)
  }
  const script = lines.join("\n")
  return `bash -c '${script.replace(/'/g, "'\\''")}'`
}

export function buildCreateVolumeCommands(vgName: string, lvName: string, size: string, fsType: string, mountPoint: string): string {
  const mkfs = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
  const sizeFlag = size.includes("%") ? `-l ${size}` : `-L ${size}`
  const lvPath = `/dev/${vgName}/${lvName}`
  const cmds = [
    `lvcreate -Wy --yes ${sizeFlag} -n ${lvName} ${vgName}`,
    `${mkfs} ${lvPath}`,
    `mkdir -p ${mountPoint}`,
    `mount ${lvPath} ${mountPoint}`,
    `echo '${lvPath} ${mountPoint} ${fsType} defaults 0 2' >> /etc/fstab`,
  ]
  return cmds.join(" && ")
}

export function buildExpandVolumeCommands(lvPath: string, size: string, fsType: string): string {
  const sizeFlag = size.includes("%") ? `-l ${size}` : `-L ${size}`
  const cmds = [`lvextend ${sizeFlag} ${lvPath}`]
  if (fsType === "xfs") {
    cmds.push(`xfs_growfs ${lvPath}`)
  } else {
    cmds.push(`resize2fs ${lvPath}`)
  }
  return cmds.join(" && ")
}

export function buildDeleteVolumeCommands(lvPath: string, mountPoint?: string): string {
  const cmds: string[] = []
  if (mountPoint) {
    cmds.push(`umount ${lvPath}`)
    cmds.push(`sed -i '\\|${lvPath}|d' /etc/fstab`)
  }
  cmds.push(`lvremove -f ${lvPath}`)
  return cmds.join(" && ")
}

export function buildDeletePoolCommands(vgName: string, lvs: { path: string; mountPoint?: string }[], pvDevices: string[]): string {
  const cmds: string[] = []
  // 1. Unmount & clean fstab
  for (const lv of lvs) {
    if (lv.mountPoint) {
      cmds.push(`umount ${lv.path} 2>/dev/null || true`)
      cmds.push(`sed -i '\\|${lv.path}|d' /etc/fstab`)
    }
  }
  // 2. Remove LVs
  for (const lv of lvs) {
    cmds.push(`lvremove -f ${lv.path}`)
  }
  // 3. Remove VG
  cmds.push(`vgremove -f ${vgName}`)
  // 4. Remove PVs
  for (const dev of pvDevices) {
    cmds.push(`pvremove -f ${dev}`)
  }
  // 5. If PV is a RAID device (/dev/mdX), stop the array, clear superblocks on member disks, wipefs
  const raidDevs = pvDevices.filter((d) => d.match(/\/dev\/md\d+/))
  for (const md of raidDevs) {
    // Get member disks before stopping, then stop, zero superblock, wipefs each member
    cmds.push(`MEMBERS=$(mdadm --detail ${md} 2>/dev/null | grep '/dev/' | grep -v '${md}' | awk '{print $NF}')`)
    cmds.push(`mdadm --stop ${md}`)
    cmds.push(`for m in $MEMBERS; do mdadm --zero-superblock $m 2>/dev/null; wipefs -a $m 2>/dev/null; done`)
    // Remove from mdadm.conf
    cmds.push(`sed -i '\\|${md.replace("/dev/", "")}|d' /etc/mdadm/mdadm.conf 2>/dev/null || sed -i '\\|${md.replace("/dev/", "")}|d' /etc/mdadm.conf 2>/dev/null || true`)
  }
  return cmds.join(" && ")
}

// Legacy command builders (used by AdvancedTab)

export function buildQuickStorageCommands(os: OSType, device: string, fsType: string, mountPoint: string): string {
  if (os === "darwin") {
    const fsMap: Record<string, string> = { apfs: "APFS", "hfs+": "JHFS+", fat32: "FAT32", exfat: "ExFAT", ntfs: "NTFS" }
    const fs = fsMap[fsType.toLowerCase()] || "APFS"
    const label = mountPoint.split("/").pop() || "Untitled"
    return `diskutil eraseDisk ${fs} "${label}" GPT ${device}`
  }
  const vgName = "vg_" + (device.split("/").pop() || "data")
  const lvName = "lv_data"
  const mkfs2 = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
  const cmds = [
    `wipefs -a ${device}`,
    `pvcreate -f ${device}`,
    `vgcreate ${vgName} ${device}`,
    `lvcreate -Wy --yes -l 100%FREE -n ${lvName} ${vgName}`,
    `${mkfs2} /dev/${vgName}/${lvName}`,
    `mkdir -p ${mountPoint}`,
    `mount /dev/${vgName}/${lvName} ${mountPoint}`,
    `echo '/dev/${vgName}/${lvName} ${mountPoint} ${fsType} defaults 0 2' >> /etc/fstab`,
  ]
  return cmds.join(" && ")
}

export function buildExtendVGCommands(device: string, vgName: string, lvPath: string, fsType: string): string {
  const cmds = [
    `wipefs -a ${device}`,
    `pvcreate -f ${device}`,
    `vgextend ${vgName} ${device}`,
    `lvextend -l +100%FREE ${lvPath}`,
  ]
  if (fsType === "xfs") {
    cmds.push(`xfs_growfs ${lvPath}`)
  } else {
    cmds.push(`resize2fs ${lvPath}`)
  }
  return cmds.join(" && ")
}


// ==================== RAID (mdadm) ====================

export const raidLevels = [
  { value: "0", label: "RAID 0", minDisks: 1, fault: 0,
    desc: "数据条带分布，读写速度翻倍，但任何一块盘坏了全部数据丢失，不允许坏盘",
    short: "高性能 · 0 容错" },
  { value: "1", label: "RAID 1", minDisks: 2, fault: -1,
    desc: "所有磁盘互为镜像，允许坏到只剩 1 块盘，可用容量等于最小的一块盘",
    short: "全镜像 · N-1 容错" },
  { value: "5", label: "RAID 5", minDisks: 3, fault: 1,
    desc: "数据和校验分布在所有盘上，允许坏 1 块盘，可用容量 = (N-1) × 最小盘",
    short: "均衡 · 1 盘容错" },
  { value: "6", label: "RAID 6", minDisks: 4, fault: 2,
    desc: "双重校验，允许同时坏 2 块盘，可用容量 = (N-2) × 最小盘",
    short: "高安全 · 2 盘容错" },
  { value: "10", label: "RAID 10", minDisks: 4, fault: -2,
    desc: "先镜像再条带，每组镜像允许坏 1 块，兼顾性能和冗余，可用容量 = N/2 × 最小盘",
    short: "高性能+冗余 · 每组 1 盘容错" },
]

export function buildCreateRAIDCommands(
  level: string, devices: string[], arrayName: string, fsType: string, mountPoint: string
): string {
  const mdDev = arrayName.startsWith("/dev/") ? arrayName : `/dev/${arrayName}`
  const name = arrayName.replace("/dev/", "")
  const mkfs = mkfsMap[fsType.toLowerCase()] || "mkfs.ext4"
  const cmds: string[] = []
  for (const dev of devices) {
    cmds.push(`wipefs -a ${dev}`)
  }
  cmds.push(`mdadm --create ${mdDev} --level=${level} --raid-devices=${devices.length} ${devices.join(" ")} --run`)
  cmds.push(`${mkfs} ${mdDev}`)
  if (mountPoint) {
    cmds.push(`mkdir -p ${mountPoint}`)
    cmds.push(`mount ${mdDev} ${mountPoint}`)
    cmds.push(`echo '${mdDev} ${mountPoint} ${fsType} defaults 0 2' >> /etc/fstab`)
  }
  cmds.push(`mdadm --detail --scan >> /etc/mdadm/mdadm.conf || mdadm --detail --scan >> /etc/mdadm.conf`)
  return cmds.join(" && ")
}

export function buildStopRAIDCommands(device: string, mountPoint?: string): string {
  const cmds: string[] = []
  if (mountPoint) {
    cmds.push(`umount ${device}`)
    cmds.push(`sed -i '\\|${device}|d' /etc/fstab`)
  }
  cmds.push(`mdadm --stop ${device}`)
  cmds.push(`mdadm --zero-superblock $(mdadm --detail ${device} 2>/dev/null | grep '/dev/' | awk '{print $NF}') 2>/dev/null || true`)
  return cmds.join(" && ")
}

export function buildAddDiskToRAIDCommands(arrayDevice: string, diskDevice: string): string {
  return `mdadm --add ${arrayDevice} ${diskDevice}`
}

export function buildRemoveDiskFromRAIDCommands(arrayDevice: string, diskDevice: string): string {
  return `mdadm --fail ${arrayDevice} ${diskDevice} && mdadm --remove ${arrayDevice} ${diskDevice}`
}

export function buildCheckRAIDCommands(arrayDevice: string): string {
  return `echo check > /sys/block/${arrayDevice.replace("/dev/", "")}/md/sync_action`
}

export function buildRepairRAIDCommands(arrayDevice: string): string {
  return `echo repair > /sys/block/${arrayDevice.replace("/dev/", "")}/md/sync_action`
}

export function parseRAIDArrays(raw: string): RAIDArray[] {
  const arrays: RAIDArray[] = []
  if (!raw) return arrays

  // Parse mdadm --detail --scan output or /proc/mdstat + detail
  const lines = raw.split("\n")
  let current: RAIDArray | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect array header from mdadm --detail
    if (trimmed.startsWith("/dev/md")) {
      if (current) arrays.push(current)
      const device = trimmed.replace(":", "").trim()
      current = {
        name: device.replace("/dev/", ""),
        device,
        level: "", state: "", size: 0,
        totalDevices: 0, activeDevices: 0, failedDevices: 0, spareDevices: 0,
        uuid: "", members: [],
      }
      continue
    }

    if (!current) continue

    if (trimmed.startsWith("Raid Level :")) {
      current.level = trimmed.split(":")[1]?.trim() || ""
    } else if (trimmed.startsWith("Array Size :")) {
      const m = trimmed.match(/(\d+)/)
      if (m) current.size = parseInt(m[1]) * 1024
    } else if (trimmed.startsWith("State :")) {
      current.state = trimmed.split(":")[1]?.trim() || ""
    } else if (trimmed.startsWith("Active Devices :")) {
      current.activeDevices = parseInt(trimmed.split(":")[1]?.trim() || "0")
    } else if (trimmed.startsWith("Failed Devices :")) {
      current.failedDevices = parseInt(trimmed.split(":")[1]?.trim() || "0")
    } else if (trimmed.startsWith("Spare Devices :")) {
      current.spareDevices = parseInt(trimmed.split(":")[1]?.trim() || "0")
    } else if (trimmed.startsWith("Total Devices :")) {
      current.totalDevices = parseInt(trimmed.split(":")[1]?.trim() || "0")
    } else if (trimmed.startsWith("UUID :")) {
      current.uuid = trimmed.split(":").slice(1).join(":").trim()
    } else if (trimmed.startsWith("Rebuild Status") || trimmed.startsWith("Resync Status") || trimmed.startsWith("Check Status")) {
      const pctMatch = trimmed.match(/([\d.]+)%/)
      if (pctMatch) current.syncPercent = parseFloat(pctMatch[1])
      if (trimmed.includes("Rebuild")) current.syncAction = "rebuild"
      else if (trimmed.includes("Check")) current.syncAction = "check"
      else current.syncAction = "resync"
    } else if (trimmed.match(/^\d+\s+\d+\s+\d+\s+/) && trimmed.includes("/dev/")) {
      const fields = trimmed.split(/\s+/)
      const device = fields[fields.length - 1]
      if (device.startsWith("/dev/")) {
        const stateFields = fields.slice(4, fields.length - 1)
        const state = stateFields.join(" ")
        let role = "active"
        if (state.includes("spare")) role = "spare"
        if (state.includes("faulty") || state.includes("removed")) role = "faulty"
        current.members.push({
          device,
          role,
          state,
          slot: parseInt(fields[0]) || 0,
        })
      }
    }
  }
  if (current) arrays.push(current)
  return arrays
}
