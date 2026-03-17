import { useEffect, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { useHotkeys } from "@/hooks/useHotkeys"
import { useKeyboardDispatcher } from "@/hooks/useKeyboardDispatcher"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { renderAppContent } from "@/config/componentRegistry"
import { loadAppOverrides, syncInstalledApps } from "@/config/appRegistry"
import { dispatchMenuAction } from "@/config/actionRegistry"
import { desktopContextMenu } from "@/config/contextMenus"
import ContextMenuRenderer from "@/components/ContextMenuRenderer"
import { ProgressDialog } from "@/components/ProgressDialog"

import '@/lib/services'  // Register all service message handlers before WS connects
import { initGlobalSync, destroyGlobalSync } from '@/lib/dataSync'

import Window from "@/components/Window"
import TopMenuBar from "@/components/TopMenuBar"
import Dock from "@/components/Dock"
import LoginScreen from "@/components/LoginScreen"
import SpotlightSearch from "@/components/SpotlightSearch"
import Launchpad from "@/components/Launchpad"
import type { ContextMenuItemConfig } from "@/types"

import { useAuthStore, useSettingsStore, useUIStore, useWindowStore, useWebSocketStore } from "@/stores"
import { useProgressDialogStore } from "@/stores/progressDialogStore"
import GlobalMusicPlayer from "@/apps/music-player/GlobalMusicPlayer"
import { UnifiedDesktop } from "@/components/desktop/UnifiedDesktop"

function App() {
  const authPhase = useAuthStore((s) => s.authPhase)

  const wsConnect = useWebSocketStore((s) => s.connect)
  const wsDisconnect = useWebSocketStore((s) => s.disconnect)
  const wsConnected = useWebSocketStore((s) => s.connected)

  const wallpaperUrl = useSettingsStore((s) => s.wallpaperUrl)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  const globalMenu = useUIStore((s) => s.globalMenu)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const incrementClearSelection = useUIStore((s) => s.incrementClearSelection)
  const confirmDialog = useUIStore((s) => s.confirmDialog)
  const closeConfirm = useUIStore((s) => s.closeConfirm)
  const spotlightOpen = useUIStore((s) => s.spotlightOpen)
  const setSpotlightOpen = useUIStore((s) => s.setSpotlightOpen)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)
  const setLaunchpadOpen = useUIStore((s) => s.setLaunchpadOpen)

  const progressDialogState = useProgressDialogStore((s) => s.state)

  const windows = useWindowStore((s) => s.windows)
  const openWebviewWindow = useWindowStore((s) => s.openWebviewWindow)

  const menuRef = useRef<HTMLDivElement>(null)

  // Central keyboard dispatcher — single document listener for all shortcuts
  useKeyboardDispatcher()

  // System-level hotkeys (Layer 1) — registered into the dispatcher
  useHotkeys()

  // Load settings once WebSocket is connected (or from localStorage immediately)
  useEffect(() => {
    loadSettings()
  }, [loadSettings, wsConnected])

  // Load app overrides when authenticated and WebSocket is connected
  useEffect(() => {
    if (authPhase === 'authenticated' && wsConnected) {
      loadAppOverrides()
      syncInstalledApps()
    }
  }, [authPhase, wsConnected])

  // WebSocket lifecycle: connect when checking or authenticated, disconnect when unauthenticated
  useEffect(() => {
    if (authPhase === 'unauthenticated') {
      wsDisconnect()
    } else {
      wsConnect()
    }
  }, [authPhase, wsConnect, wsDisconnect])

  // Initialize global data synchronization when WebSocket is connected
  // 只订阅全局性的频道（存储节点、侧边栏配置）
  // 其他频道由各个组件按需订阅
  useEffect(() => {
    if (wsConnected) {
      initGlobalSync()
    } else {
      destroyGlobalSync()
    }
  }, [wsConnected])

  // Global menu position correction
  useEffect(() => {
    if (!globalMenu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 8
    const maxLeft = window.innerWidth - rect.width - padding
    const maxTop = window.innerHeight - rect.height - padding
    const newX = Math.max(padding, Math.min(globalMenu.x, Math.max(padding, maxLeft)))
    const newY = Math.max(padding, Math.min(globalMenu.y, Math.max(padding, maxTop)))
    if (newX !== globalMenu.x || newY !== globalMenu.y) {
      openGlobalMenu({ ...globalMenu, x: newX, y: newY })
    }
  }, [globalMenu, openGlobalMenu])

  // Desktop context menu action handler
  const handleDesktopActionWithItem = (action: string, menuItem?: ContextMenuItemConfig) => {
    closeGlobalMenu()
    if (action === 'desktop.openWebview' && menuItem?.url) {
      openWebviewWindow(menuItem.url, menuItem.label || 'Webview')
    } else if (action === 'desktop.addWidget') {
      // 通过自定义事件通知 WidgetLayer 添加小组件
      const widgetType = menuItem?.id?.replace('widget.', '')
      if (widgetType) {
        window.dispatchEvent(new CustomEvent('widget:add', { detail: { type: widgetType } }))
      }
    } else {
      dispatchMenuAction(action)
    }
  }

  // 动态替换右键菜单标签
  const getDesktopContextMenu = () => {
    return desktopContextMenu
  }

  const isLocked = authPhase !== 'authenticated'

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 锁屏层 — 独立于桌面内容，不受 pointer-events-none 影响 */}
      {isLocked && <LoginScreen />}

      {/* 桌面内容层 — 锁屏时整体禁用交互 */}
      <div
        className={`absolute inset-0 ${isLocked ? 'pointer-events-none' : ''}`}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement
          const inWindow = target.closest('.window-container')
          const inContextMenu = target.closest('.context-menu-overlay')
          if (!inWindow && !inContextMenu) {
            e.preventDefault()
            openGlobalMenu({
              x: e.clientX,
              y: e.clientY,
              config: getDesktopContextMenu(),
              context: {},
              onAction: handleDesktopActionWithItem,
            })
          }
        }}
        onClick={(e) => {
          if (globalMenu) closeGlobalMenu()
          const target = e.target as HTMLElement
          const inWindow = target.closest('.window-container')
          const inContextMenu = target.closest('.context-menu-overlay')
          if (!inWindow && !inContextMenu) {
            incrementClearSelection()
          }
        }}
      >
        {/* 背景层 */}
        {wallpaperUrl?.startsWith('gradient:') ? (
          <div className={`absolute inset-0 bg-gradient-to-br ${wallpaperUrl.replace('gradient:', '')}`} />
        ) : wallpaperUrl ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${wallpaperUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-200" />
        )}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-20"></div>

        {/* 统一桌面层 — 包含文件图标和小组件，z-[5] */}
        <UnifiedDesktop />

        {/* 窗口容器 — z-[20] 在桌面之上，菜单栏/Dock 之下 */}
        <div className="absolute inset-0 z-[20] overflow-hidden pointer-events-none">
          <AnimatePresence>
            {windows.map((win) => (
              <Window key={win.id} window={win}>
                {renderAppContent({ win })}
              </Window>
            ))}
          </AnimatePresence>
        </div>

        {/* 全局音乐播放 — 不依赖窗口生命周期 */}
        <GlobalMusicPlayer />

        {/* Dock 栏 */}
        <Dock />

        {/* macOS 风格顶部菜单栏 */}
        <TopMenuBar />

        {globalMenu && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-transparent context-menu-overlay"
              onClick={() => closeGlobalMenu()}
              onContextMenu={(e) => {
                e.preventDefault()
                closeGlobalMenu()
              }}
            />
            <div
              ref={menuRef}
              className="fixed z-[9999] min-w-[13.75rem] animate-in fade-in-0 zoom-in-95 duration-150"
              style={{ left: globalMenu.x, top: globalMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-white/60 backdrop-blur-2xl backdrop-saturate-150 rounded-xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-white/10 rounded-xl" />
              <div className="absolute inset-0 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.05),inset_0_0.5px_0_rgba(255,255,255,0.8)]" />
              <div className="relative py-1.5 px-1.5">
                <ContextMenuRenderer
                  config={globalMenu.config}
                  context={globalMenu.context}
                  onAction={globalMenu.onAction}
                />
              </div>
            </div>
          </>
        )}

        {/* Spotlight 搜索 */}
        <SpotlightSearch open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />

        {/* 启动台 */}
        <Launchpad open={launchpadOpen} onClose={() => setLaunchpadOpen(false)} />

        {/* 全局进度对话框 */}
        {progressDialogState && (
          <ProgressDialog
            open={progressDialogState.open}
            title={progressDialogState.title}
            message={progressDialogState.message}
            progress={progressDialogState.progress}
            cancellable={progressDialogState.cancellable}
            onCancel={progressDialogState.onCancel}
          />
        )}

        {/* 全局确认弹窗 */}
        <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && closeConfirm()}>
          <DialogContent
            showClose={false}
            showOverlay={false}
            draggable
            className="max-w-[17.5rem] p-0 border-0 gap-0"
          >
            <div className="relative px-5 pt-5 pb-4 select-none">
              <div className="flex justify-center mb-3 pointer-events-none">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] flex items-center justify-center">
                  {confirmDialog?.icon || <AlertTriangle className="h-7 w-7 text-amber-500" />}
                </div>
              </div>
              <DialogHeader className="space-y-1.5 text-center pointer-events-none">
                <DialogTitle className="text-[0.8125rem] font-semibold text-slate-900 leading-tight">
                  {confirmDialog?.title}
                </DialogTitle>
                <DialogDescription className="text-[0.6875rem] text-slate-500 leading-relaxed">
                  {confirmDialog?.description}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="relative px-4 pb-4 flex gap-2">
              <button
                onClick={() => closeConfirm()}
                className="flex-1 h-[1.625rem] rounded-md text-[0.8125rem] font-medium text-slate-700
                  bg-gradient-to-b from-white to-slate-100
                  shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_0.5px_rgba(0,0,0,0.1)]
                  hover:from-slate-50 hover:to-slate-150
                  active:from-slate-100 active:to-slate-200 active:scale-[0.98]
                  transition-all duration-150"
              >
                {confirmDialog?.cancelText || '取消'}
              </button>
              <button
                onClick={() => {
                  confirmDialog?.onConfirm()
                  closeConfirm()
                }}
                className={`flex-1 h-[1.625rem] rounded-md text-[0.8125rem] font-medium transition-all duration-150
                  ${confirmDialog?.variant === 'destructive'
                    ? 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-red-400 hover:to-red-500 active:from-red-600 active:to-red-700'
                    : 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-blue-400 hover:to-blue-500 active:from-blue-600 active:to-blue-700'
                  }
                  active:scale-[0.98]`}
              >
                {confirmDialog?.confirmText || '确认'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default App
