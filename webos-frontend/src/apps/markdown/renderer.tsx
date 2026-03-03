import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const MarkdownViewer = lazyLoad(() => import('./MarkdownViewer'))

export const renderer: AppRenderer = (ctx) => (
  <MarkdownViewer windowId={ctx.win.id} />
)
