import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const EditorContent = lazyLoad(() => import('./EditorContent'))

export const renderer: AppRenderer = (ctx) => (
  <EditorContent win={ctx.win} />
)
