import { create } from 'zustand'

interface ProgressState {
  open: boolean
  title: string
  message?: string
  progress?: number  // 0-1, undefined = indeterminate
  cancellable?: boolean
  onCancel?: () => void
}

interface ProgressDialogStore {
  state: ProgressState | null
  show: (config: Omit<ProgressState, 'open'>) => void
  update: (updates: Partial<Omit<ProgressState, 'open'>>) => void
  close: () => void
}

export const useProgressDialogStore = create<ProgressDialogStore>((set) => ({
  state: null,

  show: (config) =>
    set({
      state: { ...config, open: true },
    }),

  update: (updates) =>
    set((s) => ({
      state: s.state ? { ...s.state, ...updates } : null,
    })),

  close: () => set({ state: null }),
}))
