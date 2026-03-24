import { create } from 'zustand'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { fsApi } from '@/lib/storageApi'
import type { MusicTrack, FileInfo } from '@/types'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'])
const MUSIC_FOLDERS_STORAGE_KEY = 'music-player:folders:v1'

interface PersistedMusicFolder {
  nodeId: string
  path: string
  addedAt: number
}

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
  removeFolder: (windowId: string, nodeId: string, folderPath: string) => void
  hydrateFolders: (windowId: string) => Promise<void>
  refreshFolders: (windowId: string) => Promise<void>
}

// Helper: find pid from windowId
function getPidForWindow(windowId: string): string | undefined {
  const win = useWindowStore.getState().windows.find(w => w.id === windowId)
  return win?.pid
}

function getFolderKey(nodeId: string, path: string): string {
  return `${nodeId}:${path}`
}

function getTrackKey(track: Pick<MusicTrack, 'nodeId' | 'filePath'>): string {
  return `${track.nodeId}:${track.filePath}`
}

function loadPersistedFolders(): PersistedMusicFolder[] {
  try {
    const raw = localStorage.getItem(MUSIC_FOLDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is PersistedMusicFolder => (
      item && typeof item.nodeId === 'string' && typeof item.path === 'string' && typeof item.addedAt === 'number'
    ))
  } catch {
    return []
  }
}

function savePersistedFolders(folders: PersistedMusicFolder[]) {
  try {
    localStorage.setItem(MUSIC_FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  } catch {}
}

function dedupeFolders(folders: PersistedMusicFolder[]): PersistedMusicFolder[] {
  const seen = new Set<string>()
  return folders.filter((folder) => {
    const key = getFolderKey(folder.nodeId, folder.path)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createFolderTracks(audioFiles: FileInfo[], nodeId: string, folderPath: string): MusicTrack[] {
  const sourceFolderKey = getFolderKey(nodeId, folderPath)
  return audioFiles.map((f) => ({
    id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: f.name,
    src: '',
    filePath: f.path,
    nodeId,
    sourceType: 'folder',
    sourceFolderKey,
  }))
}

function mergeFolderTracks(existingTracks: MusicTrack[], scannedTracks: MusicTrack[]): MusicTrack[] {
  const manualTracks = existingTracks.filter(track => track.sourceType !== 'folder')
  const merged = [...manualTracks]
  const seen = new Set(merged.map(getTrackKey))

  for (const track of scannedTracks) {
    const key = getTrackKey(track)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(track)
  }

  return merged
}

function updatePlayerState(windowId: string, nextFolders: PersistedMusicFolder[], nextTracks: MusicTrack[]) {
  const pid = getPidForWindow(windowId)
  if (!pid) return

  const process = useProcessStore.getState().getProcess(pid)
  if (!process) return

  const d = process.state
  const currentActiveTrack = ((d.musicTracks || []) as MusicTrack[])[(d.activeMusicTrackIndex as number) ?? 0]
  const currentTrackKey = currentActiveTrack ? getTrackKey(currentActiveTrack) : null
  const resolvedActiveIndex = currentTrackKey
    ? nextTracks.findIndex(track => getTrackKey(track) === currentTrackKey)
    : -1
  const nextActiveIndex = nextTracks.length === 0 ? 0 : (resolvedActiveIndex >= 0 ? resolvedActiveIndex : 0)

  useProcessStore.getState().setProcessState(pid, () => ({
    ...d,
    musicTracks: nextTracks,
    musicFolders: nextFolders,
    musicFoldersHydrated: true,
    activeMusicTrackIndex: nextActiveIndex,
  }))

  useWindowStore.getState().updateWindowTitle(windowId, nextTracks[nextActiveIndex]?.title || '音乐播放器')
}

async function rescanPersistedFolders(windowId: string, folders: PersistedMusicFolder[]) {
  const pid = getPidForWindow(windowId)
  if (!pid) return

  const process = useProcessStore.getState().getProcess(pid)
  if (!process) return

  const d = process.state
  const existingTracks = (d.musicTracks || []) as MusicTrack[]
  const uniqueFolders = dedupeFolders(folders)

  const scanResults = await Promise.all(uniqueFolders.map(async (folder) => {
    try {
      const audioFiles = await scanAudioFiles(folder.nodeId, folder.path)
      return createFolderTracks(audioFiles, folder.nodeId, folder.path)
    } catch {
      return []
    }
  }))

  const folderTracks = scanResults.flat()
  const mergedTracks = mergeFolderTracks(existingTracks, folderTracks)

  updatePlayerState(windowId, uniqueFolders, mergedTracks)
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

  removeFolder: (windowId, nodeId, folderPath) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return

    const process = useProcessStore.getState().getProcess(pid)
    if (!process) return

    const d = process.state
    const folderKey = getFolderKey(nodeId, folderPath)
    const existingFolders = Array.isArray(d.musicFolders) ? (d.musicFolders as PersistedMusicFolder[]) : loadPersistedFolders()
    const nextFolders = existingFolders.filter(folder => getFolderKey(folder.nodeId, folder.path) !== folderKey)

    if (nextFolders.length === existingFolders.length) return

    savePersistedFolders(nextFolders)

    const existingTracks = (d.musicTracks || []) as MusicTrack[]
    const nextTracks = existingTracks.filter(track => track.sourceType !== 'folder' || track.sourceFolderKey !== folderKey)

    updatePlayerState(windowId, nextFolders, nextTracks)
  },

  hydrateFolders: async (windowId) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    const process = useProcessStore.getState().getProcess(pid)
    if (!process) return
    const d = process.state
    if (d.musicFoldersHydrated) return

    const persistedFolders = dedupeFolders(loadPersistedFolders())
    useProcessStore.getState().updateProcessState(pid, {
      musicFolders: persistedFolders,
      musicFoldersHydrated: true,
    })

    if (persistedFolders.length === 0) return

    set({ scanning: true })
    try {
      await rescanPersistedFolders(windowId, persistedFolders)
    } finally {
      set({ scanning: false })
    }
  },

  refreshFolders: async (windowId) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    const process = useProcessStore.getState().getProcess(pid)
    if (!process) return
    const d = process.state
    const stateFolders = Array.isArray(d.musicFolders) ? (d.musicFolders as PersistedMusicFolder[]) : []
    const persistedFolders = dedupeFolders(stateFolders.length > 0 ? stateFolders : loadPersistedFolders())

    useProcessStore.getState().updateProcessState(pid, {
      musicFolders: persistedFolders,
      musicFoldersHydrated: true,
    })
    savePersistedFolders(persistedFolders)

    set({ scanning: true })
    try {
      await rescanPersistedFolders(windowId, persistedFolders)
    } finally {
      set({ scanning: false })
    }
  },

  addFolder: async (windowId, nodeId, folderPath) => {
    const pid = getPidForWindow(windowId)
    if (!pid) return
    set({ scanning: true })
    try {
      const audioFiles = await scanAudioFiles(nodeId, folderPath)
      const process = useProcessStore.getState().getProcess(pid)
      if (!process) return
      const d = process.state
      const existingFolders = Array.isArray(d.musicFolders) ? (d.musicFolders as PersistedMusicFolder[]) : loadPersistedFolders()
      const nextFolders = dedupeFolders([
        ...existingFolders,
        { nodeId, path: folderPath, addedAt: Date.now() },
      ])

      savePersistedFolders(nextFolders)
      useProcessStore.getState().updateProcessState(pid, {
        musicFolders: nextFolders,
        musicFoldersHydrated: true,
      })

      if (audioFiles.length === 0) {
        await rescanPersistedFolders(windowId, nextFolders)
        return
      }

      const folderTracks = createFolderTracks(audioFiles, nodeId, folderPath)
      const existingTracks = (d.musicTracks || []) as MusicTrack[]
      const otherFolderTracks = existingTracks.filter(track => track.sourceType === 'folder' && track.sourceFolderKey !== getFolderKey(nodeId, folderPath))
      const merged = mergeFolderTracks(existingTracks, [
        ...otherFolderTracks,
        ...folderTracks,
      ])

      updatePlayerState(windowId, nextFolders, merged)
    } finally {
      set({ scanning: false })
    }
  },
}))
