import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const TerminalContent = lazyLoad(() => import('./TerminalContent'))

export const renderer: AppRenderer = (ctx) => (
  <TerminalContent windowId={ctx.win.id} isActive={ctx.win.isActive} />
)
