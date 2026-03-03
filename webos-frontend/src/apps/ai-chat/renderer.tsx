import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const ChatContent = lazyLoad(() => import('./ChatContent'))

export const renderer: AppRenderer = () => (
  <ChatContent />
)
