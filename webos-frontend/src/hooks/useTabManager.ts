import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'

interface TabManagerConfig {
  /** Key in process state for the tabs array, e.g. 'fmTabs', 'tabs', 'terminalTabs' */
  tabsKey: string
  /** Key in process state for the active tab index, e.g. 'activeFmTabIndex' */
  activeIndexKey: string
  /** Called after close/switch to update window title. Return null to skip. */
  getTitle?: (tabs: any[], activeIndex: number) => string | null
  /** Called after close to sync extra state (e.g. editor syncs file/content). */
  onSwitch?: (tab: any, state: Record<string, any>) => Record<string, any>
}

function getWinPid(windowId: string): { pid: string; state: Record<string, any> } | null {
  const win = useWindowStore.getState().windows.find(w => w.id === windowId)
  if (!win) return null
  const process = useProcessStore.getState().getProcess(win.pid)
  if (!process) return null
  return { pid: win.pid, state: process.state }
}

export function createTabManager(config: TabManagerConfig) {
  const { tabsKey, activeIndexKey, getTitle, onSwitch } = config

  const closeFn = (windowId: string, tabIndex: number) => {
    const ps = getWinPid(windowId)
    if (!ps) return
    const d = ps.state
    const tabs = (d[tabsKey] || []) as any[]
    const newTabs = tabs.filter((_: any, i: number) => i !== tabIndex)

    if (newTabs.length === 0) {
      useWindowStore.getState().closeWindow(windowId)
      return
    }

    const currentActive = (d[activeIndexKey] as number) || 0
    const newActiveIndex = tabIndex === currentActive
      ? (tabIndex >= newTabs.length ? newTabs.length - 1 : tabIndex)
      : (tabIndex < currentActive ? currentActive - 1 : currentActive)

    let newState: Record<string, any> = {
      ...d,
      [tabsKey]: newTabs,
      [activeIndexKey]: newActiveIndex,
    }
    if (onSwitch) newState = { ...newState, ...onSwitch(newTabs[newActiveIndex], newState) }

    useProcessStore.getState().setProcessState(ps.pid, () => newState)

    if (getTitle) {
      const title = getTitle(newTabs, newActiveIndex)
      if (title !== null) useWindowStore.getState().updateWindowTitle(windowId, title)
    }
  }

  const switchFn = (windowId: string, tabIndex: number) => {
    const ps = getWinPid(windowId)
    if (!ps) return
    const tabs = (ps.state[tabsKey] as any[]) || []
    const tab = tabs[tabIndex]
    if (!tab) return

    const update: Record<string, any> = { [activeIndexKey]: tabIndex }
    if (onSwitch) Object.assign(update, onSwitch(tab, ps.state))
    useProcessStore.getState().updateProcessState(ps.pid, update)

    if (getTitle) {
      const title = getTitle(tabs, tabIndex)
      if (title !== null) useWindowStore.getState().updateWindowTitle(windowId, title)
    }
  }

  const reorderFn = (windowId: string, fromIndex: number, toIndex: number) => {
    const ps = getWinPid(windowId)
    if (!ps) return
    useProcessStore.getState().setProcessState(ps.pid, (prev) => {
      const tabs = [...((prev[tabsKey] || []) as any[])]
      if (fromIndex < 0 || fromIndex >= tabs.length || toIndex < 0 || toIndex >= tabs.length) return prev
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      let activeIndex = (prev[activeIndexKey] as number) || 0
      if (activeIndex === fromIndex) {
        activeIndex = toIndex
      } else if (fromIndex < activeIndex && toIndex >= activeIndex) {
        activeIndex = activeIndex - 1
      } else if (fromIndex > activeIndex && toIndex <= activeIndex) {
        activeIndex = activeIndex + 1
      }
      const result: Record<string, any> = { ...prev, [tabsKey]: tabs, [activeIndexKey]: activeIndex }
      if (onSwitch) Object.assign(result, onSwitch(tabs[activeIndex], result))
      return result
    })

    if (getTitle) {
      const ps2 = getWinPid(windowId)
      if (ps2) {
        const tabs = (ps2.state[tabsKey] || []) as any[]
        const activeIndex = (ps2.state[activeIndexKey] as number) || 0
        const title = getTitle(tabs, activeIndex)
        if (title !== null) useWindowStore.getState().updateWindowTitle(windowId, title)
      }
    }
  }

  return { close: closeFn, switch: switchFn, reorder: reorderFn }
}
