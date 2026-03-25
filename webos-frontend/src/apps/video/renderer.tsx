import i18n from '@/i18n'
import { lazyLoad } from '@/config/lazyLoad'
import type { AppRenderer } from '@/config/componentRegistry'

const VideoPlayer = lazyLoad(() => import('./VideoPlayer'))

export const renderer: AppRenderer = (ctx) => {
  const d = (ctx.process?.state || {}) as Record<string, any>

  // Support both new playlist format and legacy single src
  let playlist = d.playlist
  if (!Array.isArray(playlist) || playlist.length === 0) {
    const src = (d.src as string) || ''
    playlist = src ? [{ label: ctx.win.title || i18n.t('apps.video.player.fallbackTitle'), url: src }] : []
  }

  return (
    <div className="h-full w-full bg-black">
      <VideoPlayer
        playlist={playlist}
        title={ctx.win.title || 'Video Player'}
      />
    </div>
  )
}
