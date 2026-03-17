import { useEffect } from 'react'
import { subscribeChannel } from '@/lib/dataSync'
import { useDataStore } from '@/stores/dataStore'

/**
 * 按需订阅系统概览数据
 * 用于系统监控、任务管理器等组件
 */
export function useOverviewData() {
  const overview = useDataStore((s) => s.overview)
  const loading = useDataStore((s) => s.overviewLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.overview', 2000, (data: any) => {
      store.setOverview(data)
    })
  }, [])

  return { overview, loading }
}

/**
 * 按需订阅进程列表数据
 * 用于任务管理器等组件
 */
export function useProcessesData() {
  const processes = useDataStore((s) => s.processes)
  const total = useDataStore((s) => s.processesTotal)
  const loading = useDataStore((s) => s.processesLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.processes', 2000, (data: any) => {
      store.setProcesses(data)
    })
  }, [])

  return { processes, total, loading }
}

/**
 * 按需订阅磁盘信息
 * 用于磁盘管理器等组件
 */
export function useDisksData() {
  const disks = useDataStore((s) => s.disks)
  const loading = useDataStore((s) => s.disksLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.disks', 5000, (data: any) => {
      store.setDisks(data)
    })
  }, [])

  return { disks, loading }
}

/**
 * 按需订阅系统服务数据
 * 用于服务管理器等组件
 */
export function useServicesData() {
  const services = useDataStore((s) => s.services)
  const total = useDataStore((s) => s.servicesTotal)
  const loading = useDataStore((s) => s.servicesLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.services', 5000, (data: any) => {
      store.setServices(data)
    })
  }, [])

  return { services, total, loading }
}

/**
 * 按需订阅任务列表数据
 * 用于任务管理器等组件
 */
export function useTasksData() {
  const tasks = useDataStore((s) => s.tasks)
  const total = useDataStore((s) => s.tasksTotal)
  const loading = useDataStore((s) => s.tasksLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.tasks', 2000, (data: any) => {
      store.setTasks(data)
    })
  }, [])

  return { tasks, total, loading }
}

/**
 * 按需订阅 ISO 挂载数据
 * 用于文件管理器侧边栏
 *
 * 注意：后端已改为 Event 模式，只在挂载/卸载时推送，不再定时轮询
 */
export function useMountsData() {
  const mounts = useDataStore((s) => s.mounts)
  const loading = useDataStore((s) => s.mountsLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.mounts', 0, (data: any) => {
      if (Array.isArray(data)) {
        store.setMounts(data)
      }
    })
  }, [])

  return { mounts, loading }
}

/**
 * 按需订阅 Docker 容器数据
 */
export function useDockerContainersData(interval = 2000) {
  const containers = useDataStore((s) => s.dockerContainers)
  const available = useDataStore((s) => s.dockerAvailable)
  const loading = useDataStore((s) => s.dockerContainersLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_containers', interval, (data: any) => {
      store.setDockerContainers(data)
    })
  }, [interval])

  return { containers, available, loading }
}

/**
 * 按需订阅 Docker 镜像数据
 */
export function useDockerImagesData(interval = 5000) {
  const images = useDataStore((s) => s.dockerImages)
  const loading = useDataStore((s) => s.dockerImagesLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_images', interval, (data: any) => {
      store.setDockerImages(data)
    })
  }, [interval])

  return { images, loading }
}

/**
 * 按需订阅 Docker Compose 数据
 */
export function useDockerComposeData(interval = 5000) {
  const projects = useDataStore((s) => s.dockerComposeProjects)
  const loading = useDataStore((s) => s.dockerComposeLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_compose', interval, (data: any) => {
      store.setDockerComposeProjects(data)
    })
  }, [interval])

  return { projects, loading }
}

/**
 * 按需订阅 Docker 网络数据
 */
export function useDockerNetworksData(interval = 5000) {
  const networks = useDataStore((s) => s.dockerNetworks)
  const loading = useDataStore((s) => s.dockerNetworksLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_networks', interval, (data: any) => {
      store.setDockerNetworks(data)
    })
  }, [interval])

  return { networks, loading }
}

/**
 * 按需订阅 Docker 卷数据
 */
export function useDockerVolumesData(interval = 5000) {
  const volumes = useDataStore((s) => s.dockerVolumes)
  const loading = useDataStore((s) => s.dockerVolumesLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_volumes', interval, (data: any) => {
      store.setDockerVolumes(data)
    })
  }, [interval])

  return { volumes, loading }
}
