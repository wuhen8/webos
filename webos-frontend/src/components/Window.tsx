import { useState, useEffect, useRef, memo } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import {
  X,
  Minus,
  Square,
  GripVertical,
} from "lucide-react"
import type { WindowState, ContextMenuContext } from "@/types"
import { windowTitleBarContextMenu, webviewTitleBarContextMenu } from "@/config/contextMenus"
import { useWindowStore, useUIStore } from "@/stores"
import { useProcessStore } from "@/stores/processStore"
import { getAppConfig, resolveIcon } from "@/config/appRegistry"
import i18n from '@/i18n'

// ── Snap constants ──
const EDGE_SNAP_THRESHOLD = 10
const WINDOW_SNAP_THRESHOLD = 10
const SNAP_GAP = 6
const TOP_BAR_HEIGHT = 25
const DOCK_HEIGHT = 70
const SNAP_PADDING = 4

type SnapZone = 'left' | 'right' | 'top' | null

function getSnapZone(clientX: number, clientY: number): SnapZone {
  const vw = window.innerWidth
  if (clientX <= EDGE_SNAP_THRESHOLD) return 'left'
  if (clientX >= vw - EDGE_SNAP_THRESHOLD) return 'right'
  if (clientY <= EDGE_SNAP_THRESHOLD + TOP_BAR_HEIGHT) return 'top'
  return null
}

function getSnapRect(zone: SnapZone): { x: number; y: number; w: number; h: number } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const usableTop = TOP_BAR_HEIGHT + SNAP_PADDING
  const usableHeight = vh - TOP_BAR_HEIGHT - DOCK_HEIGHT - SNAP_PADDING * 2
  switch (zone) {
    case 'left':
      return { x: SNAP_PADDING, y: usableTop, w: vw / 2 - SNAP_PADDING * 1.5, h: usableHeight }
    case 'right':
      return { x: vw / 2 + SNAP_PADDING * 0.5, y: usableTop, w: vw / 2 - SNAP_PADDING * 1.5, h: usableHeight }
    case 'top':
      return { x: SNAP_PADDING, y: usableTop, w: vw - SNAP_PADDING * 2, h: usableHeight }
    default:
      return null
  }
}

// ── Magnetic snap types & logic ──
interface SnapGuide {
  type: 'vertical' | 'horizontal'
  position: number
  start: number
  end: number
}

interface SnapResult {
  x: number
  y: number
  guides: SnapGuide[]
}

interface SnapCandidate {
  axis: 'x' | 'y'
  distance: number
  snappedValue: number
  guide: SnapGuide
}

/** Check if two 1D ranges [a1,a2] and [b1,b2] overlap */
function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2
}

/** Magnetic snap: align to other windows' edges and screen edges with overlap detection */
function magneticSnap(
  x: number, y: number, width: number, height: number,
  selfId: string, allWindows: WindowState[],
): SnapResult {
  const selfLeft = x
  const selfRight = x + width
  const selfTop = y
  const selfBottom = y + height

  const vw = window.innerWidth
  const vh = window.innerHeight
  const screenLeft = SNAP_PADDING
  const screenRight = vw - SNAP_PADDING
  const screenTop = TOP_BAR_HEIGHT + SNAP_PADDING
  const screenBottom = vh - DOCK_HEIGHT - SNAP_PADDING

  const candidates: SnapCandidate[] = []

  // ── Screen edge candidates ──
  // X-axis screen edges (always eligible — vertical overlap with screen is guaranteed)
  const addScreenX = (selfEdge: number, screenEdge: number, side: 'left' | 'right') => {
    const dist = Math.abs(selfEdge - screenEdge)
    if (dist < WINDOW_SNAP_THRESHOLD) {
      const snappedX = side === 'left'
        ? screenEdge
        : screenEdge - width
      candidates.push({
        axis: 'x',
        distance: dist,
        snappedValue: snappedX,
        guide: {
          type: 'vertical',
          position: screenEdge,
          start: Math.min(selfTop, screenTop),
          end: Math.max(selfBottom, screenBottom),
        },
      })
    }
  }
  addScreenX(selfLeft, screenLeft, 'left')
  addScreenX(selfRight, screenRight, 'right')

  // Y-axis screen edges
  const addScreenY = (selfEdge: number, screenEdge: number, side: 'top' | 'bottom') => {
    const dist = Math.abs(selfEdge - screenEdge)
    if (dist < WINDOW_SNAP_THRESHOLD) {
      const snappedY = side === 'top'
        ? screenEdge
        : screenEdge - height
      candidates.push({
        axis: 'y',
        distance: dist,
        snappedValue: snappedY,
        guide: {
          type: 'horizontal',
          position: screenEdge,
          start: Math.min(selfLeft, screenLeft),
          end: Math.max(selfRight, screenRight),
        },
      })
    }
  }
  addScreenY(selfTop, screenTop, 'top')
  addScreenY(selfBottom, screenBottom, 'bottom')

  // ── Window-to-window candidates ──
  const others = allWindows.filter(w => w.id !== selfId && !w.isMinimized && !w.isMaximized)

  for (const other of others) {
    const ox = other.position.x
    const oy = other.position.y
    const ow = other.size.width
    const oh = other.size.height
    const oRight = ox + ow
    const oBottom = oy + oh

    const hasVerticalOverlap = rangesOverlap(selfTop, selfBottom, oy, oBottom)
    const hasHorizontalOverlap = rangesOverlap(selfLeft, selfRight, ox, oRight)

    // X-axis snapping (requires vertical overlap)
    if (hasVerticalOverlap) {
      const guideTop = Math.min(selfTop, oy)
      const guideBottom = Math.max(selfBottom, oBottom)

      // self-left to other-right (with gap)
      const d1 = Math.abs(selfLeft - (oRight + SNAP_GAP))
      if (d1 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'x', distance: d1, snappedValue: oRight + SNAP_GAP,
          guide: { type: 'vertical', position: oRight + SNAP_GAP / 2, start: guideTop, end: guideBottom },
        })
      }
      // self-right to other-left (with gap)
      const d2 = Math.abs(selfRight - (ox - SNAP_GAP))
      if (d2 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'x', distance: d2, snappedValue: ox - SNAP_GAP - width,
          guide: { type: 'vertical', position: ox - SNAP_GAP / 2, start: guideTop, end: guideBottom },
        })
      }
      // self-left to other-left (align)
      const d3 = Math.abs(selfLeft - ox)
      if (d3 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'x', distance: d3, snappedValue: ox,
          guide: { type: 'vertical', position: ox, start: guideTop, end: guideBottom },
        })
      }
      // self-right to other-right (align)
      const d4 = Math.abs(selfRight - oRight)
      if (d4 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'x', distance: d4, snappedValue: oRight - width,
          guide: { type: 'vertical', position: oRight, start: guideTop, end: guideBottom },
        })
      }
    }

    // Y-axis snapping (requires horizontal overlap)
    if (hasHorizontalOverlap) {
      const guideLeft = Math.min(selfLeft, ox)
      const guideRight = Math.max(selfRight, oRight)

      // self-top to other-bottom (with gap)
      const d5 = Math.abs(selfTop - (oBottom + SNAP_GAP))
      if (d5 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'y', distance: d5, snappedValue: oBottom + SNAP_GAP,
          guide: { type: 'horizontal', position: oBottom + SNAP_GAP / 2, start: guideLeft, end: guideRight },
        })
      }
      // self-bottom to other-top (with gap)
      const d6 = Math.abs(selfBottom - (oy - SNAP_GAP))
      if (d6 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'y', distance: d6, snappedValue: oy - SNAP_GAP - height,
          guide: { type: 'horizontal', position: oy - SNAP_GAP / 2, start: guideLeft, end: guideRight },
        })
      }
      // self-top to other-top (align)
      const d7 = Math.abs(selfTop - oy)
      if (d7 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'y', distance: d7, snappedValue: oy,
          guide: { type: 'horizontal', position: oy, start: guideLeft, end: guideRight },
        })
      }
      // self-bottom to other-bottom (align)
      const d8 = Math.abs(selfBottom - oBottom)
      if (d8 < WINDOW_SNAP_THRESHOLD) {
        candidates.push({
          axis: 'y', distance: d8, snappedValue: oBottom - height,
          guide: { type: 'horizontal', position: oBottom, start: guideLeft, end: guideRight },
        })
      }
    }

    // ── Center-line alignment ──
    const selfCenterX = x + width / 2
    const selfCenterY = y + height / 2
    const oCenterX = ox + ow / 2
    const oCenterY = oy + oh / 2

    // Vertical center alignment (requires vertical overlap)
    if (hasVerticalOverlap) {
      const dc = Math.abs(selfCenterX - oCenterX)
      if (dc < WINDOW_SNAP_THRESHOLD) {
        const guideTop = Math.min(selfTop, oy)
        const guideBottom = Math.max(selfBottom, oBottom)
        candidates.push({
          axis: 'x', distance: dc, snappedValue: oCenterX - width / 2,
          guide: { type: 'vertical', position: oCenterX, start: guideTop, end: guideBottom },
        })
      }
    }

    // Horizontal center alignment (requires horizontal overlap)
    if (hasHorizontalOverlap) {
      const dc = Math.abs(selfCenterY - oCenterY)
      if (dc < WINDOW_SNAP_THRESHOLD) {
        const guideLeft = Math.min(selfLeft, ox)
        const guideRight = Math.max(selfRight, oRight)
        candidates.push({
          axis: 'y', distance: dc, snappedValue: oCenterY - height / 2,
          guide: { type: 'horizontal', position: oCenterY, start: guideLeft, end: guideRight },
        })
      }
    }
  }

  // ── Pick nearest candidate per axis ──
  let bestX: SnapCandidate | null = null
  let bestY: SnapCandidate | null = null

  for (const c of candidates) {
    if (c.axis === 'x') {
      if (!bestX || c.distance < bestX.distance) bestX = c
    } else {
      if (!bestY || c.distance < bestY.distance) bestY = c
    }
  }

  const guides: SnapGuide[] = []
  let snappedX = x
  let snappedY = y

  if (bestX) {
    snappedX = bestX.snappedValue
    guides.push(bestX.guide)
  }
  if (bestY) {
    snappedY = bestY.snappedValue
    guides.push(bestY.guide)
  }

  return { x: snappedX, y: snappedY, guides }
}

// ── Snap preview overlay ──
function SnapPreview({ zone }: { zone: SnapZone }) {
  const rect = zone ? getSnapRect(zone) : null
  if (!rect) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[9990] rounded-xl border-2 border-blue-400/60 bg-blue-400/15 backdrop-blur-sm pointer-events-none"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  )
}

// ── Snap guide lines overlay (rendered via portal to avoid transform containment) ──
const SnapGuides = memo(function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  if (guides.length === 0) return null
  return createPortal(
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          className="fixed pointer-events-none"
          style={
            g.type === 'vertical'
              ? { left: g.position, top: g.start, width: 1, height: g.end - g.start, background: 'rgba(59,130,246,0.5)', zIndex: 99999 }
              : { left: g.start, top: g.position, width: g.end - g.start, height: 1, background: 'rgba(59,130,246,0.5)', zIndex: 99999 }
          }
        />
      ))}
    </>,
    document.body,
  )
})

interface WindowProps {
  window: WindowState
  children: React.ReactNode
}

export function Window({ window: win, children }: WindowProps) {
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const activateWindow = useWindowStore((s) => s.activateWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const reloadWebview = useWindowStore((s) => s.reloadWebview)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  const [resizeDirection, setResizeDirection] = useState<'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null>(null)
  const [snapZone, setSnapZone] = useState<SnapZone>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const prevGuidesRef = useRef<string>('')
  const preSnapRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const windowRef = useRef<HTMLDivElement>(null)

  // Disable motion transitions during drag/resize for instant feedback
  const isInteracting = isDragging || isResizing

  const startDrag = (clientX: number, clientY: number) => {
    activateWindow(win.id)

    if (win.isMaximized) {
      const pre = win.preMaximize
      const restoreW = pre?.width ?? win.size.width
      const restoreH = pre?.height ?? win.size.height
      const ratio = (clientX - (win.isMaximized ? 0 : win.position.x)) /
        window.innerWidth
      const newX = clientX - restoreW * ratio
      const newY = clientY - 24

      maximizeWindow(win.id)
      moveWindow(win.id, Math.max(0, newX), Math.max(0, newY))
      resizeWindow(win.id, restoreW, restoreH)

      setIsDragging(true)
      setDragStart({
        x: clientX - Math.max(0, newX),
        y: clientY - Math.max(0, newY),
      })
      return
    }

    setIsDragging(true)
    setDragStart({
      x: clientX - win.position.x,
      y: clientY - win.position.y,
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return
    startDrag(e.clientX, e.clientY)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY)
  }

  const handleResizeStart = (e: React.MouseEvent, direction: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w') => {
    e.stopPropagation()
    activateWindow(win.id)
    setIsResizing(true)
    setResizeDirection(direction)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: win.size.width,
      height: win.size.height,
      posX: win.position.x,
      posY: win.position.y,
    })
  }

  useEffect(() => {
    const updateGuides = (guides: SnapGuide[]) => {
      const key = guides.map(g => `${g.type}:${g.position}:${g.start}:${g.end}`).join('|')
      if (key !== prevGuidesRef.current) {
        prevGuidesRef.current = key
        setSnapGuides(guides)
      }
    }

    const handleDragMove = (clientX: number, clientY: number) => {
      let newX = clientX - dragStart.x
      let newY = clientY - dragStart.y
      newX = Math.max(0, newX)
      newY = Math.max(0, newY)

      const zone = getSnapZone(clientX, clientY)
      setSnapZone(zone)

      if (!zone) {
        const allWindows = useWindowStore.getState().windows
        const result = magneticSnap(newX, newY, win.size.width, win.size.height, win.id, allWindows)
        newX = result.x
        newY = result.y
        updateGuides(result.guides)
      } else {
        updateGuides([])
      }

      moveWindow(win.id, newX, newY)
    }

    const handleDragEnd = (clientX: number, clientY: number) => {
      const zone = getSnapZone(clientX, clientY)
      if (zone) {
        const rect = getSnapRect(zone)
        if (rect) {
          preSnapRef.current = { x: win.position.x, y: win.position.y, w: win.size.width, h: win.size.height }
          moveWindow(win.id, rect.x, rect.y)
          resizeWindow(win.id, rect.w, rect.h)
        }
      }
      setSnapZone(null)
      prevGuidesRef.current = ''
      setSnapGuides([])
      setIsDragging(false)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      e.preventDefault()
      handleDragMove(e.clientX, e.clientY)
    }

    const handleMouseUp = (e: MouseEvent) => {
      handleDragEnd(e.clientX, e.clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return
      e.preventDefault()
      const touch = e.touches[0]
      handleDragMove(touch.clientX, touch.clientY)
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      handleDragEnd(touch.clientX, touch.clientY)
    }

    if (isDragging) {
      document.body.style.cursor = 'move'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)
    }

    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDragging, dragStart, moveWindow, resizeWindow, win.id, win.size.width, win.size.height, win.position.x, win.position.y])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeDirection) return
      e.preventDefault()
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y

      let newWidth = win.size.width
      let newHeight = win.size.height
      let newX = resizeStart.posX
      let newY = resizeStart.posY

      switch (resizeDirection) {
        case 'nw': // bottom-right
          newWidth = Math.max(400, resizeStart.width + deltaX)
          newHeight = Math.max(300, resizeStart.height + deltaY)
          break
        case 'sw': // bottom-left
          {
            const candidateWidth = resizeStart.width - deltaX
            newWidth = Math.max(400, candidateWidth)
            const widthDelta = resizeStart.width - newWidth
            newX = Math.max(0, resizeStart.posX + widthDelta)
            newHeight = Math.max(300, resizeStart.height + deltaY)
          }
          break
        case 's': // bottom
          newHeight = Math.max(300, resizeStart.height + deltaY)
          break
        case 'e': // right
          newWidth = Math.max(400, resizeStart.width + deltaX)
          break
        case 'w': // left
          {
            const candidateWidth = resizeStart.width - deltaX
            newWidth = Math.max(400, candidateWidth)
            const widthDelta = resizeStart.width - newWidth
            newX = Math.max(0, resizeStart.posX + widthDelta)
          }
          break
        case 'n': // top
          {
            const candidateHeight = resizeStart.height - deltaY
            newHeight = Math.max(300, candidateHeight)
            const heightDelta = resizeStart.height - newHeight
            newY = Math.max(0, resizeStart.posY + heightDelta)
          }
          break
        case 'se': // top-right
          {
            newWidth = Math.max(400, resizeStart.width + deltaX)
            const candidateHeight = resizeStart.height - deltaY
            newHeight = Math.max(300, candidateHeight)
            const heightDelta = resizeStart.height - newHeight
            newY = Math.max(0, resizeStart.posY + heightDelta)
          }
          break
        case 'ne': // top-left
          {
            const candidateWidth = resizeStart.width - deltaX
            newWidth = Math.max(400, candidateWidth)
            const widthDelta = resizeStart.width - newWidth
            newX = Math.max(0, resizeStart.posX + widthDelta)
            const candidateHeight = resizeStart.height - deltaY
            newHeight = Math.max(300, candidateHeight)
            const heightDelta = resizeStart.height - newHeight
            newY = Math.max(0, resizeStart.posY + heightDelta)
          }
          break
      }

      if (resizeDirection === 'sw' || resizeDirection === 'w' || resizeDirection === 'n' || resizeDirection === 'ne' || resizeDirection === 'se') {
        moveWindow(win.id, newX, newY)
      }
      resizeWindow(win.id, newWidth, newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeDirection(null)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeStart, resizeDirection, resizeWindow, moveWindow, win.id, win.size.width, win.size.height])

  // ── Animation variants ──
  const springTransition = { type: 'spring' as const, stiffness: 500, damping: 30, mass: 0.8 }
  const noTransition = { duration: 0 }

  return (
    <>
    <motion.div
      ref={windowRef}
      // Mount animation
      initial={{ opacity: 0, scale: 0.88 }}
      // Animate based on minimized state
      animate={
        win.isMinimized
          ? { opacity: 0, scale: 0.85, y: 40, pointerEvents: 'none' as const }
          : { opacity: 1, scale: 1, y: 0, pointerEvents: 'auto' as const }
      }
      // Unmount animation (close)
      exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.18, ease: 'easeIn' } }}
      transition={isInteracting ? noTransition : { ...springTransition, opacity: { duration: 0.18 } }}
      className={`window-container absolute flex flex-col rounded-2xl pointer-events-auto ${
        win.isActive ? 'shadow-2xl' : 'shadow-lg'
      } ${win.isMaximized ? 'rounded-xl' : ''}`}
      data-window-id={win.id}
      style={{
        left: win.isMaximized ? 0 : win.position.x,
        top: win.isMaximized ? TOP_BAR_HEIGHT : win.position.y,
        width: win.isMaximized ? '100%' : win.size.width,
        height: win.isMaximized ? `calc(100% - ${TOP_BAR_HEIGHT + DOCK_HEIGHT}px)` : win.size.height,
        zIndex: win.zIndex,
        transformOrigin: 'center center',
        background: win.isActive
          ? 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.12) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
        backdropFilter: 'blur(60px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(60px) saturate(1.6)',
        boxShadow: win.isActive
          ? [
              '0 24px 80px -12px rgba(0,0,0,0.25)',
              '0 8px 24px -8px rgba(0,0,0,0.1)',
              '0 0 0 0.5px rgba(255,255,255,0.4)',
              'inset 0 0.5px 0 rgba(255,255,255,0.8)',
              'inset 0 -0.5px 0 rgba(0,0,0,0.05)',
            ].join(', ')
          : [
              '0 12px 40px -8px rgba(0,0,0,0.15)',
              '0 4px 12px -4px rgba(0,0,0,0.06)',
              '0 0 0 0.5px rgba(255,255,255,0.25)',
              'inset 0 0.5px 0 rgba(255,255,255,0.5)',
              'inset 0 -0.5px 0 rgba(0,0,0,0.03)',
            ].join(', '),
        border: win.isActive
          ? '0.5px solid rgba(255,255,255,0.45)'
          : '0.5px solid rgba(255,255,255,0.25)',
      }}
      onMouseDown={() => activateWindow(win.id)}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between h-12 px-4 cursor-move select-none border-b rounded-t-2xl"
        style={{
          background: win.isActive
            ? 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.15) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
          borderColor: win.isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={() => maximizeWindow(win.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          const ctx: ContextMenuContext = {
            maximizeLabel: win.isMaximized ? i18n.t('context.window.restoreAction') : i18n.t('context.window.maximizeAction'),
            isMaximized: win.isMaximized,
          }
          const menuConfig = win.type === 'webview' ? webviewTitleBarContextMenu : windowTitleBarContextMenu
          openGlobalMenu({
            x: e.clientX,
            y: e.clientY,
            config: menuConfig,
            context: ctx,
            onAction: (action) => {
              if (action === 'window.minimize') minimizeWindow(win.id)
              else if (action === 'window.maximize') maximizeWindow(win.id)
              else if (action === 'window.reload') reloadWebview(win.id)
              else if (action === 'window.openInBrowser') {
                const proc = useProcessStore.getState().getProcess(win.pid)
                const src = (proc?.state?.src as string) || ''
                if (src) window.open(src, '_blank', 'noopener,noreferrer')
              }
              closeGlobalMenu()
            },
          })
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 window-controls">
            <button
              onClick={() => closeWindow(win.id)}
              className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center group transition-all"
            >
              <X className="w-2 h-2 text-red-800 opacity-0 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => minimizeWindow(win.id)}
              className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center group transition-all"
            >
              <Minus className="w-2 h-2 text-amber-800 opacity-0 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => {
                const el = windowRef.current
                if (!el) return
                if (document.fullscreenElement === el) {
                  document.exitFullscreen()
                } else {
                  el.requestFullscreen()
                }
              }}
              className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 flex items-center justify-center group transition-all"
            >
              <Square className="w-2 h-2 text-green-800 opacity-0 group-hover:opacity-100" />
            </button>
          </div>
          <div className="w-px h-4 bg-slate-300/50 mx-2"></div>
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>

        <div className="flex items-center gap-2">
          {(() => {
            const config = getAppConfig(win.appId ?? win.type)
            const Icon = resolveIcon(config.icon)
            return <Icon className="h-4 w-4 text-slate-600" />
          })()}
          <span className="text-sm font-medium text-slate-700 truncate max-w-[12.5rem]">
            {win.title}
          </span>
        </div>

        <div className="w-20"></div>
      </div>

      {/* 内容区域 */}
      <div
        className={`window-content flex-1 overflow-hidden relative rounded-b-2xl ${isResizing ? (resizeDirection === 'sw' || resizeDirection === 'se' ? 'cursor-nesw-resize' : resizeDirection === 'nw' || resizeDirection === 'ne' ? 'cursor-nwse-resize' : (resizeDirection === 'e' || resizeDirection === 'w') ? 'cursor-ew-resize' : 'cursor-ns-resize') : ''}`}
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>

      {/* Edge snap preview overlay */}
      {isDragging && <SnapPreview zone={snapZone} />}

      {/* Resize handles */}
      {!win.isMaximized && (
        <>
          <div
            className="absolute -bottom-2 right-5 left-5 h-3 cursor-ns-resize select-none"
            onMouseDown={(e) => handleResizeStart(e, 's')}
          ></div>
          <div
            className="absolute -top-2 right-5 left-5 h-3 cursor-ns-resize select-none"
            onMouseDown={(e) => handleResizeStart(e, 'n')}
          ></div>
          <div
            className="absolute top-12 -bottom-2 -right-2 w-3 cursor-ew-resize select-none"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          ></div>
          <div
            className="absolute top-12 -bottom-2 -left-2 w-3 cursor-ew-resize select-none"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          ></div>
          <div
            className="absolute -bottom-2 -right-2 w-5 h-5 cursor-nwse-resize select-none z-10"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          ></div>
          <div
            className="absolute -bottom-2 -left-2 w-5 h-5 cursor-nesw-resize select-none z-10"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          ></div>
          <div
            className="absolute -top-2 -right-2 w-5 h-5 cursor-nesw-resize select-none z-10"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          ></div>
          <div
            className="absolute -top-2 -left-2 w-5 h-5 cursor-nwse-resize select-none z-10"
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
          ></div>
        </>
      )}
    </motion.div>
    {isDragging && <SnapGuides guides={snapGuides} />}
    </>
  )
}

export default Window
