import { create } from 'zustand'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { createTabManager } from '@/hooks/useTabManager'
import type { TerminalTab } from '@/types'

const tabMgr = createTabManager({
  tabsKey: 'terminalTabs',
  activeIndexKey: 'activeTerminalTabIndex',
})

interface TerminalStore {
  addTerminalTab: (windowId: string) => void
  closeTerminalTab: (windowId: string, tabIndex: number) => void
  switchTerminalTab: (windowId: string, tabIndex: number) => void
  reorderTerminalTabs: (windowId: string, fromIndex: number, toIndex: number) => void
}

export const useTerminalStore = create<TerminalStore>(() => ({
  addTerminalTab: (windowId) => {
    const win = useWindowStore.getState().windows.find(w => w.id === windowId)
    if (!win) return
    const newTab: TerminalTab = {
      id: `termtab-${Date.now()}`,
      title: 'zsh',
    }
    useProcessStore.getState().setProcessState(win.pid, (prev) => {
      const tabs = [...((prev.terminalTabs || []) as TerminalTab[]), newTab]
      return { ...prev, terminalTabs: tabs, activeTerminalTabIndex: tabs.length - 1 }
    })
  },

  closeTerminalTab: tabMgr.close,
  switchTerminalTab: tabMgr.switch,
  reorderTerminalTabs: tabMgr.reorder,
}))
