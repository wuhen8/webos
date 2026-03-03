import { fsApi } from '@/lib/storageApi'
import type { AppConfig, FileInfo } from '@/types'

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico']

export const manifest: AppConfig = {
  id: 'image',
  name: '图片预览',
  icon: 'Monitor',
  gradient: 'from-emerald-400 to-emerald-600',
  shadow: 'shadow-emerald-500/30',
  defaultSize: { width: 700, height: 500 },
  defaultPosition: { xOffset: 100, yOffset: 80 },
  singleton: false,
  showInDock: false,
  dockOrder: 99,
  menus: [],
  fileAssociations: [
    {
      extensions: imageExtensions,
      label: '图片查看器',
      icon: 'Image',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    const src = await ctx.resolveMediaUrl(nodeId, file.path)

    let imageList: { name: string; path: string; nodeId: string }[] = []
    let imageIndex = 0
    try {
      const dirPath = file.path.substring(0, file.path.lastIndexOf('/')) || '/'
      const dirFiles = await fsApi.list(nodeId, dirPath) as FileInfo[]
      imageList = dirFiles
        .filter(f => !f.isDir && imageExtensions.includes((f.extension || '').toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .map(f => ({ name: f.name, path: f.path, nodeId }))
      imageIndex = imageList.findIndex(f => f.path === file.path)
      if (imageIndex < 0) imageIndex = 0
    } catch {}

    ctx.createWindow({
      type: 'image',
      title: file.name,
      appData: { src, imageList, imageIndex },
    })
    return { ok: true }
  },
}
