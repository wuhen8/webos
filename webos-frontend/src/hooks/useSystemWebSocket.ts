import { useEffect, useRef, useCallback } from "react"
import { useWebSocketStore } from "@/stores"

type Channel = "overview" | "processes" | "disks" | "tasks" | "services" | "scheduled"

interface UseSystemWebSocketOptions {
  channel: Channel
  interval: number
  enabled: boolean
  onOverview?: (data: any) => void
  onProcesses?: (data: any) => void
  onDisks?: (data: any) => void
  onTasks?: (data: any) => void
  onServices?: (data: any) => void
}

export function useSystemWebSocket({
  channel,
  interval,
  enabled,
  onOverview,
  onProcesses,
  onDisks,
  onTasks,
  onServices,
}: UseSystemWebSocketOptions) {
  const connected = useWebSocketStore((s) => s.connected)
  const subscribe = useWebSocketStore((s) => s.subscribe)

  const onOverviewRef = useRef(onOverview)
  const onProcessesRef = useRef(onProcesses)
  const onDisksRef = useRef(onDisks)
  const onTasksRef = useRef(onTasks)
  const onServicesRef = useRef(onServices)
  onOverviewRef.current = onOverview
  onProcessesRef.current = onProcesses
  onDisksRef.current = onDisks
  onTasksRef.current = onTasks
  onServicesRef.current = onServices

  const overviewHandler = useCallback((data: any) => {
    onOverviewRef.current?.(data)
  }, [])

  const processesHandler = useCallback((data: any) => {
    onProcessesRef.current?.(data)
  }, [])

  const disksHandler = useCallback((data: any) => {
    onDisksRef.current?.(data)
  }, [])

  const tasksHandler = useCallback((data: any) => {
    onTasksRef.current?.(data)
  }, [])

  const servicesHandler = useCallback((data: any) => {
    onServicesRef.current?.(data)
  }, [])

  // Subscribe to the active channel when enabled
  useEffect(() => {
    if (!enabled) return

    const handlerMap: Record<Channel, (data: any) => void> = {
      overview: overviewHandler,
      processes: processesHandler,
      disks: disksHandler,
      tasks: tasksHandler,
      services: servicesHandler,
      scheduled: () => {},
    }
    const handler = handlerMap[channel] || overviewHandler
    const unsub = subscribe(channel, interval, handler)
    return unsub
  }, [channel, interval, enabled, subscribe, overviewHandler, processesHandler, disksHandler, tasksHandler, servicesHandler])

  return { connected }
}
