import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const DiskManagerContent = lazyLoad(() => import('./DiskManagerContent'))

export const renderer: AppRenderer = () => (
  <DiskManagerContent />
)
