import { createElement } from 'react'
import type { MenuActionHandler } from '@/types'
import { useWindowStore } from '@/stores'
import { useTerminalStore } from './store'
import SnippetManager from './SnippetManager'

export const actions: Record<string, MenuActionHandler> = {
  newTerminal: () => {
    useWindowStore.getState().openWindow('terminal', { forceNew: true })
  },
  newTerminalTab: (ctx) => {
    if (ctx.windowId) {
      useTerminalStore.getState().addTerminalTab(ctx.windowId)
    }
  },
  manageSnippets: (ctx) => {
    useWindowStore.getState().openChildWindow({
      type: 'snippetManager',
      title: '管理快捷命令',
      component: () => createElement(SnippetManager),
      size: { width: 400, height: 500 },
      singleton: true,
      appId: 'terminal',
      parentPid: ctx.pid,
    })
  },
}
