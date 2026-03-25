import { createElement } from 'react'
import i18n from '@/i18n'
import type { MenuActionHandler } from '@/types'
import { useWindowStore } from '@/stores/windowStore'
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
      title: i18n.t('apps.terminal.snippets.title'),
      component: () => createElement(SnippetManager),
      size: { width: 400, height: 500 },
      singleton: true,
      appId: 'terminal',
      parentPid: ctx.pid,
      parentId: ctx.windowId,
    })
  },
}
