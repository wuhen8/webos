import { useRef, useEffect, useState, useCallback } from 'react'
import Artplayer from 'artplayer'
import Hls from 'hls.js'

export interface PlaylistItem {
  label: string
  url: string
}

interface VideoPlayerProps {
  playlist: PlaylistItem[]
  title: string
}

export default function VideoPlayer({ playlist, title }: VideoPlayerProps) {
  const artRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Artplayer | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const indexRef = useRef(currentIndex)
  indexRef.current = currentIndex

  const current = playlist[currentIndex] || playlist[0]

  const playIndex = useCallback((index: number) => {
    if (index < 0 || index >= playlist.length) return
    setCurrentIndex(index)
    setShowPlaylist(false)
    setError(null)
  }, [playlist.length])

  const playNext = useCallback(() => {
    const idx = indexRef.current
    if (idx < playlist.length - 1) {
      playIndex(idx + 1)
    }
  }, [playlist.length, playIndex])

  useEffect(() => {
    if (!artRef.current || !current) return

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null }

    const isHls = /\.m3u8(\?|$)/i.test(current.url)

    // Build controls array — add playlist button next to setting (right side)
    const controls: any[] = []
    if (playlist.length > 1) {
      controls.push({
        name: 'playlist',
        position: 'right',
        index: 5,
        html: `<span style="cursor:pointer;font-size:12px;opacity:0.9">剧集</span>`,
        click: () => setShowPlaylist(prev => !prev),
      })
    }

    try {
      playerRef.current = new Artplayer({
        container: artRef.current,
        url: current.url,
        volume: 0.7,
        autoplay: true,
        pip: true,
        screenshot: true,
        setting: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true,
        airplay: true,
        theme: '#3b82f6',
        lang: navigator.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en',
        hotkey: true,
        lock: true,
        fastForward: true,
        autoOrientation: true,
        flip: true,
        controls,
        moreVideoAttr: { crossOrigin: 'anonymous' },
        customType: isHls ? {
          m3u8: (video: HTMLVideoElement, url: string) => {
            if (Hls.isSupported()) {
              const hls = new Hls()
              hlsRef.current = hls
              hls.loadSource(url)
              hls.attachMedia(video)
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url
            }
          },
        } : undefined,
        type: isHls ? 'm3u8' : undefined,
      })

      playerRef.current.on('error', () => setError('视频加载失败，请检查文件格式'))
      playerRef.current.on('video:ended', () => playNext())
    } catch {
      setError('播放器初始化失败')
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null }
    }
  }, [current, playlist.length, playNext])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <p className="text-white/80 text-lg">{error}</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-black">
      <div ref={artRef} className="w-full h-full" />

      {/* Playlist panel — glassmorphism */}
      {showPlaylist && (
        <>
          {/* Backdrop click to close */}
          <div className="absolute inset-0 z-40" onClick={() => setShowPlaylist(false)} />

          <div className="absolute right-0 top-0 bottom-0 w-64 z-50 flex flex-col
            bg-black/60 backdrop-blur-2xl backdrop-saturate-150
            shadow-2xl shadow-black/40">

            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white/90 text-sm font-medium tracking-wide">
                剧集 · {playlist.length}集
              </span>
              <button
                onClick={() => setShowPlaylist(false)}
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
                  onClick={() => playIndex(i)}
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

            {/* Current playing indicator */}
            <div className="px-4 py-2.5 text-xs text-white/40">
              正在播放 · {current?.label}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
