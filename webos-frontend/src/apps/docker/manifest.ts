import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'docker',
  name: 'i18n:apps.docker.name',
  icon: 'Container',
  gradient: 'from-sky-400 to-blue-600',
  shadow: 'shadow-sky-500/30',
  defaultSize: { width: 1000, height: 660 },
  defaultPosition: { xOffset: 90, yOffset: 70 },
  singleton: true,
  showInDock: false,
  dockOrder: 50,
  menus: [],
}
