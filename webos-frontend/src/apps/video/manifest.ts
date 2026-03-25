import i18n from '@/i18n'
import type { AppConfig } from '@/types'
import { fsApi } from '@/lib/storageApi'

export const manifest: AppConfig = {
  id: 'video',
  name: 'i18n:apps.video.name',
  icon: 'Monitor',
  gradient: 'from-rose-400 to-rose-600',
  shadow: 'shadow-rose-500/30',
  defaultSize: { width: 900, height: 650 },
  defaultPosition: { xOffset: 100, yOffset: 80 },
  singleton: false,
  showInDock: false,
  dockOrder: 99,
  menus: [],
  fileAssociations: [
    {
      extensions: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.ogv', '.m3u8', '.ts'],
      label: 'i18n:apps.video.fileAssociations.video',
      icon: 'Film',
    },
    {
      extensions: ['.vlist', '.m3u'],
      label: 'i18n:apps.video.fileAssociations.playlist',
      icon: 'ListVideo',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'

    // .vlist / .m3u: read and parse playlist
    const ext = (file.extension || '').toLowerCase()
    const isVlist = ext === '.vlist' || file.path.endsWith('.vlist')
    const isM3u = ext === '.m3u' || file.path.endsWith('.m3u')

    if (isVlist || isM3u) {
      try {
        const { content } = await fsApi.read(nodeId, file.path)
        let items: { label: string; url: string }[]
        let title: string

        if (isVlist) {
          const data = JSON.parse(content)
          items = Array.isArray(data) ? data : (data.playlist || [])
          title = data.name || data.title || file.name.replace(/\.vlist$/, '')
        } else {
          items = []
          const lines = content.split(/\r?\n/)
          let nextLabel = ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === '#EXTM3U') continue
            if (trimmed.startsWith('#EXTINF:')) {
              nextLabel = trimmed.replace(/^#EXTINF:[^,]*,\s*/, '')
            } else if (trimmed.startsWith('#')) {
              continue
            } else {
              items.push({ label: nextLabel || i18n.t('apps.video.playlist.channelFallback', { count: items.length + 1 }), url: trimmed })
              nextLabel = ''
            }
          }
          title = file.name.replace(/\.m3u$/, '')
        }

        ctx.createWindow({
          type: 'video',
          title,
          appData: { playlist: items },
        })
        return { ok: true }
      } catch {
        return { ok: false, message: i18n.t('apps.video.playlist.parseFailed') }
      }
    }

    // Regular video file — store filePath+nodeId, resolve URL on-demand in player
    ctx.createWindow({
      type: 'video',
      title: file.name,
      appData: { playlist: [{ label: file.name, url: '', filePath: file.path, nodeId }] },
    })
    return { ok: true }
  },
  defaultAppData: (options) => {
    if (options?.playlist) return { playlist: options.playlist }
    const src = (options?.src as string) || ''
    return src ? { playlist: [{ label: 'Video', url: src }] } : { playlist: [] }
  },
}
