import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'
import { useWindowStore } from '@/stores'

const WebviewContent = lazyLoad(() => import('./WebviewContent'))

export const renderer: AppRenderer = (ctx) => {
  const webviewKeys = useWindowStore.getState().webviewKeys
  const d = (ctx.process?.state || {}) as Record<string, any>
  return (
    <WebviewContent src={(d.src as string) || ''} reloadKey={webviewKeys[ctx.win.id] ?? 0} />
  )
}
