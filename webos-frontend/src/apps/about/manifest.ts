import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'about',
  name: '关于本机',
  icon: 'Monitor',
  gradient: 'from-cyan-400 to-cyan-600',
  shadow: 'shadow-cyan-500/30',
  defaultSize: { width: 420, height: 300 },
  defaultPosition: { xOffset: 120, yOffset: 120 },
  singleton: true,
  showInDock: false,
  dockOrder: 99,
  menus: [],
}
