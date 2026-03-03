import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'settings',
  name: '系统设置',
  icon: 'Settings',
  gradient: 'from-slate-400 to-slate-600',
  shadow: 'shadow-slate-500/30',
  defaultSize: { width: 800, height: 560 },
  defaultPosition: { xOffset: 80, yOffset: 80 },
  singleton: true,
  showInDock: true,
  dockOrder: 3,
  menus: [],
}
