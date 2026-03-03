import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const MusicPlayerContent = lazyLoad(() => import('./MusicPlayerContent'))

export const renderer: AppRenderer = (ctx) => (
  <MusicPlayerContent windowId={ctx.win.id} />
)
