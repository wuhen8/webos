import { createElement } from 'react'
import type { MenuActionHandler } from '@/types'
import { useWindowStore } from '@/stores/windowStore'
import { lazyLoad } from '@/config/lazyLoad'

const ShareManagerContent = lazyLoad(() => import('./ShareManagerContent'))

export const actions: Record<string, MenuActionHandler> = {
  newFinderWindow: () => {
    useWindowStore.getState().openWindow('fileManager', { forceNew: true })
  },
  manageShares: (ctx) => {
    useWindowStore.getState().openChildWindow({
      type: 'shareManager',
      title: '分享管理',
      component: (renderCtx) => createElement(ShareManagerContent, { windowId: renderCtx.win.id }),
      size: { width: 700, height: 500 },
      singleton: true,
      appId: 'fileManager',
      parentPid: ctx.pid,
      parentId: ctx.windowId,
    })
  },
}
