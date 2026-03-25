import i18n from '@/i18n'
import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'webview',
  name: 'i18n:apps.webview.name',
  icon: 'Globe',
  gradient: 'from-teal-400 to-teal-600',
  shadow: 'shadow-teal-500/30',
  defaultSize: { width: 900, height: 600 },
  defaultPosition: { xOffset: 100, yOffset: 80 },
  singleton: false,
  showInDock: false,
  dockOrder: 99,
  menus: [],
  fileAssociations: [
    {
      extensions: ['.html', '.htm'],
      label: i18n.t('apps.webview.fileAssociation'),
      icon: 'Globe',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    try {
      const src = await ctx.resolveMediaUrl(nodeId, file.path)
      ctx.createWindow({
        type: 'webview',
        title: file.name,
        appData: { src },
      })
      return { ok: true }
    } catch {
      return { ok: false, message: i18n.t('apps.webview.loadFailed') }
    }
  },
  defaultAppData: (options) => {
    return { src: (options?.src as string) || '' }
  },
}
