import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const AppStoreContent = lazyLoad(() => import('./AppStoreContent'))

export const renderer: AppRenderer = () => (
  <AppStoreContent />
)
