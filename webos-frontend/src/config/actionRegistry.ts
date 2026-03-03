import type { MenuActionHandler, MenuActionContext } from '@/types'
import { useWindowStore } from '@/stores'
import { useAuthStore } from '@/stores'
import { useUIStore } from '@/stores'
import { useEditorStore } from '@/apps/editor/store'
import { exec } from '@/lib/services'

// ── 自动收集所有 apps/*/actions.ts ──
const actionModules = import.meta.glob('../apps/*/actions.ts', { eager: true })

const actionRegistry: Record<string, MenuActionHandler> = {}

for (const [path, mod] of Object.entries(actionModules)) {
  const { actions } = mod as { actions: Record<string, MenuActionHandler> }
  if (actions) {
    for (const [name, handler] of Object.entries(actions)) {
      actionRegistry[name] = handler
    }
  }
}

// ── 内置全局 actions（不属于任何应用） ──
const builtinActions: Record<string, MenuActionHandler> = {
  minimize: (ctx) => {
    if (ctx.windowId) useWindowStore.getState().minimizeWindow(ctx.windowId)
  },
  zoom: (ctx) => {
    if (ctx.windowId) useWindowStore.getState().maximizeWindow(ctx.windowId)
  },
  'desktop.openFileManager': () => {
    useWindowStore.getState().openWindow('fileManager', { forceNew: true })
  },
  'desktop.openEditor': () => {
    const { windows, activateWindow } = useWindowStore.getState()
    const { openNewEditor } = useEditorStore.getState()
    const editorWin = windows.find(w => w.type === 'editor')
    if (editorWin) {
      activateWindow(editorWin.id)
    } else {
      openNewEditor()
    }
  },
  'desktop.logout': () => {
    useAuthStore.getState().logout()
  },
  'system.shutdown': () => {
    useUIStore.getState().showConfirm({
      title: '确定要关机吗？',
      description: '系统将立即关机，所有未保存的工作将丢失。',
      confirmText: '关机',
      variant: 'destructive',
      onConfirm: () => {
        exec('shutdown -h now')
      },
    })
  },
  'system.restart': () => {
    useUIStore.getState().showConfirm({
      title: '确定要重新启动吗？',
      description: '系统将立即重启，所有未保存的工作将丢失。',
      confirmText: '重新启动',
      variant: 'destructive',
      onConfirm: () => {
        exec('reboot')
      },
    })
  },
}

// 合并：内置 actions 优先级低于应用注册的 actions
for (const [name, handler] of Object.entries(builtinActions)) {
  if (!actionRegistry[name]) {
    actionRegistry[name] = handler
  }
}

// ── 调度入口 ──
export function dispatchMenuAction(action: string) {
  const { windows } = useWindowStore.getState()
  const activeWindow = windows.find(w => w.isActive)

  const ctx: MenuActionContext = {
    windowId: activeWindow?.id,
    windowType: activeWindow?.type,
    pid: activeWindow?.pid,
  }

  const handler = actionRegistry[action]
  if (handler) {
    handler(ctx)
  } else {
    console.warn(`[actionRegistry] No handler for action: "${action}"`)
  }
}
