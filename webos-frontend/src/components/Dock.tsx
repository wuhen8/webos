import { useState, useRef, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { getDockItems, getAppConfig, getAllApps, resolveIcon, saveAppOverride } from "@/config/appRegistry"
import { dockItemContextMenu, githubDockContextMenu } from "@/config/contextMenus"
import { useWindowStore, useProcessStore, useSettingsStore, useUIStore } from "@/stores"
import { useEditorStore } from "@/apps/editor/store"
import { isTouchDevice } from "@/lib/env"
import { Rocket, Github } from "lucide-react"
import type { ContextMenuConfig } from "@/types"

function Dock() {
  const { t } = useTranslation()
  const windows = useWindowStore((s) => s.windows)
  const processes = useProcessStore((s) => s.processes)
  const activateWindow = useWindowStore((s) => s.activateWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const openWindow = useWindowStore((s) => s.openWindow)
  const openNewEditor = useEditorStore((s) => s.openNewEditor)
  const openWebviewWindow = useWindowStore((s) => s.openWebviewWindow)
  const dockSize = useSettingsStore((s) => s.dockSize)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const setLaunchpadOpen = useUIStore((s) => s.setLaunchpadOpen)
  const killProcess = useProcessStore((s) => s.killProcess)

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  // Force re-render after dock changes
  const [, setTick] = useState(0)
  const dockRef = useRef<HTMLDivElement>(null)

  const iconSize = Math.max(24, Math.round(dockSize * 0.5))

  const getScale = (index: number) => {
    if (hoveredIndex === null) return 1
    const distance = Math.abs(index - hoveredIndex)
    if (distance === 0) return 1.4
    if (distance === 1) return 1.2
    if (distance === 2) return 1.08
    return 1
  }

  const getTranslateY = (index: number) => {
    if (hoveredIndex === null) return '0'
    const distance = Math.abs(index - hoveredIndex)
    if (distance === 0) return '-0.875rem'
    if (distance === 1) return '-0.375rem'
    if (distance === 2) return '-0.125rem'
    return '0'
  }

  const getZIndex = (index: number) => {
    if (hoveredIndex === null) return 1
    const distance = Math.abs(index - hoveredIndex)
    if (distance === 0) return 50
    if (distance === 1) return 40
    if (distance === 2) return 30
    return 1
  }

  const dockApps = getDockItems()

  // ==================== Dock item click handler ====================
  const handleDockItemClick = useCallback((appId: string) => {
    // Reset magnification on click (fixes touch devices where onMouseLeave doesn't fire)
    if (isTouchDevice()) setHoveredIndex(null)
    const appWindows = windows.filter(w => w.type === appId || w.appId === appId)
    if (appWindows.length > 0) {
      // 优先激活主窗口（非子窗口），避免激活到子窗口
      const mainWindows = appWindows.filter(w => !w.parentId)
      const candidates = mainWindows.length > 0 ? mainWindows : appWindows
      const sorted = [...candidates].sort((a, b) => b.zIndex - a.zIndex)
      activateWindow(sorted[0].id)
    } else {
      // Check for background processes (no windows)
      const appProcesses = processes.filter(p => p.appId === appId)
      if (appProcesses.length > 0) {
        // Reopen window for background process
        openWindow(appId)
      } else if (appId === 'editor') {
        openNewEditor()
      } else {
        const config = getAppConfig(appId)
        if (config.url) {
          openWebviewWindow(config.url, config.name, appId)
        } else {
          openWindow(appId)
        }
      }
    }
  }, [windows, processes, activateWindow, openNewEditor, openWebviewWindow, openWindow])

  // ==================== Drag and Drop ====================
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    // Make drag image semi-transparent
    const target = e.currentTarget as HTMLElement
    requestAnimationFrame(() => target.style.opacity = '0.4')
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index)
    }
  }, [dragIndex])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    target.style.opacity = '1'
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragIndex
    setDragIndex(null)
    setDropIndex(null)

    if (fromIndex === null || fromIndex === toIndex) return

    // Reorder: compute new dockOrder values and persist
    const items = [...dockApps]
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)

    // Assign new dockOrder values (10, 20, 30, ...)
    const promises = items.map((app, i) => {
      const newOrder = (i + 1) * 10
      if (app.dockOrder !== newOrder) {
        return saveAppOverride(app.id, { dockOrder: newOrder })
      }
      return Promise.resolve()
    })

    await Promise.all(promises)
    setTick(t => t + 1) // force re-render
  }, [dragIndex, dockApps])

  // ==================== Context Menu ====================
  const handleDockItemContextMenu = useCallback((e: React.MouseEvent, appId: string) => {
    e.preventDefault()
    e.stopPropagation()

    const config = getAppConfig(appId)
    const appWindows = windows.filter(w => w.type === appId || w.appId === appId)
    const appProcesses = processes.filter(p => p.appId === appId)
    const isRunning = appProcesses.length > 0

    // Build dynamic menu: hide "new window" for singleton, hide "quit" if not running
    const filteredItems = dockItemContextMenu.items.filter(item => {
      if (item.id === 'dock-new-window' && config.singleton) return false
      if (item.id === 'dock-quit' && !isRunning) return false
      // Hide divider before quit if quit is hidden
      if (item.id === 'dock-divider-1' && !isRunning && config.singleton) return false
      return true
    })

    const menuConfig: ContextMenuConfig = {
      id: 'dock-item',
      items: filteredItems,
    }

    openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: menuConfig,
      context: {},
      onAction: (action: string) => {
        closeGlobalMenu()
        switch (action) {
          case 'dock.newWindow': {
            if (appId === 'editor') {
              openNewEditor()
            } else if (config.url) {
              openWebviewWindow(config.url, config.name, appId)
            } else {
              openWindow(appId, { forceNew: true })
            }
            break
          }
          case 'dock.removeFromDock': {
            saveAppOverride(appId, { showInDock: false }).then(() => setTick(t => t + 1))
            break
          }
          case 'dock.quit': {
            // Close all windows and kill all processes for this app
            appWindows.forEach(w => closeWindow(w.id, true))
            appProcesses.forEach(p => killProcess(p.pid))
            break
          }
        }
      },
    })
  }, [windows, processes, openGlobalMenu, closeGlobalMenu, openWindow, openNewEditor, openWebviewWindow, closeWindow, killProcess])

  // Right-click on dock blank area: show "add to dock" menu
  const handleDockBlankContextMenu = useCallback((e: React.MouseEvent) => {
    // Only trigger if clicking on the dock background, not on an icon
    const target = e.target as HTMLElement
    if (target.closest('button[data-dock-item]')) return

    e.preventDefault()
    e.stopPropagation()

    const allApps = getAllApps()
    const pinnedIds = new Set(dockApps.map(a => a.id))
    const hiddenApps = allApps.filter(a => !pinnedIds.has(a.id))

    if (hiddenApps.length === 0) return

    const menuConfig: ContextMenuConfig = {
      id: 'dock-blank',
      items: [
        {
          id: 'dock-blank-header',
          type: 'header' as const,
          label: t('dock.addToDock'),
        },
        ...hiddenApps.map(app => ({
          id: `dock-add-${app.id}`,
          label: app.name,
          icon: app.icon,
          action: `dock.addToDock.${app.id}`,
        })),
      ],
    }

    openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: menuConfig,
      context: {},
      onAction: (action: string) => {
        closeGlobalMenu()
        const match = action.match(/^dock\.addToDock\.(.+)$/)
        if (match) {
          const appId = match[1]
          // Assign dockOrder after the last pinned item
          const maxOrder = dockApps.length > 0
            ? Math.max(...dockApps.map(a => a.dockOrder))
            : 0
          saveAppOverride(appId, { showInDock: true, dockOrder: maxOrder + 10 }).then(() => setTick(t => t + 1))
        }
      },
    })
  }, [dockApps, openGlobalMenu, closeGlobalMenu])

  // ==================== Build items ====================

  // GitHub 伪应用
  const githubAppItem = {
    id: 'github',
    icon: <Github style={{ width: iconSize, height: iconSize }} className="text-white" />,
    gradient: 'from-gray-700 to-gray-900',
    shadow: 'shadow-gray-700/30',
    label: 'GitHub',
    isRunning: false,
    badge: undefined,
  }

  // Pinned items (left of separator)
  const pinnedItems = dockApps.map((app) => {
    const appProcesses = processes.filter(p => p.appId === app.id)
    const isRunning = appProcesses.length > 0
    const Icon = resolveIcon(app.icon)

    let badge: number | undefined
    if (app.id === 'editor' && appProcesses.length > 0) {
      const edProc = appProcesses[0]
      const edTabs = (edProc.state as any)?.tabs
      if (edTabs && edTabs.length > 1) {
        badge = edTabs.length
      }
    }

    return {
      id: app.id,
      icon: <Icon style={{ width: iconSize, height: iconSize }} className="text-white" />,
      gradient: app.gradient,
      shadow: app.shadow,
      label: app.name,
      isRunning,
      badge,
    }
  })

  // 所有 Dock items = pinnedItems + GitHub（放最后）
  const allDockItems = [...pinnedItems, githubAppItem]

  // Running but unpinned apps (right of separator)
  // 过滤掉子窗口，子窗口不单独出现在 Dock
  const topLevelWindows = windows.filter(w => !w.parentId)
  const pinnedIds = new Set(dockApps.map(a => a.id))
  const runningUnpinnedApps = new Map<string, typeof windows[0][]>()
  // Include apps that have processes (even without windows, for backgroundable apps)
  for (const proc of processes) {
    const appId = proc.appId
    if (!pinnedIds.has(appId) && appId !== 'webview') {
      if (!runningUnpinnedApps.has(appId)) {
        runningUnpinnedApps.set(appId, [])
      }
    }
  }
  for (const win of topLevelWindows) {
    const appId = win.appId || win.type
    if (!pinnedIds.has(appId) && appId !== 'webview') {
      if (!runningUnpinnedApps.has(appId)) {
        runningUnpinnedApps.set(appId, [])
      }
      runningUnpinnedApps.get(appId)!.push(win)
    }
  }

  const runningUnpinnedItems = Array.from(runningUnpinnedApps.entries()).map(([appId, appWindows]) => {
    const config = getAppConfig(appId)
    const Icon = resolveIcon(config.icon)
    return {
      id: appId,
      icon: <Icon style={{ width: iconSize, height: iconSize }} className="text-white" />,
      gradient: config.gradient,
      shadow: config.shadow,
      label: config.name,
      windows: appWindows,
    }
  })

  // Minimized windows (that aren't already represented)
  const representedAppIds = new Set([...pinnedIds, ...runningUnpinnedApps.keys()])
  const minimizedWindows = topLevelWindows.filter(w => w.isMinimized && !representedAppIds.has(w.appId || w.type))

  const hasSeparator = runningUnpinnedItems.length > 0 || minimizedWindows.length > 0
  const totalPinnedCount = allDockItems.length
  const totalBeforeSep = totalPinnedCount
  const totalAfterSep = runningUnpinnedItems.length + minimizedWindows.length

  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50">
      <div className="relative">
        {/* Liquid Glass 背景 */}
        <div
          className="absolute inset-0 rounded-[1.125rem]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
            backdropFilter: 'blur(50px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(50px) saturate(1.8)',
            boxShadow: [
              '0 20px 60px -15px rgba(0,0,0,0.2)',
              '0 4px 16px -4px rgba(0,0,0,0.08)',
              '0 0 0 0.5px rgba(255,255,255,0.5)',
              'inset 0 0.5px 0 rgba(255,255,255,0.9)',
              'inset 0 -0.5px 0 rgba(0,0,0,0.06)',
            ].join(', '),
            border: '0.5px solid rgba(255,255,255,0.35)',
          }}
        />

        {/* Dock 内容 */}
        <div
          ref={dockRef}
          className="relative flex items-end px-[0.375rem] overflow-visible"
          style={{ gap: '0.25rem', paddingTop: '0.375rem', paddingBottom: '0.375rem' }}
          onMouseLeave={() => setHoveredIndex(null)}
          onContextMenu={handleDockBlankContextMenu}
        >
          {/* ===== Launchpad button ===== */}
          <button
            data-dock-item
            onClick={() => { if (isTouchDevice()) setHoveredIndex(null); setLaunchpadOpen(true) }}
            onMouseEnter={() => setHoveredIndex(-1)}
            className="relative flex flex-col items-center origin-bottom"
            style={{
              transform: `scale(${hoveredIndex === -1 ? 1.4 : hoveredIndex === 0 ? 1.2 : 1}) translateY(${hoveredIndex === -1 ? '-0.875rem' : hoveredIndex === 0 ? '-0.375rem' : '0'})`,
              zIndex: hoveredIndex === -1 ? 50 : 1,
              transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            {hoveredIndex === -1 && (
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap z-[60]">
                <div
                  className="px-3 py-[0.3125rem] text-[0.75rem] text-white font-medium rounded-lg"
                  style={{
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  {t('launchpad.title')}
                </div>
                <div
                  className="absolute -bottom-[0.1875rem] left-1/2 -translate-x-1/2 w-[0.4375rem] h-[0.4375rem] rotate-45"
                  style={{ background: 'rgba(0,0,0,0.7)' }}
                />
              </div>
            )}
            <div
              className="rounded-[0.8125rem] bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-500/30"
              style={{
                width: dockSize,
                height: dockSize,
                border: '0.5px solid rgba(255,255,255,0.25)',
              }}
            >
              <Rocket style={{ width: iconSize, height: iconSize }} className="text-white" />
            </div>
          </button>

          {/* ===== Separator after Launchpad ===== */}
          <div
            className="self-center mx-[0.1875rem]"
            style={{
              width: '0.5px',
              height: dockSize * 0.6,
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.12), transparent)',
            }}
          />

          {/* ===== Pinned items (left of separator) ===== */}
          {allDockItems.map((item, index) => (
            <button
              key={item.id}
              data-dock-item
              draggable={item.id !== 'github'}
              onClick={() => {
                if (isTouchDevice()) setHoveredIndex(null)
                if (item.id === 'github') {
                  window.open('https://github.com/wuhen8/webos', '_blank')
                } else {
                  handleDockItemClick(item.id)
                }
              }}
              onContextMenu={(e) => {
                if (item.id === 'github') {
                  e.preventDefault()
                  e.stopPropagation()
                  openGlobalMenu({
                    x: e.clientX,
                    y: e.clientY,
                    config: githubDockContextMenu,
                    context: {},
                    onAction: (action: string) => {
                      closeGlobalMenu()
                      if (action === 'github.open') {
                        window.open('https://github.com/wuhen8/webos', '_blank')
                      } else if (action === 'github.copy') {
                        navigator.clipboard.writeText('https://github.com/wuhen8/webos')
                      }
                    },
                  })
                } else {
                  handleDockItemContextMenu(e, item.id)
                }
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, index)}
              className="relative flex flex-col items-center origin-bottom"
              style={{
                transform: `scale(${getScale(index)}) translateY(${getTranslateY(index)})`,
                zIndex: getZIndex(index),
                transition: dragIndex !== null ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
                opacity: dragIndex === index ? 0.4 : 1,
              }}
            >
              {/* Drop indicator */}
              {dropIndex === index && dragIndex !== null && dragIndex !== index && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-blue-400 rounded-full"
                  style={{
                    left: dragIndex > index ? -3 : undefined,
                    right: dragIndex < index ? -3 : undefined,
                  }}
                />
              )}

              {hoveredIndex === index && dragIndex === null && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap z-[60]">
                  <div
                    className="px-3 py-[0.3125rem] text-[0.75rem] text-white font-medium rounded-lg"
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      backdropFilter: 'blur(20px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="absolute -bottom-[0.1875rem] left-1/2 -translate-x-1/2 w-[0.4375rem] h-[0.4375rem] rotate-45"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  />
                </div>
              )}

              <div
                className={`rounded-[0.8125rem] bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg ${item.shadow} transition-shadow duration-200`}
                style={{
                  width: dockSize,
                  height: dockSize,
                  border: '0.5px solid rgba(255,255,255,0.25)',
                }}
              >
                {item.icon}
                {item.badge && (
                  <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 bg-red-500 rounded-full text-[0.625rem] text-white flex items-center justify-center font-semibold shadow-sm border border-red-400/50">
                    {item.badge}
                  </span>
                )}
              </div>

              {item.isRunning && (
                <div className="absolute -bottom-[0.3125rem] left-1/2 -translate-x-1/2 w-[0.25rem] h-[0.25rem] rounded-full bg-white/80" style={{ boxShadow: '0 0 3px rgba(255,255,255,0.5)' }} />
              )}
            </button>
          ))}

          {/* ===== Separator ===== */}
          {hasSeparator && (
            <div
              className="self-center mx-[0.1875rem]"
              style={{
                width: '0.5px',
                height: dockSize * 0.6,
                background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.12), transparent)',
              }}
            />
          )}

          {/* ===== Running unpinned apps (right of separator) ===== */}
          {runningUnpinnedItems.map((item, idx) => {
            const itemIndex = totalBeforeSep + idx
            return (
              <button
                key={`running-${item.id}`}
                data-dock-item
                onClick={() => {
                  if (isTouchDevice()) setHoveredIndex(null)
                  if (item.windows.length > 0) {
                    const sorted = [...item.windows].sort((a, b) => b.zIndex - a.zIndex)
                    activateWindow(sorted[0].id)
                  } else {
                    // Background process with no windows — reopen
                    openWindow(item.id)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Running unpinned: offer "Keep in Dock" and "Quit"
                  const menuConfig: ContextMenuConfig = {
                    id: 'dock-running-unpinned',
                    items: [
                      {
                        id: 'dock-keep',
                        label: t('dock.keepInDock'),
                        icon: 'Star',
                        action: 'dock.keepInDock',
                      },
                      { id: 'dock-running-divider', type: 'divider' as const },
                      {
                        id: 'dock-quit-running',
                        label: t('dock.quit'),
                        icon: 'LogOut',
                        action: 'dock.quit',
                        variant: 'danger' as const,
                      },
                    ],
                  }
                  openGlobalMenu({
                    x: e.clientX,
                    y: e.clientY,
                    config: menuConfig,
                    context: {},
                    onAction: (action: string) => {
                      closeGlobalMenu()
                      if (action === 'dock.keepInDock') {
                        const maxOrder = dockApps.length > 0
                          ? Math.max(...dockApps.map(a => a.dockOrder))
                          : 0
                        saveAppOverride(item.id, { showInDock: true, dockOrder: maxOrder + 10 }).then(() => setTick(t => t + 1))
                      } else if (action === 'dock.quit') {
                        item.windows.forEach(w => closeWindow(w.id, true))
                        // Also kill background processes
                        processes.filter(p => p.appId === item.id).forEach(p => killProcess(p.pid))
                      }
                    },
                  })
                }}
                onMouseEnter={() => setHoveredIndex(itemIndex)}
                className="relative flex flex-col items-center origin-bottom"
                style={{
                  transform: `scale(${getScale(itemIndex)}) translateY(${getTranslateY(itemIndex)})`,
                  zIndex: getZIndex(itemIndex),
                  transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
                }}
              >
                {hoveredIndex === itemIndex && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap z-[60]">
                    <div
                      className="px-3 py-[0.3125rem] text-[0.75rem] text-white font-medium rounded-lg"
                      style={{
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      className="absolute -bottom-[0.1875rem] left-1/2 -translate-x-1/2 w-[0.4375rem] h-[0.4375rem] rotate-45"
                      style={{ background: 'rgba(0,0,0,0.7)' }}
                    />
                  </div>
                )}

                <div
                  className={`rounded-[0.8125rem] bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg ${item.shadow}`}
                  style={{
                    width: dockSize,
                    height: dockSize,
                    border: '0.5px solid rgba(255,255,255,0.25)',
                  }}
                >
                  {item.icon}
                </div>
                <div className="absolute -bottom-[0.3125rem] left-1/2 -translate-x-1/2 w-[0.25rem] h-[0.25rem] rounded-full bg-white/80" style={{ boxShadow: '0 0 3px rgba(255,255,255,0.5)' }} />
              </button>
            )
          })}

          {/* ===== Minimized windows (not represented by pinned or running unpinned) ===== */}
          {minimizedWindows.map((win, idx) => {
            const itemIndex = totalBeforeSep + runningUnpinnedItems.length + idx
            const winConfig = getAppConfig(win.appId || win.type)
            const WinIcon = resolveIcon(winConfig.icon)

            return (
              <button
                key={win.id}
                data-dock-item
                onClick={() => { if (isTouchDevice()) setHoveredIndex(null); activateWindow(win.id) }}
                onMouseEnter={() => setHoveredIndex(itemIndex)}
                className="relative flex flex-col items-center origin-bottom"
                style={{
                  transform: `scale(${getScale(itemIndex)}) translateY(${getTranslateY(itemIndex)})`,
                  zIndex: getZIndex(itemIndex),
                  transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
                }}
              >
                {hoveredIndex === itemIndex && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap z-[60]">
                    <div
                      className="px-3 py-[0.3125rem] text-[0.75rem] text-white font-medium rounded-lg"
                      style={{
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                    >
                      {win.title}
                    </div>
                    <div
                      className="absolute -bottom-[0.1875rem] left-1/2 -translate-x-1/2 w-[0.4375rem] h-[0.4375rem] rotate-45"
                      style={{ background: 'rgba(0,0,0,0.7)' }}
                    />
                  </div>
                )}

                <div
                  className={`rounded-[0.8125rem] bg-gradient-to-br ${winConfig.gradient} flex items-center justify-center shadow-lg ${winConfig.shadow}`}
                  style={{
                    width: dockSize,
                    height: dockSize,
                    border: '0.5px solid rgba(255,255,255,0.25)',
                  }}
                >
                  <WinIcon style={{ width: iconSize, height: iconSize }} className="text-white" />
                </div>
                <div className="absolute -bottom-[0.3125rem] left-1/2 -translate-x-1/2 w-[0.25rem] h-[0.25rem] rounded-full bg-white/80" style={{ boxShadow: '0 0 3px rgba(255,255,255,0.5)' }} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Dock
