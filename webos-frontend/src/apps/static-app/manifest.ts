import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'static-app',
  name: 'Static App Host',
  icon: 'AppWindow',
  gradient: 'from-blue-400 to-blue-600',
  shadow: 'shadow-blue-500/30',
  defaultSize: { width: 900, height: 600 },
  singleton: false,
  showInDock: false,
  hidden: true,
  dockOrder: 999,
  menus: [],
}
