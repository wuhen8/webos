import { create } from 'zustand'

export interface BackgroundTask {
  id: string
  type: string
  title: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  message: string
  createdAt: number
  doneAt?: number
  progress?: number       // 0-1, null = indeterminate
  itemCurrent?: number
  itemTotal?: number
  bytesCurrent?: number
  bytesTotal?: number
  cancellable?: boolean
  outputMode?: 'progress' | 'log'  // Output mode
  logs?: string[]                   // Log lines (log mode only)
}

interface TaskState {
  tasks: BackgroundTask[]
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

  upsertTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id)
      let tasks: BackgroundTask[]
      if (idx >= 0) {
        tasks = [...state.tasks]
        tasks[idx] = task
      } else {
        tasks = [task, ...state.tasks]
      }
      return { tasks: sortTasks(tasks) }
    }),

  setTasks: (tasks) => set({ tasks: sortTasks(tasks) }),

  clearCompleted: () =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status === 'running')
    })),
}))
