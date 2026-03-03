import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const AboutContent = lazyLoad(() => import('./AboutContent'))

export const renderer: AppRenderer = () => (
  <AboutContent />
)
