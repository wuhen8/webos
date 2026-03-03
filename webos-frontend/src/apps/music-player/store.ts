import { create } from 'zustand'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { fsApi } from '@/lib/storageApi'
import type { MusicTrack, FileInfo } from '@/types'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'])

interface MusicPlayerStore {
  scanning: boolean
  switchMusicTrack: (windowId: string, trackIndex: number) => void
  removeMusicTrack: (windowId: string, trackIndex: number) => void
  playNextTrack: (windowId: string) => void
  playPreviousTrack: (windowId: string) => void
  setShuffleMode: (windowId: string, enabled: boolean) => void
  setRepeatMode: (windowId: string, mode: 'none' | 'all' | 'one') => void
  clearPlaylist: (windowId: string) => void
  addFolder: (windowId: string, nodeId: string, folderPath: string) => Promise<void>
}

// Helper: find pid from windowId
function getPidForWindow(windowId: string): string | undefined {
  const win = useWindowStore.getState().windows.find(w => w.id === windowId)
  return win?.pid
}

// Recursively scan a directory for audio files
async function scanAudioFiles(nodeId: string, dirPath: string): Promise<FileInfo[]> {
  const files = await fsApi.list(nodeId, dirPath)
  const results: FileInfo[] = []
  const subDirs: FileInfo[] = []
  for (const f of files) {
    if (f.isDir) {
      subDirs.push(f)
    } else if (AUDIO_EXTENSIONS.has(f.extension?.toLowerCase())) {
      results.push({ ...f, nodeId })
    }
  }
  // Scan subdirectories concurrently
  const subResults = await Promise.all(subDirs.map(d => scanAudioFiles(nodeId, d.path)))
  return results.concat(...subResults)
}

export const useMusicPlayerStore = create<MusicPlayerStore>((set) => ({
  scanning: false,
  switchMusicTrack: (windowId, trackIndex) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    const process = useProcessStore.getState().getProcess(pid)
    if (!process) return
    const d = process.state
    const track = (d.musicTracks as MusicTrack[])?.[trackIndex]
    if (!track) return
    useProcessStore.getState().updateProcessState(pid, { activeMusicTrackIndex: trackIndex })
    useWindowStore.getState().updateWindowTitle(windowId, track.title)
  },

  removeMusicTrack: (windowId, trackIndex) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    const process = useProcessStore.getState().getProcess(pid)
    if (!process) return
    const d = process.state
    const musicTracks = (d.musicTracks || []) as MusicTrack[]

    const newTracks = musicTracks.filter((_, i) => i !== trackIndex)

    if (newTracks.length === 0) {
      useWindowStore.getState().closeWindow(windowId)
      return
    }

    const activeIdx = (d.activeMusicTrackIndex as number) ?? 0
    let newActiveIndex: number
    if (trackIndex === activeIdx) {
      newActiveIndex = trackIndex >= newTracks.length ? newTracks.length - 1 : trackIndex
    } else if (trackIndex < activeIdx) {
      newActiveIndex = activeIdx - 1
    } else {
      newActiveIndex = activeIdx
    }

    useProcessStore.getState().setProcessState(pid, () => ({
      ...d,
      musicTracks: newTracks,
      activeMusicTrackIndex: newActiveIndex,
    }))
    useWindowStore.getState().updateWindowTitle(windowId, newTracks[newActiveIndex]?.title || '音乐播放器')
  },

  playNextTrack: (windowId) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    useProcessStore.getState().setProcessState(pid, (prev) => {
      const tracks = (prev.musicTracks || []) as MusicTrack[]
      if (tracks.length === 0) return prev
      const current = (prev.activeMusicTrackIndex as number) ?? 0
      const repeat = (prev.repeatMode as string) || 'none'

      if (prev.shuffleMode && tracks.length > 1) {
        let next: number
        do { next = Math.floor(Math.random() * tracks.length) } while (next === current)
        useWindowStore.getState().updateWindowTitle(windowId, tracks[next].title)
        return { ...prev, activeMusicTrackIndex: next }
      }

      if (current < tracks.length - 1) {
        const next = current + 1
        useWindowStore.getState().updateWindowTitle(windowId, tracks[next].title)
        return { ...prev, activeMusicTrackIndex: next }
      }

      if (repeat === 'all') {
        useWindowStore.getState().updateWindowTitle(windowId, tracks[0].title)
        return { ...prev, activeMusicTrackIndex: 0 }
      }

      return prev
    })
  },

  playPreviousTrack: (windowId) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    useProcessStore.getState().setProcessState(pid, (prev) => {
      const tracks = (prev.musicTracks || []) as MusicTrack[]
      if (tracks.length === 0) return prev
      const current = (prev.activeMusicTrackIndex as number) ?? 0

      if (prev.shuffleMode && tracks.length > 1) {
        let next: number
        do { next = Math.floor(Math.random() * tracks.length) } while (next === current)
        useWindowStore.getState().updateWindowTitle(windowId, tracks[next].title)
        return { ...prev, activeMusicTrackIndex: next }
      }

      if (current > 0) {
        const prevIdx = current - 1
        useWindowStore.getState().updateWindowTitle(windowId, tracks[prevIdx].title)
        return { ...prev, activeMusicTrackIndex: prevIdx }
      }

      const repeat = (prev.repeatMode as string) || 'none'
      if (repeat === 'all') {
        const last = tracks.length - 1
        useWindowStore.getState().updateWindowTitle(windowId, tracks[last].title)
        return { ...prev, activeMusicTrackIndex: last }
      }

      return prev
    })
  },

  setShuffleMode: (windowId, enabled) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    useProcessStore.getState().updateProcessState(pid, { shuffleMode: enabled })
  },

  setRepeatMode: (windowId, mode) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    useProcessStore.getState().updateProcessState(pid, { repeatMode: mode })
  },

  clearPlaylist: (windowId) => {
    useWindowStore.getState().closeWindow(windowId)
  },

  addFolder: async (windowId, nodeId, folderPath) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    set({ scanning: true })
    try {
      const audioFiles = await scanAudioFiles(nodeId, folderPath)
      if (audioFiles.length === 0) return

      // Only store file metadata — URL is resolved on-demand when playing
      const newTracks: MusicTrack[] = audioFiles.map((f) => ({
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: f.name,
        src: '',
        filePath: f.path,
        nodeId,
      }))

      const process = useProcessStore.getState().getProcess(pid)
      if (!process) return
      const d = process.state
      const existingTracks = (d.musicTracks || []) as MusicTrack[]

      // Deduplicate by filePath + nodeId
      const existingPaths = new Set(existingTracks.map(t => `${t.nodeId}:${t.filePath}`))
      const uniqueNew = newTracks.filter(t => !existingPaths.has(`${t.nodeId}:${t.filePath}`))
      if (uniqueNew.length === 0) return

      const merged = [...existingTracks, ...uniqueNew]
      const newActiveIndex = existingTracks.length === 0 ? 0 : (d.activeMusicTrackIndex as number) ?? 0

      useProcessStore.getState().setProcessState(pid, () => ({
        ...d,
        musicTracks: merged,
        activeMusicTrackIndex: newActiveIndex,
      }))
      useWindowStore.getState().updateWindowTitle(windowId, merged[newActiveIndex]?.title || '音乐播放器')
    } finally {
      set({ scanning: false })
    }
  },
}))
