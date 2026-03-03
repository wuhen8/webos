import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const ImageViewer = lazyLoad(() => import('./ImageViewer'))

export const renderer: AppRenderer = (ctx) => (
  <ImageViewer
    windowId={ctx.win.id}
  />
)
