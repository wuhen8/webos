import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'webview',
  name: 'HTML 预览',
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
      label: 'HTML 预览',
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
      return { ok: false, message: '无法加载 HTML 文件' }
    }
  },
  defaultAppData: (options) => {
    return { src: (options?.src as string) || '' }
  },
}
