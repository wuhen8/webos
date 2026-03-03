import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const FileManagerContent = lazyLoad(() => import('./FileManagerContent'))

export const renderer: AppRenderer = (ctx) => (
  <FileManagerContent windowId={ctx.win.id} />
)
