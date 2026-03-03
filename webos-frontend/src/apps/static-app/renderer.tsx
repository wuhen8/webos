import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const StaticAppHost = lazyLoad(() => import('./StaticAppHost'))

export const renderer: AppRenderer = (ctx) => {
  const state = (ctx.process?.state || {}) as Record<string, any>
  return (
    <StaticAppHost
      appId={state.staticAppId}
      windowId={ctx.win.id}
      file={state.file}
    />
  )
}
