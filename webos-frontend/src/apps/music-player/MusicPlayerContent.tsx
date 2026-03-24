import { useState, useEffect, useCallback } from 'react'
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, X, ListMusic, FolderPlus, Loader2, RefreshCw, Folder, Trash2 } from 'lucide-react'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { useMusicPlayerStore } from './store'
import { globalAudioRef, globalPlayingRef } from './GlobalMusicPlayer'
import FolderPicker from './FolderPicker'
import type { MusicTrack } from '@/types'

interface PersistedMusicFolder {
  nodeId: string
  path: string
  addedAt: number
}

interface MusicPlayerContentProps {
  windowId: string
}

export default function MusicPlayerContent({ windowId }: MusicPlayerContentProps) {
  const [isPlaying, setIsPlaying] = useState(globalPlayingRef.current)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  const { procState: d } = useCurrentProcess(windowId)
  const tracks = (d.musicTracks || []) as MusicTrack[]
  const musicFolders = (Array.isArray(d.musicFolders) ? d.musicFolders : []) as PersistedMusicFolder[]
  const activeIndex = (d.activeMusicTrackIndex as number) ?? 0
  const shuffleMode = (d.shuffleMode as boolean) ?? false
  const repeatMode = (d.repeatMode as string) ?? 'none'
  const activeTrack = tracks[activeIndex]

  const scanning = useMusicPlayerStore(s => s.scanning)
  const {
    switchMusicTrack,
    removeMusicTrack,
    playNextTrack,
    playPreviousTrack,
    setShuffleMode,
    setRepeatMode,
    addFolder,
    removeFolder,
    hydrateFolders,
    refreshFolders,
  } = useMusicPlayerStore()

  // Sync with global audio state
  useEffect(() => {
    const audio = globalAudioRef.current
    if (!audio) return

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onDurationChange = () => setDuration(audio.duration || 0)
    const onError = () => setError('无法播放此音频文件')
    const onCanPlay = () => setError(null)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('error', onError)
    audio.addEventListener('canplay', onCanPlay)

    // Init from current state
    setCurrentTime(audio.currentTime)
    setDuration(audio.duration || 0)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('canplay', onCanPlay)
    }
  }, [])

  // Listen for global play/pause state changes
  useEffect(() => {
    const handler = () => setIsPlaying(globalPlayingRef.current)
    window.addEventListener('globalmusic:statechange', handler)
    return () => window.removeEventListener('globalmusic:statechange', handler)
  }, [])

  useEffect(() => {
    const audio = globalAudioRef.current
    if (audio) {
      audio.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  useEffect(() => {
    void hydrateFolders(windowId)
  }, [hydrateFolders, windowId])

  const togglePlay = useCallback(() => {
    const audio = globalAudioRef.current
    if (!audio || !activeTrack) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => setError('播放失败'))
    }
  }, [isPlaying, activeTrack])

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    const audio = globalAudioRef.current
    if (audio) {
      audio.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const cycleRepeatMode = useCallback(() => {
    const next = repeatMode === 'none' ? 'all' : repeatMode === 'all' ? 'one' : 'none'
    setRepeatMode(windowId, next)
  }, [repeatMode, setRepeatMode, windowId])

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const displayTitle = activeTrack?.title || '音乐播放器'

  const handleFolderSelect = useCallback(async (path: string) => {
    setShowFolderPicker(false)
    await addFolder(windowId, 'local_1', path)
  }, [addFolder, windowId])

  const getFolderLabel = (path: string) => {
    const normalized = path.replace(/\/$/, '')
    return normalized.split('/').filter(Boolean).pop() || path
  }

  const emptyState = tracks.length === 0
    ? (musicFolders.length === 0
        ? {
            title: '还没有音乐内容',
            description: '点击右上角添加目录，自动扫描并建立播放列表',
          }
        : {
            title: '暂无可播放歌曲',
            description: '已保存目录中没有音频文件，或文件格式暂不支持，可尝试刷新目录或添加其他目录',
          })
    : null

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 select-none relative">
      {/* Player area */}
      <div className="flex flex-col items-center pt-6 px-4 shrink-0">
        {/* Album art */}
        <div className="mb-5">
          <div className={`w-36 h-36 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-[0_0_60px_rgba(139,92,246,0.3)] flex items-center justify-center ${isPlaying ? 'animate-spin' : ''}`}
            style={{ animationDuration: '3s' }}
          >
            <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center">
              <Music className="w-6 h-6 text-white/80" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-4 px-4 max-w-full">
          <h2 className="text-white text-base font-semibold truncate">{displayTitle}</h2>
          {tracks.length === 0 && emptyState && (
            <p className="text-slate-400 text-sm mt-1">{emptyState.title}</p>
          )}
        </div>

        {error && (
          <div className="text-red-400 text-xs mb-3">{error}</div>
        )}

        {/* Progress bar */}
        <div className="w-full max-w-xs px-2 mb-3">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-5 mb-3">
          <button
            onClick={cycleRepeatMode}
            className={`p-2 rounded-full transition-colors relative ${repeatMode !== 'none' ? 'text-violet-400' : 'text-slate-500 hover:text-white'}`}
            title={repeatMode === 'none' ? '无循环' : repeatMode === 'all' ? '列表循环' : '单曲循环'}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>

          <button onClick={() => playPreviousTrack(windowId)} className="text-slate-300 hover:text-white transition-colors p-2">
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlay}
            disabled={!activeTrack}
            className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying
              ? <Pause className="w-5 h-5 text-slate-900" />
              : <Play className="w-5 h-5 text-slate-900 ml-0.5" />
            }
          </button>

          <button onClick={() => playNextTrack(windowId)} className="text-slate-300 hover:text-white transition-colors p-2">
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShuffleMode(windowId, !shuffleMode)}
            className={`p-2 rounded-full transition-colors ${shuffleMode ? 'text-violet-400' : 'text-slate-500 hover:text-white'}`}
            title={shuffleMode ? '随机播放开' : '随机播放关'}
          >
            <Shuffle className="w-4 h-4" />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 w-full max-w-[10rem] mb-3">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value))
              setIsMuted(false)
            }}
            className="flex-1 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
        </div>
      </div>

      {/* Playlist panel */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-slate-700/50 mt-1">
        <div className="flex items-center gap-2 px-4 py-2 text-slate-400 text-xs shrink-0">
          <ListMusic className="w-3.5 h-3.5" />
          <span>播放列表 ({tracks.length})</span>
          <div className="flex-1" />
          <button
            onClick={() => void refreshFolders(windowId)}
            disabled={scanning}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            title="刷新目录"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setShowFolderPicker(true)}
            disabled={scanning}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            title="添加目录"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 text-slate-400 text-xs border-b border-slate-700/50">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>已保存目录 ({musicFolders.length})</span>
            </div>
            {musicFolders.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-slate-500">
                还没有保存目录，点击右上角添加目录开始扫描音乐
              </div>
            ) : (
              <div className="max-h-28 overflow-y-auto">
                {musicFolders.map((folder) => (
                  <div
                    key={`${folder.nodeId}:${folder.path}`}
                    className="group flex items-center gap-2 px-3 py-2 border-t border-slate-800/60 first:border-t-0"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-slate-200">{getFolderLabel(folder.path)}</div>
                      <div className="truncate text-[11px] text-slate-500">{folder.path}</div>
                    </div>
                    <button
                      onClick={() => removeFolder(windowId, folder.nodeId, folder.path)}
                      disabled={scanning}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                      title="删除目录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {tracks.length === 0 ? (
            <div className="text-center py-6 px-4">
              <div className="text-slate-400 text-sm">{emptyState?.title}</div>
              <div className="text-slate-600 text-xs mt-2 leading-5">{emptyState?.description}</div>
            </div>
          ) : (
            tracks.map((track, idx) => (
              <div
                key={track.id}
                onClick={() => switchMusicTrack(windowId, idx)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors text-sm ${
                  idx === activeIndex
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                <span className="w-5 text-center text-xs shrink-0">
                  {idx === activeIndex && isPlaying ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  ) : (
                    <span className="text-slate-600">{idx + 1}</span>
                  )}
                </span>
                <span className="truncate flex-1">{track.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeMusicTrack(windowId, idx)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Folder picker overlay */}
      {showFolderPicker && (
        <FolderPicker
          nodeId="local_1"
          onSelect={handleFolderSelect}
          onClose={() => setShowFolderPicker(false)}
        />
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div className="absolute inset-0 z-40 bg-slate-900/80 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <span className="text-slate-300 text-sm">正在扫描音乐文件...</span>
        </div>
      )}
    </div>
  )
}
