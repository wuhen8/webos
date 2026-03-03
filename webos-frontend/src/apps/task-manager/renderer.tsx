import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const TaskManagerContent = lazyLoad(() => import('./TaskManagerContent'))

export const renderer: AppRenderer = () => (
  <TaskManagerContent />
)
