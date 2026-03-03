import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'appStore',
  name: '应用商店',
  icon: 'PackageOpen',
  gradient: 'from-violet-400 to-violet-600',
  shadow: 'shadow-violet-500/30',
  defaultSize: { width: 860, height: 580 },
  defaultPosition: { xOffset: 70, yOffset: 70 },
  singleton: true,
  showInDock: false,
  dockOrder: 50,
  menus: [],
}
