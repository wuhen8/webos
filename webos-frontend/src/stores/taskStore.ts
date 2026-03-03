import { create } from 'zustand'

export interface BackgroundTask {
  id: string
  type: string
  title: string
  status: 'running' | 'success' | 'failed'
  message: string
  createdAt: number
  doneAt?: number
  progress?: number       // 0-1, null = indeterminate
  itemCurrent?: number
  itemTotal?: number
  bytesCurrent?: number
  bytesTotal?: number
  cancellable?: boolean
}

export interface TaskLogEntry {
  time: number
  message: string
}

interface TaskState {
  tasks: BackgroundTask[]
  /** Accumulated log entries per task (frontend-side collection from message changes) */
  taskLogs: Record<string, TaskLogEntry[]>
  upsertTask: (task: BackgroundTask) => void
  setTasks: (tasks: BackgroundTask[]) => void
  clearCompleted: () => void
}

/** Sort tasks: running first, then by createdAt descending (newest on top) */
function sortTasks(tasks: BackgroundTask[]): BackgroundTask[] {
  return [...tasks].sort((a, b) => {
    const aRunning = a.status === 'running' ? 0 : 1
    const bRunning = b.status === 'running' ? 0 : 1
    if (aRunning !== bRunning) return aRunning - bRunning
    return b.createdAt - a.createdAt
  })
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  taskLogs: {},

  upsertTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id)
      // Accumulate log: only mutate taskLogs when message actually changed
      let taskLogs = state.taskLogs
      if (task.message) {
        const prev = idx >= 0 ? state.tasks[idx] : null
        if (!prev || prev.message !== task.message) {
          const entries = taskLogs[task.id] ? [...taskLogs[task.id]] : []
          entries.push({ time: Date.now(), message: task.message })
          taskLogs = { ...taskLogs, [task.id]: entries }
        }
      }
      let tasks: BackgroundTask[]
      if (idx >= 0) {
        tasks = [...state.tasks]
        tasks[idx] = task
      } else {
        tasks = [task, ...state.tasks]
      }
      return { tasks: sortTasks(tasks), taskLogs }
    }),

  setTasks: (tasks) => set({ tasks: sortTasks(tasks) }),

  clearCompleted: () =>
    set((state) => {
      const running = state.tasks.filter((t) => t.status === 'running')
      const runningIds = new Set(running.map(t => t.id))
      const newLogs: Record<string, TaskLogEntry[]> = {}
      for (const id of Object.keys(state.taskLogs)) {
        if (runningIds.has(id)) newLogs[id] = state.taskLogs[id]
      }
      return { tasks: running, taskLogs: newLogs }
    }),
}))
