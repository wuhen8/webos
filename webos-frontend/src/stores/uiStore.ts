import { create } from 'zustand'
import type { GlobalMenuState, ConfirmDialogOptions } from '@/types'

interface UIState {
  globalMenu: GlobalMenuState | null
  clearSelectionTick: number
  topMenuOpen: boolean
  confirmDialog: ConfirmDialogOptions | null
  spotlightOpen: boolean
  launchpadOpen: boolean
  openGlobalMenu: (menu: GlobalMenuState) => void
  closeGlobalMenu: () => void
  incrementClearSelection: () => void
  setTopMenuOpen: (v: boolean) => void
  showConfirm: (options: ConfirmDialogOptions) => void
  closeConfirm: () => void
  setSpotlightOpen: (v: boolean) => void
  setLaunchpadOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  globalMenu: null,
  clearSelectionTick: 0,
  topMenuOpen: false,
  confirmDialog: null,
  spotlightOpen: false,
  launchpadOpen: false,

  openGlobalMenu: (menu) => set({ globalMenu: menu }),
  closeGlobalMenu: () => set({ globalMenu: null }),
  incrementClearSelection: () => set((s) => ({ clearSelectionTick: s.clearSelectionTick + 1 })),
  setTopMenuOpen: (v) => set({ topMenuOpen: v }),
  showConfirm: (options) => set({ confirmDialog: options }),
  closeConfirm: () => set({ confirmDialog: null }),
  setSpotlightOpen: (v) => set({ spotlightOpen: v }),
  setLaunchpadOpen: (v) => set({ launchpadOpen: v }),
}))
