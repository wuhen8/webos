import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Maximize,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useWindowStore } from '@/stores/windowStore'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { fsApi } from '@/lib/storageApi'

interface ImageViewerProps {
  windowId: string
}

interface ImageListItem {
  name: string
  path: string
  nodeId: string
}

const MIN_SCALE = 0.1
const MAX_SCALE = 10
const ZOOM_STEP = 0.1
const TOOLBAR_HIDE_DELAY = 3000

export default function ImageViewer({ windowId }: ImageViewerProps) {
  const { win, procState: d } = useCurrentProcess(windowId)
  const src = (d.src as string) || ''
  const title = win?.title || 'Image'
  const imageList = (d.imageList || []) as ImageListItem[]
  const imageIndex = (d.imageIndex as number) ?? 0
  const hasNav = imageList.length > 1

  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showToolbar, setShowToolbar] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [isFitted, setIsFitted] = useState(true)

  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 0, y: 0 })
  const toolbarTimer = useRef<ReturnType<typeof setTimeout>>()
  const [enableTransition, setEnableTransition] = useState(false)

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const fitToWindow = useCallback(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return

    const containerRect = container.getBoundingClientRect()
    const padding = 40 // Leave some padding
    const availWidth = containerRect.width - padding
    const availHeight = containerRect.height - padding

    const scaleX = availWidth / img.naturalWidth
    const scaleY = availHeight / img.naturalHeight
    const fitScale = Math.min(scaleX, scaleY, 1) // Don't scale up beyond 100%

    setScale(fitScale)
    setPosition({ x: 0, y: 0 })
    setIsFitted(true)
  }, [])

  const resetView = useCallback(() => {
    setEnableTransition(true)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    fitToWindow()
  }, [fitToWindow])

  const resetToolbarTimer = useCallback(() => {
    setShowToolbar(true)
    clearTimeout(toolbarTimer.current)
    toolbarTimer.current = setTimeout(() => setShowToolbar(false), TOOLBAR_HIDE_DELAY)
  }, [])

  // Navigate to image by index
  const goToImage = useCallback(async (newIndex: number) => {
    if (newIndex < 0 || newIndex >= imageList.length) return
    const item = imageList[newIndex]
    try {
      let newSrc: string
      try {
        const url = await fsApi.presign(item.nodeId, item.path, 'GET')
        newSrc = url || await fsApi.downloadUrl(item.nodeId, item.path)
      } catch {
        newSrc = await fsApi.downloadUrl(item.nodeId, item.path)
      }
      useWindowStore.getState().updateAppData(windowId, { src: newSrc, imageIndex: newIndex })
      // Update window title
      const store = useWindowStore.getState()
      const idx = store.windows.findIndex(w => w.id === windowId)
      if (idx >= 0) {
        useWindowStore.setState({
          windows: store.windows.map(w => w.id === windowId ? { ...w, title: item.name } : w),
        })
      }
      // Reset view state for new image
      setImageLoaded(false)
      setError(false)
      resetView()
    } catch {}
  }, [imageList, windowId, resetView])

  const goPrev = useCallback(() => {
    goToImage(imageIndex - 1)
    resetToolbarTimer()
  }, [goToImage, imageIndex, resetToolbarTimer])

  const goNext = useCallback(() => {
    goToImage(imageIndex + 1)
    resetToolbarTimer()
  }, [goToImage, imageIndex, resetToolbarTimer])

  // Auto-focus container on mount
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Start toolbar hide timer on mount
  useEffect(() => {
    toolbarTimer.current = setTimeout(() => setShowToolbar(false), TOOLBAR_HIDE_DELAY)
    return () => clearTimeout(toolbarTimer.current)
  }, [])
/* PLACEHOLDER_EVENTS */

  // Wheel zoom centered on cursor
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      resetToolbarTimer()

      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setScale((prev) => {
        const next = clampScale(prev + delta * Math.max(1, prev))
        const rect = container.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        const factor = next / prev
        setPosition((pos) => ({
          x: cx - factor * (cx - pos.x),
          y: cy - factor * (cy - pos.y),
        }))
        setIsFitted(false)
        setEnableTransition(false)
        return next
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [resetToolbarTimer])

  // Drag handlers on document
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Keyboard shortcuts
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      resetToolbarTimer()
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (hasNav) goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (hasNav) goNext()
          break
        case '+':
        case '=':
          e.preventDefault()
          setEnableTransition(true)
          setScale((s) => clampScale(s + ZOOM_STEP * Math.max(1, s)))
          setIsFitted(false)
          break
        case '-':
        case '_':
          e.preventDefault()
          setEnableTransition(true)
          setScale((s) => clampScale(s - ZOOM_STEP * Math.max(1, s)))
          setIsFitted(false)
          break
        case 'r':
          e.preventDefault()
          setEnableTransition(true)
          setRotation((r) => (r + 90) % 360)
          break
        case 'R':
          e.preventDefault()
          setEnableTransition(true)
          setRotation((r) => (r - 90 + 360) % 360)
          break
        case 'h':
          e.preventDefault()
          setEnableTransition(true)
          setFlipH((f) => !f)
          break
        case 'v':
          e.preventDefault()
          setEnableTransition(true)
          setFlipV((f) => !f)
          break
        case '0':
          e.preventDefault()
          resetView()
          break
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [resetToolbarTimer, resetView, hasNav, goPrev, goNext])
/* PLACEHOLDER_HANDLERS */

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setIsDragging(true)
    setEnableTransition(false)
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { ...position }
  }

  const handleDoubleClick = () => {
    setEnableTransition(true)
    if (isFitted) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      setIsFitted(false)
    } else {
      resetView()
    }
  }

  const zoomIn = () => {
    setEnableTransition(true)
    setScale((s) => clampScale(s + ZOOM_STEP * Math.max(1, s)))
    setIsFitted(false)
    resetToolbarTimer()
  }

  const zoomOut = () => {
    setEnableTransition(true)
    setScale((s) => clampScale(s - ZOOM_STEP * Math.max(1, s)))
    setIsFitted(false)
    resetToolbarTimer()
  }

  const rotateCW = () => {
    setEnableTransition(true)
    setRotation((r) => (r + 90) % 360)
    resetToolbarTimer()
  }

  const rotateCCW = () => {
    setEnableTransition(true)
    setRotation((r) => (r - 90 + 360) % 360)
    resetToolbarTimer()
  }

  const toggleFlipH = () => {
    setEnableTransition(true)
    setFlipH((f) => !f)
    resetToolbarTimer()
  }

  const toggleFlipV = () => {
    setEnableTransition(true)
    setFlipV((f) => !f)
    resetToolbarTimer()
  }

  const transform = [
    `translate(${position.x}px, ${position.y}px)`,
    `rotate(${rotation}deg)`,
    `scale(${flipH ? -scale : scale}, ${flipV ? -scale : scale})`,
  ].join(' ')

  const zoomPercent = Math.round(scale * 100)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="h-full w-full relative overflow-hidden bg-black outline-none select-none"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseMove={resetToolbarTimer}
    >
      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-[1] pointer-events-none">
          <div className="text-white/80 text-center">
            <p className="text-lg mb-2">图片加载失败</p>
            <p className="text-sm text-white/50">{title}</p>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {!imageLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-600" />
        </div>
      )}

      {/* Image */}
      {!error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            ref={imgRef}
            src={src}
            alt={title}
            draggable={false}
            className="max-w-none"
            style={{
              transform,
              transition: enableTransition ? 'transform 0.2s ease' : 'none',
              visibility: imageLoaded ? 'visible' : 'hidden',
            }}
            onLoad={() => {
              setImageLoaded(true)
              if (isFitted) {
                fitToWindow()
              }
            }}
            onError={() => setError(true)}
          />
        </div>
      )}

      {/* Prev/Next navigation arrows */}
      {hasNav && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            disabled={imageIndex <= 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full
              bg-black/40 backdrop-blur-md border border-white/10 text-white/80
              flex items-center justify-center
              hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed
              transition-all duration-200"
            title="上一张 (←)"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext() }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            disabled={imageIndex >= imageList.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full
              bg-black/40 backdrop-blur-md border border-white/10 text-white/80
              flex items-center justify-center
              hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed
              transition-all duration-200"
            title="下一张 (→)"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
/* PLACEHOLDER_TOOLBAR */

      {/* Toolbar */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-2 py-1.5 rounded-lg
          bg-black/50 backdrop-blur-md border border-white/10 text-white/80 transition-opacity duration-300 z-10"
        style={{
          opacity: showToolbar ? 1 : 0,
          pointerEvents: showToolbar ? 'auto' : 'none',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Nav counter */}
        {hasNav && (
          <>
            <ToolbarButton onClick={goPrev} title="上一张 (←)" disabled={imageIndex <= 0}>
              <ChevronLeft size={16} />
            </ToolbarButton>
            <span className="text-xs min-w-[3em] text-center tabular-nums">{imageIndex + 1}/{imageList.length}</span>
            <ToolbarButton onClick={goNext} title="下一张 (→)" disabled={imageIndex >= imageList.length - 1}>
              <ChevronRight size={16} />
            </ToolbarButton>
            <ToolbarSeparator />
          </>
        )}

        {/* Zoom group */}
        <ToolbarButton onClick={zoomOut} title="缩小 (-)">
          <ZoomOut size={16} />
        </ToolbarButton>
        <span className="text-xs min-w-[3.5em] text-center tabular-nums">{zoomPercent}%</span>
        <ToolbarButton onClick={zoomIn} title="放大 (+)">
          <ZoomIn size={16} />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Rotate group */}
        <ToolbarButton onClick={rotateCCW} title="逆时针旋转 (Shift+R)">
          <RotateCcw size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={rotateCW} title="顺时针旋转 (R)">
          <RotateCw size={16} />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Flip group */}
        <ToolbarButton onClick={toggleFlipH} title="水平翻转 (H)" active={flipH}>
          <FlipHorizontal2 size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={toggleFlipV} title="垂直翻转 (V)" active={flipV}>
          <FlipVertical2 size={16} />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Reset */}
        <ToolbarButton onClick={resetView} title="重置 (0)">
          <Maximize size={16} />
        </ToolbarButton>
      </div>
    </div>
  )
}

function ToolbarButton({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-white/20' : ''}`}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return <div className="w-px h-4 bg-white/20 mx-1" />
}