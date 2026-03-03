import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const SettingsContent = lazyLoad(() => import('./SettingsContent'))

export const renderer: AppRenderer = () => (
  <SettingsContent />
)
