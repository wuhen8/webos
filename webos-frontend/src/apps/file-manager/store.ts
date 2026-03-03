import { create } from 'zustand'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { createTabManager } from '@/hooks/useTabManager'
import type { FileManagerTab, ClipboardState } from '@/types'

const tabMgr = createTabManager({
  tabsKey: 'fmTabs',
  activeIndexKey: 'activeFmTabIndex',
  getTitle: (tabs, activeIndex) => tabs[activeIndex]?.title || '文件管理器',
})

interface FileManagerStore {
  clipboard: ClipboardState | null
  setClipboard: (cb: ClipboardState | null) => void
  addFmTab: (windowId: string) => void
  closeFmTab: (windowId: string, tabIndex: number) => void
  switchFmTab: (windowId: string, tabIndex: number) => void
  reorderFmTabs: (windowId: string, fromIndex: number, toIndex: number) => void
  updateFmTabState: (windowId: string, tabIndex: number, patch: Partial<FileManagerTab>) => void
}

export const useFileManagerStore = create<FileManagerStore>((set) => ({
  clipboard: null,
  setClipboard: (cb) => set({ clipboard: cb }),
  addFmTab: (windowId) => {
    const win = useWindowStore.getState().windows.find(w => w.id === windowId)
    if (!win) return
    const newTab: FileManagerTab = {
      id: `fmtab-${Date.now()}`,
      currentPath: '~',
      history: ['~'],
      historyIndex: 0,
      files: [],
      selectedFiles: [],
      activeNodeId: 'local_1',
      title: '~',
      pathCache: {},
    }
    useProcessStore.getState().setProcessState(win.pid, (prev) => {
      const tabs = [...((prev.fmTabs || []) as FileManagerTab[]), newTab]
      return { ...prev, fmTabs: tabs, activeFmTabIndex: tabs.length - 1 }
    })
    useWindowStore.getState().updateWindowTitle(windowId, newTab.title)
  },

  closeFmTab: tabMgr.close,
  switchFmTab: tabMgr.switch,
  reorderFmTabs: tabMgr.reorder,

  updateFmTabState: (windowId, tabIndex, patch) => {
    const win = useWindowStore.getState().windows.find(w => w.id === windowId)
    if (!win) return
    useProcessStore.getState().setProcessState(win.pid, (prev) => {
      const fmTabs = [...((prev.fmTabs || []) as FileManagerTab[])]
      if (!fmTabs[tabIndex]) return prev
      fmTabs[tabIndex] = { ...fmTabs[tabIndex], ...patch }
      return { ...prev, fmTabs }
    })
    if (patch.title) {
      const process = useProcessStore.getState().getProcess(win.pid)
      if (process) {
        const isActiveTab = tabIndex === ((process.state.activeFmTabIndex as number) ?? 0)
        if (isActiveTab) {
          useWindowStore.getState().updateWindowTitle(windowId, patch.title)
        }
      }
    }
  },
}))
