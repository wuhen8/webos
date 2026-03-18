import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'ai-chat',
  name: 'AI 助手',
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
      label: '对话',
      items: [
        { label: '新建对话', shortcut: '⌘N', action: 'newChat' },
      ],
    },
  ],
}
