import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const DockerContent = lazyLoad(() => import('./DockerContent'))

export const renderer: AppRenderer = () => (
  <DockerContent />
)
