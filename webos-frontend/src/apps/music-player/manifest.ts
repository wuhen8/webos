import i18n from '@/i18n'
import type { AppConfig, MusicTrack } from '@/types'

export const manifest: AppConfig = {
  id: 'musicPlayer',
  name: 'i18n:apps.musicPlayer.name',
  icon: 'Music',
  gradient: 'from-violet-400 to-fuchsia-600',
  shadow: 'shadow-violet-500/30',
  defaultSize: { width: 400, height: 520 },
  defaultPosition: { xOffset: 120, yOffset: 80 },
  singleton: true,
  backgroundable: true,
  showInDock: false,
  dockOrder: 50,
  menus: [],
  fileAssociations: [
    {
      extensions: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'],
      label: 'i18n:apps.musicPlayer.fileAssociations.audio',
      icon: 'Music',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    const newTrack: MusicTrack = {
      id: `track-${Date.now()}`,
      title: file.name,
      src: '',
      filePath: file.path,
      nodeId,
      sourceType: 'file',
    }

    // Check for existing music player window
    const existing = ctx.findWindow(w => w.type === 'musicPlayer')

    if (existing) {
      const appData = ctx.getAppData(existing.id)
      const tracks = (appData.musicTracks || []) as MusicTrack[]
      const existingTrackIndex = tracks.findIndex((t: MusicTrack) => t.filePath === file.path && t.nodeId === nodeId)

      if (existingTrackIndex >= 0) {
        ctx.updateAppData(existing.id, { activeMusicTrackIndex: existingTrackIndex })
        ctx.updateWindowTitle(existing.id, tracks[existingTrackIndex].title)
      } else {
        const newTracks = [...tracks, newTrack]
        ctx.updateAppData(existing.id, {
          musicTracks: newTracks,
          activeMusicTrackIndex: newTracks.length - 1,
        })
        ctx.updateWindowTitle(existing.id, newTrack.title)
      }
      ctx.activateWindow(existing.id)
      return { ok: true }
    }

    // No window — check for backgrounded process
    const bgProcess = ctx.findProcess(p => p.appId === 'musicPlayer')

    if (bgProcess) {
      const tracks = (bgProcess.state.musicTracks || []) as MusicTrack[]
      const existingTrackIndex = tracks.findIndex((t: MusicTrack) => t.filePath === file.path && t.nodeId === nodeId)

      if (existingTrackIndex >= 0) {
        ctx.updateProcessState(bgProcess.pid, { activeMusicTrackIndex: existingTrackIndex })
      } else {
        const newTracks = [...tracks, newTrack]
        ctx.setProcessState(bgProcess.pid, (prev) => ({
          ...prev,
          musicTracks: newTracks,
          activeMusicTrackIndex: newTracks.length - 1,
        }))
      }
      // Restore window via singleton logic
      ctx.restoreProcessWindow('musicPlayer')
      return { ok: true }
    }

    // No process at all — create fresh
    ctx.createWindow({
      type: 'musicPlayer',
      title: file.name,
      appData: {
        musicTracks: [newTrack],
        activeMusicTrackIndex: 0,
        shuffleMode: false,
        repeatMode: 'none',
        musicFolders: [],
        musicFoldersHydrated: false,
      },
    })
    return { ok: true }
  },
  defaultAppData: (options) => {
    const tracks: MusicTrack[] = []
    const dt = options?.directTrack as { url?: string; title?: string; nodeId?: string } | undefined
    if (dt?.url) {
      tracks.push({
        id: `track-${Date.now()}`,
        title: dt.title || dt.url.split('/').pop() || i18n.t('apps.musicPlayer.unknownTrack'),
        src: '',
        filePath: dt.url,
        nodeId: dt.nodeId || 'local_1',
        sourceType: 'file',
      })
    }
    return {
      musicTracks: tracks,
      activeMusicTrackIndex: 0,
      shuffleMode: false,
      repeatMode: 'none',
      musicFolders: [],
      musicFoldersHydrated: false,
    }
  },
}
