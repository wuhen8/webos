import { startTransition } from 'react'
import { create } from 'zustand'
import { getAppConfig } from '@/config/appRegistry'
import { registerAdhocRenderer, type AppRenderer } from '@/config/componentRegistry'
import { useProcessStore } from './processStore'
import type { WindowState, OpenFileContext } from '@/types'
import { isTouchDevice } from '@/lib/env'
import { resolveMediaUrl } from '@/lib/storageApi'

interface WindowStore {
  windows: WindowState[]
  nextZIndex: number
  webviewKeys: Record<string, number>

  // Window actions
  activateWindow: (id: string) => void
  closeWindow: (id: string, force?: boolean) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, width: number, height: number) => void
  openWindow: (appId: string, options?: { forceNew?: boolean; initialCommand?: string; appDataOptions?: Record<string, unknown> }) => void
  openChildWindow: (options: {
    type: string
    title: string
    component: AppRenderer
    size: { width: number; height: number }
    position?: { x: number; y: number }
    initialState?: Record<string, unknown>
    singleton?: boolean
    appId?: string
    parentPid?: string
    parentId?: string
  }) => string
  openWebviewWindow: (url: string, title: string, appId?: string) => void
  reloadWebview: (id: string) => void
  updateAppData: (windowId: string, patch: Record<string, unknown>) => void
  updateWindowTitle: (windowId: string, title: string) => void
  createWindow: (options: {
    type: string
    title: string
    appId?: string
    size?: { width: number; height: number }
    position?: { x: number; y: number }
    appData?: Record<string, unknown>
  }) => string
  buildOpenFileContext: () => OpenFileContext
}

export const useWindowStore = create<WindowStore>((set, get) => {
  let idSeq = 0

  /** Clamp window size & position to the current viewport */
  const clampToViewport = (
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const maxW = Math.round(vw * 0.94)
    const maxH = Math.round(vh * 0.85)
    const finalSize = {
      width: Math.min(size.width, maxW),
      height: Math.min(size.height, maxH),
    }
    const finalPosition = {
      x: Math.max(0, Math.min(position.x, vw - finalSize.width)),
      y: Math.max(0, Math.min(position.y, vh - finalSize.height)),
    }
    return { size: finalSize, position: finalPosition }
  }

  // Helper to get next title with auto-numbering
  const getNextTitle = (type: string, baseName: string, currentWindows: WindowState[]) => {
    const typeWindows = currentWindows.filter(w => w.type === type)
    if (typeWindows.length === 0) return baseName
    const usedNumbers = new Set(typeWindows.map(w => {
      if (w.title === baseName) return 1
      const match = w.title.match(new RegExp(`^${baseName} (\\d+)$`))
      return match ? parseInt(match[1]) : 0
    }))
    let num = 2
    while (usedNumbers.has(num)) num++
    return `${baseName} ${num}`
  }

  return {
    windows: [],
    nextZIndex: 100,
    webviewKeys: {},

    activateWindow: (id) => {
      set((state) => {
        const target = state.windows.find(w => w.id === id)
        if (target?.isActive && !target?.isMinimized) return state
        // 收集子窗口 ID，恢复时一起取消最小化
        const childIds = new Set(state.windows.filter(w => w.parentId === id).map(w => w.id))
        const newZIndex = state.nextZIndex + 1
        return {
          nextZIndex: newZIndex,
          windows: state.windows.map(w => {
            if (w.id === id) {
              return { ...w, isActive: true, zIndex: newZIndex, isMinimized: false }
            }
            if (childIds.has(w.id)) {
              return { ...w, isMinimized: false }
            }
            return { ...w, isActive: false }
          }),
        }
      })
    },

    closeWindow: (id, force) => {
      const state = get()
      const win = state.windows.find(w => w.id === id)
      if (!win) return

      // 先关闭所有子窗口
      const children = state.windows.filter(w => w.parentId === id)
      for (const child of children) {
        get().closeWindow(child.id, true)
      }

      const processStore = useProcessStore.getState()
      const process = processStore.getProcess(win.pid)

      // backgroundable 应用：关闭 = 隐藏（最小化），保留组件状态
      // force = true 时强制销毁（如 dock 退出）
      if (!force && process) {
        const config = getAppConfig(process.appId)
        if (config.backgroundable) {
          // 子窗口也跟随最小化
          const childIds = new Set(get().windows.filter(w => w.parentId === id).map(w => w.id))
          set((s) => ({
            windows: s.windows.map(w =>
              w.id === id || childIds.has(w.id) ? { ...w, isMinimized: true, isActive: false } : w
            ),
          }))
          return
        }
      }

      // 非 backgroundable：销毁窗口
      set((s) => ({ windows: s.windows.filter(w => w.id !== id) }))

      if (process) {
        processStore.removeWindowFromProcess(win.pid, id)

        const updatedProcess = useProcessStore.getState().getProcess(win.pid)
        const remainingWindows = updatedProcess ? updatedProcess.windowIds.length : 0

        if (remainingWindows === 0) {
          processStore.killProcess(win.pid)
        }
      }
    },

    minimizeWindow: (id) => {
      set((state) => {
        // 收集所有子窗口 ID
        const childIds = new Set(state.windows.filter(w => w.parentId === id).map(w => w.id))
        return {
          windows: state.windows.map(w =>
            w.id === id || childIds.has(w.id) ? { ...w, isMinimized: true, isActive: false } : w
          ),
        }
      })
    },

    maximizeWindow: (id) => {
      set((state) => ({
        windows: state.windows.map(w => {
          if (w.id !== id) return w
          if (w.isMaximized) {
            // Restore from saved state
            const pre = w.preMaximize
            return {
              ...w,
              isMaximized: false,
              position: pre ? { x: pre.x, y: pre.y } : w.position,
              size: pre ? { width: pre.width, height: pre.height } : w.size,
              preMaximize: undefined,
            }
          }
          // Save current state and maximize
          return {
            ...w,
            isMaximized: true,
            preMaximize: {
              x: w.position.x,
              y: w.position.y,
              width: w.size.width,
              height: w.size.height,
            },
          }
        }),
      }))
    },

    moveWindow: (id, x, y) => {
      set((state) => ({
        windows: state.windows.map(w =>
          w.id === id ? { ...w, position: { x, y } } : w
        ),
      }))
    },

    resizeWindow: (id, width, height) => {
      set((state) => ({
        windows: state.windows.map(w =>
          w.id === id ? { ...w, size: { width, height } } : w
        ),
      }))
    },

    openWindow: (appId, options) => {
      const state = get()
      const config = getAppConfig(appId)
      const forceNew = options?.forceNew ?? false
      const processStore = useProcessStore.getState()

      // Check for existing process
      const existingProcesses = processStore.getProcessesByApp(appId)

      if (config.singleton && !forceNew) {
        if (existingProcesses.length > 0) {
          const proc = existingProcesses[0]
          // If process has windows, activate the top one
          const procWindows = state.windows.filter(w => proc.windowIds.includes(w.id))
          if (procWindows.length > 0) {
            const sorted = [...procWindows].sort((a, b) => b.zIndex - a.zIndex)
            get().activateWindow(sorted[0].id)
            return
          }
          // Process exists but no windows (backgroundable) — create window for it
          const winType = config.windowType || appId
          const windowId = `${appId}-${Date.now()}-${++idSeq}`
          const newZIndex = state.nextZIndex + 1
          const pos = config.defaultPosition || { xOffset: 80, yOffset: 80 }
          const rawPos = {
            x: pos.xOffset + state.windows.length * 20,
            y: pos.yOffset + state.windows.length * 20,
          }
          const clamped = clampToViewport(config.defaultSize, rawPos)
          const newWindow: WindowState = {
            id: windowId,
            type: winType,
            pid: proc.pid,
            ...(winType !== appId && { appId }),
            title: config.name,
            isMinimized: false,
            isMaximized: isTouchDevice(),
            isActive: true,
            zIndex: newZIndex,
            position: clamped.position,
            size: clamped.size,
          }
          processStore.addWindowToProcess(proc.pid, windowId)
          startTransition(() => {
            set({
              nextZIndex: newZIndex,
              windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
            })
          })
          return
        }
      }

      if (!forceNew && !config.singleton) {
        if (existingProcesses.length > 0) {
          // Find processes that have windows
          for (const proc of existingProcesses) {
            const procWindows = state.windows.filter(w => proc.windowIds.includes(w.id))
            if (procWindows.length > 0) {
              const sorted = [...procWindows].sort((a, b) => b.zIndex - a.zIndex)
              get().activateWindow(sorted[0].id)
              return
            }
          }
          // All processes are backgrounded — reopen window for first one
          if (existingProcesses[0]) {
            const proc = existingProcesses[0]
            const winType = config.windowType || appId
            const windowId = `${appId}-${Date.now()}-${++idSeq}`
            const newZIndex = state.nextZIndex + 1
            const pos = config.defaultPosition || { xOffset: 80, yOffset: 80 }
            const rawPos = {
              x: pos.xOffset + state.windows.length * 20,
              y: pos.yOffset + state.windows.length * 20,
            }
            const clamped = clampToViewport(config.defaultSize, rawPos)
            const newWindow: WindowState = {
              id: windowId,
              type: winType,
              pid: proc.pid,
              ...(winType !== appId && { appId }),
              title: config.name,
              isMinimized: false,
              isMaximized: isTouchDevice(),
              isActive: true,
              zIndex: newZIndex,
              position: clamped.position,
              size: clamped.size,
            }
            processStore.addWindowToProcess(proc.pid, windowId)
            startTransition(() => {
              set({
                nextZIndex: newZIndex,
                windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
              })
            })
            return
          }
        }
      }

      // Spawn new process + create window
      const initialState = config.defaultAppData?.({ initialCommand: options?.initialCommand, ...options?.appDataOptions }) || {}
      const pid = processStore.spawnProcess(appId, initialState)

      const title = config.autoNumber
        ? getNextTitle(appId, config.name, state.windows)
        : config.name

      const pos = config.defaultPosition || { xOffset: 80, yOffset: 80 }
      const winType = config.windowType || appId
      const windowId = `${appId}-${Date.now()}-${++idSeq}`
      const newZIndex = state.nextZIndex + 1
      const rawPos = {
        x: pos.xOffset + state.windows.length * 20,
        y: pos.yOffset + state.windows.length * 20,
      }
      const clamped = clampToViewport(config.defaultSize, rawPos)
      const newWindow: WindowState = {
        id: windowId,
        type: winType,
        pid,
        ...(winType !== appId && { appId }),
        title,
        isMinimized: false,
        isMaximized: isTouchDevice(),
        isActive: true,
        zIndex: newZIndex,
        position: clamped.position,
        size: clamped.size,
      }

      processStore.addWindowToProcess(pid, windowId)

      startTransition(() => {
        set({
          nextZIndex: newZIndex,
          windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
        })
      })
    },

    openChildWindow: (options) => {
      const { type, title, component, size, position, initialState, singleton, appId, parentPid, parentId } = options
      const state = get()
      const processStore = useProcessStore.getState()

      // Singleton: activate existing window of same type
      if (singleton) {
        const existing = state.windows.find(w => w.type === type)
        if (existing) {
          get().activateWindow(existing.id)
          return existing.id
        }
      }

      // Register the ad-hoc renderer
      registerAdhocRenderer(type, component)

      // Attach to parent process if provided, otherwise spawn a new one
      const pid = parentPid || processStore.spawnProcess(appId || type, initialState || {})

      // Create window
      const windowId = `${type}-${Date.now()}-${++idSeq}`
      const newZIndex = state.nextZIndex + 1

      // Constrain child window to viewport
      const rawPosition = position || {
        x: 200 + Math.round(Math.random() * 40),
        y: 150 + Math.round(Math.random() * 40),
      }
      const clamped = clampToViewport(size, rawPosition)

      const newWindow: WindowState = {
        id: windowId,
        type,
        pid,
        title,
        ...(appId && { appId }),
        ...(parentId && { parentId }),
        isMinimized: false,
        isMaximized: false,
        isActive: true,
        zIndex: newZIndex,
        position: clamped.position,
        size: clamped.size,
      }

      processStore.addWindowToProcess(pid, windowId)

      startTransition(() => {
        set({
          nextZIndex: newZIndex,
          windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
        })
      })

      return windowId
    },

    openWebviewWindow: (url, title, appId) => {
      const state = get()
      const processStore = useProcessStore.getState()
      const appConfig = appId ? getAppConfig(appId) : null
      const pos = appConfig?.defaultPosition || { xOffset: 80, yOffset: 60 }
      const rawSize = appConfig?.defaultSize || { width: 1024, height: 700 }

      const pid = processStore.spawnProcess(appId || 'webview', { src: url })

      const windowId = `webview-${Date.now()}-${++idSeq}`
      const newZIndex = state.nextZIndex + 1
      const rawPos = {
        x: pos.xOffset + state.windows.length * 20,
        y: pos.yOffset + state.windows.length * 20,
      }
      const clamped = clampToViewport(rawSize, rawPos)
      const newWindow: WindowState = {
        id: windowId,
        type: 'webview',
        pid,
        appId,
        title,
        isMinimized: false,
        isMaximized: isTouchDevice(),
        isActive: true,
        zIndex: newZIndex,
        position: clamped.position,
        size: clamped.size,
      }

      processStore.addWindowToProcess(pid, windowId)

      startTransition(() => {
        set({
          nextZIndex: newZIndex,
          windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
        })
      })
    },

    reloadWebview: (id) => {
      set((state) => ({
        webviewKeys: { ...state.webviewKeys, [id]: (state.webviewKeys[id] ?? 0) + 1 },
      }))
    },

    updateAppData: (windowId, patch) => {
      // Bridge: find the process via window's pid and update process state
      const win = get().windows.find(w => w.id === windowId)
      if (!win) return
      useProcessStore.getState().updateProcessState(win.pid, patch)
    },

    updateWindowTitle: (windowId, title) => {
      set((state) => ({
        windows: state.windows.map(w =>
          w.id === windowId ? { ...w, title } : w
        ),
      }))
    },

    createWindow: (options) => {
      const { type, title, appId, size, position, appData } = options
      const state = get()
      const processStore = useProcessStore.getState()

      const resolvedAppId = appId || type
      const config = getAppConfig(resolvedAppId)
      const pid = processStore.spawnProcess(resolvedAppId, appData || {})
      const windowId = `${type}-${Date.now()}-${++idSeq}`
      const newZIndex = state.nextZIndex + 1

      const pos = position
        || (config.defaultPosition
          ? { x: config.defaultPosition.xOffset + state.windows.length * 20, y: config.defaultPosition.yOffset + state.windows.length * 20 }
          : { x: 80 + state.windows.length * 20, y: 80 + state.windows.length * 20 })

      const rawSize = size || config.defaultSize || { width: 800, height: 600 }
      const clamped = clampToViewport(rawSize, pos)

      const newWindow: WindowState = {
        id: windowId,
        type,
        pid,
        ...(appId && appId !== type && { appId }),
        title,
        isMinimized: false,
        isMaximized: isTouchDevice(),
        isActive: true,
        zIndex: newZIndex,
        position: clamped.position,
        size: clamped.size,
      }

      processStore.addWindowToProcess(pid, windowId)

      startTransition(() => {
        set({
          nextZIndex: newZIndex,
          windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow],
        })
      })

      return windowId
    },

    buildOpenFileContext: (): OpenFileContext => {
      const store = get()
      const processStore = useProcessStore.getState()

      const findWindow: OpenFileContext['findWindow'] = (predicate) => {
        const ws = useWindowStore.getState()
        const ps = useProcessStore.getState()
        for (const w of ws.windows) {
          const proc = ps.getProcess(w.pid)
          const enriched = { ...w, appData: proc?.state }
          if (predicate(enriched)) return enriched
        }
        return undefined
      }

      return {
        createWindow: (opts) => useWindowStore.getState().createWindow(opts),

        activateWindow: (id) => useWindowStore.getState().activateWindow(id),

        updateWindowTitle: (id, title) => useWindowStore.getState().updateWindowTitle(id, title),

        findWindow,

        getAppData: (windowId) => {
          const win = useWindowStore.getState().windows.find(w => w.id === windowId)
          if (!win) return {}
          const proc = useProcessStore.getState().getProcess(win.pid)
          return proc?.state || {}
        },

        findProcess: (predicate) => {
          const ps = useProcessStore.getState()
          for (const p of ps.processes) {
            if (predicate({ pid: p.pid, appId: p.appId, state: p.state })) return { pid: p.pid, appId: p.appId, state: p.state }
          }
          return undefined
        },

        updateAppData: (windowId, patch) => {
          const win = useWindowStore.getState().windows.find(w => w.id === windowId)
          if (!win) return
          useProcessStore.getState().updateProcessState(win.pid, patch)
        },

        setAppData: (windowId, updater) => {
          const win = useWindowStore.getState().windows.find(w => w.id === windowId)
          if (!win) return
          useProcessStore.getState().setProcessState(win.pid, updater)
        },

        updateProcessState: (pid, patch) => {
          useProcessStore.getState().updateProcessState(pid, patch)
        },

        setProcessState: (pid, updater) => {
          useProcessStore.getState().setProcessState(pid, updater)
        },

        restoreProcessWindow: (appId) => {
          useWindowStore.getState().openWindow(appId)
        },

        resolveMediaUrl,
      }
    },
  }
})
