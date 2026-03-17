import { useState, useEffect, useRef, useCallback } from 'react'

export interface DraggableOptions {
  initialPosition?: { x: number; y: number }
  onDragStart?: () => void
  onDragMove?: (x: number, y: number) => void
  onDragEnd?: (x: number, y: number) => void
  bounds?: {
    left: number
    top: number
    right: number
    bottom: number
  }
  grid?: number  // 网格吸附大小（像素）
  disabled?: boolean
}

export interface DraggableResult {
  isDragging: boolean
  position: { x: number; y: number }
  handleMouseDown: (e: React.MouseEvent) => void
  handleTouchStart: (e: React.TouchEvent) => void
  setPosition: (pos: { x: number; y: number }) => void
}

/**
 * 通用拖拽 Hook
 * 从 Window.tsx 提取并简化，支持鼠标和触摸事件
 */
export function useDraggable(options: DraggableOptions): DraggableResult {
  const {
    initialPosition = { x: 0, y: 0 },
    onDragStart,
    onDragMove,
    onDragEnd,
    bounds,
    grid,
    disabled = false,
  } = options

  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState(initialPosition)
  const dragStartRef = useRef({ x: 0, y: 0 })

  // 同步外部位置变化
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition)
    }
  }, [initialPosition.x, initialPosition.y, isDragging])

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (disabled) return

    setIsDragging(true)
    dragStartRef.current = {
      x: clientX - position.x,
      y: clientY - position.y,
    }
    onDragStart?.()
  }, [position.x, position.y, disabled, onDragStart])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    e.stopPropagation()
    startDrag(e.clientX, e.clientY)
  }, [startDrag, disabled])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    e.stopPropagation()
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY)
  }, [startDrag, disabled])

  useEffect(() => {
    if (!isDragging) return

    const applyConstraints = (x: number, y: number): { x: number; y: number } => {
      let newX = x
      let newY = y

      // 边界限制
      if (bounds) {
        newX = Math.max(bounds.left, Math.min(newX, bounds.right))
        newY = Math.max(bounds.top, Math.min(newY, bounds.bottom))
      }

      // 网格吸附
      if (grid) {
        newX = Math.round(newX / grid) * grid
        newY = Math.round(newY / grid) * grid
      }

      return { x: newX, y: newY }
    }

    const handleDragMove = (clientX: number, clientY: number) => {
      const rawX = clientX - dragStartRef.current.x
      const rawY = clientY - dragStartRef.current.y
      const constrained = applyConstraints(rawX, rawY)

      setPosition(constrained)
      onDragMove?.(constrained.x, constrained.y)
    }

    const handleDragEnd = (clientX: number, clientY: number) => {
      const rawX = clientX - dragStartRef.current.x
      const rawY = clientY - dragStartRef.current.y
      const constrained = applyConstraints(rawX, rawY)

      setPosition(constrained)
      setIsDragging(false)
      onDragEnd?.(constrained.x, constrained.y)
    }

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      handleDragMove(e.clientX, e.clientY)
    }

    const handleMouseUp = (e: MouseEvent) => {
      handleDragEnd(e.clientX, e.clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      handleDragMove(touch.clientX, touch.clientY)
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      handleDragEnd(touch.clientX, touch.clientY)
    }

    document.body.style.cursor = 'move'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDragging, onDragMove, onDragEnd, bounds, grid])

  return {
    isDragging,
    position,
    handleMouseDown,
    handleTouchStart,
    setPosition,
  }
}
