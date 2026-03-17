import { create } from 'zustand'
import type { StorageNodeConfig } from '@/types'

/**
 * 全局数据存储
 *
 * 这个 store 存储所有从 WebSocket 订阅的数据。
 * 数据同步在应用启动时初始化（见 dataSync.ts），
 * 组件只需要从这里读取数据，不需要管理订阅。
 */

interface DataState {
  // 存储节点
  storageNodes: StorageNodeConfig[]
  storageNodesLoading: boolean

  // 侧边栏配置
  sidebarItems: any[]
  sidebarExpandedItems: string[]
  sidebarLoading: boolean

  // 系统概览
  overview: any | null
  overviewLoading: boolean

  // 进程列表
  processes: any[]
  processesTotal: number
  processesLoading: boolean

  // Docker 容器
  dockerContainers: any[]
  dockerAvailable: boolean
  dockerContainersLoading: boolean

  // Docker 镜像
  dockerImages: any[]
  dockerImagesLoading: boolean

  // Docker Compose 项目
  dockerComposeProjects: any[]
  dockerComposeLoading: boolean

  // Docker 网络
  dockerNetworks: any[]
  dockerNetworksLoading: boolean

  // Docker 卷
  dockerVolumes: any[]
  dockerVolumesLoading: boolean

  // 磁盘信息
  disks: any[]
  disksLoading: boolean

  // 系统服务
  services: any[]
  servicesTotal: number
  servicesLoading: boolean

  // 任务列表
  tasks: any[]
  tasksTotal: number
  tasksLoading: boolean

  // ISO 挂载
  mounts: any[]
  mountsLoading: boolean

  // Actions
  setStorageNodes: (nodes: StorageNodeConfig[]) => void
  setSidebarItems: (items: any[]) => void
  setSidebarExpandedItems: (items: string[]) => void
  setOverview: (data: any) => void
  setProcesses: (data: any) => void
  setDockerContainers: (data: any) => void
  setDockerImages: (data: any) => void
  setDockerComposeProjects: (data: any) => void
  setDockerNetworks: (data: any) => void
  setDockerVolumes: (data: any) => void
  setDisks: (data: any) => void
  setServices: (data: any) => void
  setTasks: (data: any) => void
  setMounts: (data: any[]) => void
}

export const useDataStore = create<DataState>((set) => ({
  // Initial state
  storageNodes: [],
  storageNodesLoading: true,

  sidebarItems: [],
  sidebarExpandedItems: [],
  sidebarLoading: true,

  overview: null,
  overviewLoading: true,

  processes: [],
  processesTotal: 0,
  processesLoading: true,

  dockerContainers: [],
  dockerAvailable: false,
  dockerContainersLoading: true,

  dockerImages: [],
  dockerImagesLoading: true,

  dockerComposeProjects: [],
  dockerComposeLoading: true,

  dockerNetworks: [],
  dockerNetworksLoading: true,

  dockerVolumes: [],
  dockerVolumesLoading: true,

  disks: [],
  disksLoading: true,

  services: [],
  servicesTotal: 0,
  servicesLoading: true,

  tasks: [],
  tasksTotal: 0,
  tasksLoading: true,

  mounts: [],
  mountsLoading: true,

  // Actions
  setStorageNodes: (nodes) => set({ storageNodes: nodes, storageNodesLoading: false }),

  setSidebarItems: (items) => set({ sidebarItems: items, sidebarLoading: false }),

  setSidebarExpandedItems: (items) => set({ sidebarExpandedItems: items }),

  setOverview: (data) => set({ overview: data, overviewLoading: false }),

  setProcesses: (data) => set({
    processes: data.processes || [],
    processesTotal: data.total || 0,
    processesLoading: false,
  }),

  setDockerContainers: (data) => set({
    dockerContainers: data.containers || [],
    dockerAvailable: data.available || false,
    dockerContainersLoading: false,
  }),

  setDockerImages: (data) => set({
    dockerImages: data.images || [],
    dockerImagesLoading: false,
  }),

  setDockerComposeProjects: (data) => set({
    dockerComposeProjects: data.projects || [],
    dockerComposeLoading: false,
  }),

  setDockerNetworks: (data) => set({
    dockerNetworks: data.networks || [],
    dockerNetworksLoading: false,
  }),

  setDockerVolumes: (data) => set({
    dockerVolumes: data.volumes || [],
    dockerVolumesLoading: false,
  }),

  setDisks: (data) => set({
    disks: data.disks || [],
    disksLoading: false,
  }),

  setServices: (data) => set({
    services: data.services || [],
    servicesTotal: data.total || 0,
    servicesLoading: false,
  }),

  setTasks: (data) => set({
    tasks: data.tasks || [],
    tasksTotal: data.total || 0,
    tasksLoading: false,
  }),

  setMounts: (data) => set({ mounts: data, mountsLoading: false }),
}))
