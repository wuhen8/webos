import { useEffect, useRef, useCallback } from 'react'
import { useProcessStore } from '@/stores/processStore'
import { useWindowStore } from '@/stores/windowStore'
import { resolveMediaUrl } from '@/lib/storageApi'
import type { MusicTrack } from '@/types'

// Global audio element ref accessible by MusicPlayerContent
export const globalAudioRef: { current: HTMLAudioElement | null } = { current: null }

// Global playing state (not in zustand to avoid re-renders — components read via ref + events)
export const globalPlayingRef: { current: boolean } = { current: false }

export default function GlobalMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const prevPidRef = useRef<string | undefined>(undefined)

  // Find the music player process
  const musicProcess = useProcessStore(s => s.processes.find(p => p.appId === 'musicPlayer'))
  const pid = musicProcess?.pid
  const d = (musicProcess?.state || {}) as Record<string, any>
  const tracks = (d.musicTracks || []) as MusicTrack[]
  const activeIndex = (d.activeMusicTrackIndex as number) ?? 0
  const activeTrack = tracks[activeIndex]
  const repeatMode = (d.repeatMode as string) ?? 'none'
  const shuffleMode = (d.shuffleMode as boolean) ?? false

  // Expose audio ref globally
  useEffect(() => {
    globalAudioRef.current = audioRef.current
    return () => { globalAudioRef.current = null }
  }, [])

  // Handle track ended
  const handleEnded = useCallback(() => {
    if (!pid) return
    if (repeatMode === 'one') {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
      return
    }

    const isLast = activeIndex >= tracks.length - 1
    if (isLast && repeatMode === 'none' && !shuffleMode) {
      globalPlayingRef.current = false
      window.dispatchEvent(new Event('globalmusic:statechange'))
      return
    }

    // Play next track via process state
    useProcessStore.getState().setProcessState(pid, (prev) => {
      const trks = (prev.musicTracks || []) as MusicTrack[]
      if (trks.length === 0) return prev
      const current = (prev.activeMusicTrackIndex as number) ?? 0

      if (prev.shuffleMode && trks.length > 1) {
        let next: number
        do { next = Math.floor(Math.random() * trks.length) } while (next === current)
        // Update window title if window exists
        const wins = useWindowStore.getState().windows.filter(w => w.type === 'musicPlayer')
        if (wins.length > 0) useWindowStore.getState().updateWindowTitle(wins[0].id, trks[next].title)
        return { ...prev, activeMusicTrackIndex: next }
      }

      if (current < trks.length - 1) {
        const next = current + 1
        const wins = useWindowStore.getState().windows.filter(w => w.type === 'musicPlayer')
        if (wins.length > 0) useWindowStore.getState().updateWindowTitle(wins[0].id, trks[next].title)
        return { ...prev, activeMusicTrackIndex: next }
      }

      const repeat = (prev.repeatMode as string) || 'none'
      if (repeat === 'all') {
        const wins = useWindowStore.getState().windows.filter(w => w.type === 'musicPlayer')
        if (wins.length > 0) useWindowStore.getState().updateWindowTitle(wins[0].id, trks[0].title)
        return { ...prev, activeMusicTrackIndex: 0 }
      }

      return prev
    })
  }, [pid, repeatMode, activeIndex, tracks.length, shuffleMode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [handleEnded])

  // Broadcast play/pause state changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => { globalPlayingRef.current = true; window.dispatchEvent(new Event('globalmusic:statechange')) }
    const onPause = () => { globalPlayingRef.current = false; window.dispatchEvent(new Event('globalmusic:statechange')) }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  // When active track changes, resolve URL on-demand and play
  const prevTrackIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !activeTrack) return

    if (prevTrackIdRef.current === activeTrack.id) return
    prevTrackIdRef.current = activeTrack.id

    let cancelled = false
    ;(async () => {
      try {
        // 如果 filePath 已经是直链 URL，直接使用；否则走 presign 解析
        const isDirectUrl = activeTrack.filePath.startsWith('http://') || activeTrack.filePath.startsWith('https://')
        const url = isDirectUrl ? activeTrack.filePath : await resolveMediaUrl(activeTrack.nodeId, activeTrack.filePath)
        if (cancelled) return
        audio.src = url
        audio.load()
        audio.play().catch(() => {})
      } catch {
        // resolve failed — skip
      }
    })()

    return () => { cancelled = true }
  }, [activeTrack?.id])

  // When process is killed (no more musicProcess), stop audio
  useEffect(() => {
    if (prevPidRef.current && !pid) {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.src = ''
        prevTrackIdRef.current = undefined
      }
    }
    prevPidRef.current = pid
  }, [pid])

  return <audio ref={audioRef} preload="metadata" />
}
