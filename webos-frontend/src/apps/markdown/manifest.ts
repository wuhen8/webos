import i18n from '@/i18n'
import { fsApi } from '@/lib/storageApi'
import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'markdown',
  name: 'i18n:apps.markdown.name',
  icon: 'BookOpen',
  gradient: 'from-slate-500 to-slate-700',
  shadow: 'shadow-slate-600/30',
  defaultSize: { width: 850, height: 650 },
  defaultPosition: { xOffset: 100, yOffset: 80 },
  singleton: false,
  showInDock: false,
  dockOrder: 99,
  menus: [],
  fileAssociations: [
    {
      extensions: ['.md', '.markdown', '.mdown', '.mkd'],
      label: 'i18n:apps.markdown.fileAssociations.markdown',
      icon: 'BookOpen',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    try {
      const data = await fsApi.read(nodeId, file.path)
      ctx.createWindow({
        type: 'markdown',
        title: file.name,
        appData: { content: data.content, filePath: file.path, nodeId, file },
      })
      return { ok: true }
    } catch {
      return { ok: false, message: i18n.t('apps.markdown.errors.loadFailed') }
    }
  },
}
