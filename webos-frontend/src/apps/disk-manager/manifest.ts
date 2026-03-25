import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'diskManager',
  name: 'i18n:apps.diskManager.name',
  icon: 'HardDrive',
  gradient: 'from-emerald-400 to-emerald-600',
  shadow: 'shadow-emerald-500/30',
  defaultSize: { width: 1000, height: 680 },
  defaultPosition: { xOffset: 60, yOffset: 40 },
  singleton: true,
  showInDock: false,
  dockOrder: 50,
  menus: [],
}
