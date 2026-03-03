// ==================== Disk Manager Types ====================

export interface PartitionInfo {
  name: string
  device: string
  size: number
  fsType: string
  label: string
  uuid: string
  mountPoint: string
  used: number
  available: number
  usePercent: number
}

export interface DiskInfo {
  name: string
  device: string
  model: string
  serial: string
  size: number
  type: string
  transport: string
  removable: boolean
  readOnly: boolean
  partitions: PartitionInfo[]
  lvmVGName?: string
}

export interface LVMPhysicalVolume {
  device: string
  vgName: string
  size: number
  free: number
}

export interface LVMLogicalVolume {
  name: string
  vgName: string
  path: string
  size: number
  fsType: string
  mountPoint: string
  used: number
  available: number
  usePercent: number
}

export interface LVMVolumeGroup {
  name: string
  size: number
  free: number
  pvCount: number
  lvCount: number
  pvs: LVMPhysicalVolume[]
  lvs: LVMLogicalVolume[]
}

export interface MountPointInfo {
  filesystem: string
  fsType: string
  size: number
  used: number
  available: number
  usePercent: number
  mountPoint: string
}

export interface SmartAttr {
  id: number
  name: string
  value: number
  worst: number
  threshold: number
  rawValue: string
  status: string
}

export interface SmartInfo {
  available: boolean
  healthy: boolean
  temperature: number
  powerOnHours: number
  powerCycles: number
  model: string
  serial: string
  firmware: string
  attributes: SmartAttr[]
}

// ==================== RAID Types ====================

export interface RAIDMember {
  device: string
  role: string   // active | spare | faulty
  state: string
  slot: number
}

export interface RAIDArray {
  name: string
  device: string
  level: string
  state: string
  size: number
  totalDevices: number
  activeDevices: number
  failedDevices: number
  spareDevices: number
  uuid: string
  members: RAIDMember[]
  syncAction?: string
  syncPercent?: number
  mountPoint?: string
  fsType?: string
}

export type OSType = "darwin" | "linux"

export type TabType = "overview" | "pools" | "advanced"

// ==================== Storage Pool Types ====================

export interface PoolMemberDisk {
  device: string
  model: string
  size: number
  transport: string
}

export interface PoolVolume {
  name: string
  path: string
  size: number
  fsType: string
  mountPoint: string
  used: number
  available: number
  usePercent: number
}

export interface StoragePool {
  name: string
  totalSize: number
  freeSpace: number
  usedSpace: number
  pvCount: number
  lvCount: number
  memberDisks: PoolMemberDisk[]
  volumes: PoolVolume[]
}

export type DiskStatus = "in-pool" | "has-partitions" | "available" | "system-disk"

export interface DiskWithStatus extends DiskInfo {
  status: DiskStatus
  poolName?: string
}

export interface CreatePoolWizardState {
  step: 1 | 2 | 3 | 4 | 5
  selectedDevices: string[]
  // RAID config
  useRAID: boolean
  raidLevel: string
  arrayName: string
  // LVM config
  poolName: string
  lvName: string
  // Filesystem & mount
  fsType: string
  mountPoint: string
}
