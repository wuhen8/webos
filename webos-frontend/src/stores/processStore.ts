import { create } from 'zustand'
import type { Process } from '@/types'
import { request } from '@/stores/webSocketStore'

// App-specific cleanup hooks called when a process is killed
const processCleanupHooks: Record<string, () => void> = {
  'ai-chat': () => {
    request('chat.cleanup', {}).catch(() => {})
  },
}

interface ProcessStore {
  processes: Process[]
  spawnProcess: (appId: string, initialState?: Record<string, unknown>) => string
  killProcess: (pid: string) => void
  getProcess: (pid: string) => Process | undefined
  getProcessesByApp: (appId: string) => Process[]
  updateProcessState: (pid: string, patch: Record<string, unknown>) => void
  setProcessState: (pid: string, updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  addWindowToProcess: (pid: string, windowId: string) => void
  removeWindowFromProcess: (pid: string, windowId: string) => void
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: [],

  spawnProcess: (appId, initialState) => {
    const pid = `proc-${appId}-${Date.now()}`
    const process: Process = {
      pid,
      appId,
      state: initialState || {},
      windowIds: [],
      createdAt: Date.now(),
    }
    set((s) => ({ processes: [...s.processes, process] }))
    return pid
  },

  killProcess: (pid) => {
    const proc = get().processes.find(p => p.pid === pid)
    if (proc) {
      const hook = processCleanupHooks[proc.appId]
      if (hook) hook()
    }
    set((s) => ({ processes: s.processes.filter(p => p.pid !== pid) }))
  },

  getProcess: (pid) => {
    return get().processes.find(p => p.pid === pid)
  },

  getProcessesByApp: (appId) => {
    return get().processes.filter(p => p.appId === appId)
  },

  updateProcessState: (pid, patch) => {
    set((s) => ({
      processes: s.processes.map(p =>
        p.pid === pid ? { ...p, state: { ...p.state, ...patch } } : p
      ),
    }))
  },

  setProcessState: (pid, updater) => {
    set((s) => ({
      processes: s.processes.map(p =>
        p.pid === pid ? { ...p, state: updater(p.state) } : p
      ),
    }))
  },

  addWindowToProcess: (pid, windowId) => {
    set((s) => ({
      processes: s.processes.map(p =>
        p.pid === pid ? { ...p, windowIds: [...p.windowIds, windowId] } : p
      ),
    }))
  },

  removeWindowFromProcess: (pid, windowId) => {
    set((s) => ({
      processes: s.processes.map(p =>
        p.pid === pid ? { ...p, windowIds: p.windowIds.filter(id => id !== windowId) } : p
      ),
    }))
  },
}))
