import { useCallback } from 'react'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'

export function createAppStateHook<T extends Record<string, unknown>>(defaultState: T) {
  return function useAppState(windowId: string): [T, (patch: Partial<T>) => void] {
    const data = useProcessStore((s) => {
      const win = useWindowStore.getState().windows.find((w) => w.id === windowId)
      if (!win) return defaultState
      const proc = s.processes.find((p) => p.pid === win.pid)
      return (proc?.state ?? defaultState) as T
    })
    const update = useCallback(
      (patch: Partial<T>) => {
        const win = useWindowStore.getState().windows.find((w) => w.id === windowId)
        if (!win) return
        useProcessStore.getState().updateProcessState(win.pid, patch as Record<string, unknown>)
      },
      [windowId],
    )
    return [data, update]
  }
}
