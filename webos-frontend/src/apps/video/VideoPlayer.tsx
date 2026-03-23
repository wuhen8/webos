import { useRef, useEffect, useState, useCallback } from 'react'
import { createPlayer, selectPlayback, selectError } from '@videojs/react'
import { Video, videoFeatures } from '@videojs/react/video'
import '@videojs/react/video/skin.css'
import { resolveMediaUrl } from '@/lib/storageApi'
import { CustomVideoSkin } from './CustomVideoSkin'

export interface PlaylistItem {
  label: string
  url: string
  filePath?: string
  nodeId?: string
}

interface VideoPlayerProps {
  playlist: PlaylistItem[]
  title: string
}

const Player = createPlayer({ features: videoFeatures })

export default function VideoPlayer({ playlist, title }: VideoPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const indexRef = useRef(currentIndex)
  indexRef.current = currentIndex

  const current = playlist[currentIndex] || playlist[0]

  const playIndex = useCallback((index: number) => {
    if (index < 0 || index >= playlist.length) return
    setCurrentIndex(index)
    setShowPlaylist(false)
    setError(null)
    setResolvedUrl(null)
  }, [playlist.length])

  const playNext = useCallback(() => {
    const idx = indexRef.current
    if (idx < playlist.length - 1) {
      playIndex(idx + 1)
    }
  }, [playlist.length, playIndex])

  // Resolve URL on-demand
  useEffect(() => {
    if (!current) return
    let cancelled = false

    if (current.filePath && current.nodeId) {
      const isDirectUrl = current.filePath.startsWith('http://') || current.filePath.startsWith('https://')
      if (isDirectUrl) {
        setResolvedUrl(current.filePath)
      } else {
        resolveMediaUrl(current.nodeId, current.filePath).then(url => {
          if (!cancelled) setResolvedUrl(url)
        }).catch(() => {
          if (!cancelled) setError('无法解析视频地址')
        })
      }
    } else if (current.url) {
      setResolvedUrl(current.url)
    } else {
      setError('无效的视频地址')
    }

    return () => { cancelled = true }
  }, [current])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <p className="text-white/80 text-lg">{error}</p>
      </div>
    )
  }

  if (!resolvedUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <p className="text-white/80 text-lg">加载中...</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-black">
      <Player.Provider>
        <PlayerContent
          url={resolvedUrl}
          playlist={playlist}
          currentIndex={currentIndex}
          showPlaylist={showPlaylist}
          onPlayIndex={playIndex}
          onPlayNext={playNext}
          onTogglePlaylist={() => setShowPlaylist(prev => !prev)}
          onClosePlaylist={() => setShowPlaylist(false)}
          current={current}
        />
      </Player.Provider>
    </div>
  )
}

interface PlayerContentProps {
  url: string
  playlist: PlaylistItem[]
  currentIndex: number
  showPlaylist: boolean
  onPlayIndex: (index: number) => void
  onPlayNext: () => void
  onTogglePlaylist: () => void
  onClosePlaylist: () => void
  current: PlaylistItem
}

function PlayerContent({
  url,
  playlist,
  currentIndex,
  showPlaylist,
  onPlayIndex,
  onPlayNext,
  onTogglePlaylist,
  onClosePlaylist,
  current,
}: PlayerContentProps) {
  // Monitor playback state for auto-play next
  const playback = Player.usePlayer(selectPlayback)
  const errorState = Player.usePlayer(selectError)

  useEffect(() => {
    if (playback?.ended) {
      onPlayNext()
    }
  }, [playback?.ended, onPlayNext])

  useEffect(() => {
    if (errorState?.error) {
      console.error('Video playback error:', errorState.error)
    }
  }, [errorState?.error])

  return (
    <>
      <CustomVideoSkin
        onPlaylistClick={onTogglePlaylist}
        showPlaylistButton={playlist.length > 1}
      >
        <Video src={url} autoPlay playsInline crossOrigin="anonymous" />
      </CustomVideoSkin>

      {/* Playlist panel - independent of player controls */}
      {showPlaylist && (
        <>
          <div className="absolute inset-0 z-40" onClick={onClosePlaylist} />

          <div className="absolute right-0 top-0 bottom-0 w-64 z-50 flex flex-col
            bg-black/60 backdrop-blur-2xl backdrop-saturate-150
            shadow-2xl shadow-black/40">

            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white/90 text-sm font-medium tracking-wide">
                剧集 · {playlist.length}集
              </span>
              <button
                onClick={onClosePlaylist}
                className="w-6 h-6 flex items-center justify-center rounded-full
                  bg-white/[0.1] hover:bg-white/[0.2] text-white/60 hover:text-white
                  transition-all text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
              {playlist.map((item, i) => (
                <button
                  key={i}
                  onClick={() => onPlayIndex(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm truncate transition-all duration-200 rounded-md mx-1 ${
                    i === currentIndex
                      ? 'bg-blue-500/25 text-blue-300'
                      : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                  }`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <span className={`mr-2 text-xs ${i === currentIndex ? 'text-blue-400' : 'opacity-50'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="px-4 py-2.5 text-xs text-white/40">
              正在播放 · {current?.label}
            </div>
          </div>
        </>
      )}
    </>
  )
}
