import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'ai-chat',
  name: 'i18n:apps.aiChat.name',
  icon: 'Bot',
  gradient: 'from-violet-400 to-purple-600',
  shadow: 'shadow-violet-500/30',
  defaultSize: { width: 520, height: 680 },
  defaultPosition: { xOffset: 200, yOffset: 60 },
  singleton: true,
  backgroundable: true,
  showInDock: true,
  dockOrder: 4,
  menus: [
    {
      label: 'i18n:apps.aiChat.menu.conversation',
      items: [
        { label: 'i18n:apps.aiChat.menu.newConversation', shortcut: '⌘N', action: 'newChat' },
      ],
    },
  ],
}
