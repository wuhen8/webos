import { useState, useCallback, useRef, useEffect } from "react"

interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

interface UseMarqueeSelectOptions {
  /** The container element ref (scrollable area) */
  containerRef: React.RefObject<HTMLElement>
  /** CSS selector for file item elements */
  itemSelector: string
  /** Callback when selection changes */
  onSelectionChange: (selectedPaths: Set<string>) => void
  /** Current selected files (for Cmd/Ctrl additive selection) */
  currentSelection: Set<string>
  /** Whether marquee is disabled (e.g. during multiSelectMode on mobile) */
  disabled?: boolean
}

export function useMarqueeSelect({
  containerRef,
  itemSelector,
  onSelectionChange,
  currentSelection,
  disabled,
}: UseMarqueeSelectOptions) {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const isActiveRef = useRef(false)
  const didMarqueeRef = useRef(false)
  const additiveModeRef = useRef(false)
  const baseSelectionRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest(itemSelector) || target.closest('input') || target.closest('button')) return

    const container = containerRef.current
    if (!container) return

    const additive = e.metaKey || e.ctrlKey
    additiveModeRef.current = additive
    baseSelectionRef.current = additive ? new Set(currentSelection) : new Set()

    startPointRef.current = { x: e.clientX, y: e.clientY }
    isActiveRef.current = false
    didMarqueeRef.current = false
  }, [containerRef, itemSelector, currentSelection, disabled])

  // Expose didMarqueeRef so the click handler can check it
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // If we just finished a marquee drag, don't clear selection
    if (didMarqueeRef.current) {
      didMarqueeRef.current = false
      return
    }
    // Only clear when clicking directly on the container background
    if (e.target === e.currentTarget) {
      onSelectionChange(new Set())
    }
  }, [onSelectionChange])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!startPointRef.current) return

      const dx = e.clientX - startPointRef.current.x
      const dy = e.clientY - startPointRef.current.y

      // Activation threshold: 5px
      if (!isActiveRef.current) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        isActiveRef.current = true
        didMarqueeRef.current = true
      }

      const container = containerRef.current
      if (!container) return

      // Compute rect relative to the container's position (accounts for scroll)
      const containerRect = container.getBoundingClientRect()
      const sx = startPointRef.current.x
      const sy = startPointRef.current.y

      // Viewport-space rect for hit-testing (using clientX/Y)
      const viewLeft = Math.min(e.clientX, sx)
      const viewTop = Math.min(e.clientY, sy)
      const viewRight = Math.max(e.clientX, sx)
      const viewBottom = Math.max(e.clientY, sy)

      // Container-relative rect for rendering (accounts for scroll)
      const renderRect: MarqueeRect = {
        left: Math.min(e.clientX, sx) - containerRect.left + container.scrollLeft,
        top: Math.min(e.clientY, sy) - containerRect.top + container.scrollTop,
        width: Math.abs(dx),
        height: Math.abs(dy),
      }

      setMarqueeRect(renderRect)

      // Throttle hit-testing with rAF
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!container) return

        const items = container.querySelectorAll(itemSelector)
        const newSelection = new Set(baseSelectionRef.current)

        items.forEach((item) => {
          const r = item.getBoundingClientRect()
          // Hit-test in viewport space
          const hit = !(
            r.right < viewLeft ||
            r.left > viewRight ||
            r.bottom < viewTop ||
            r.top > viewBottom
          )
          const path = (item as HTMLElement).dataset.filePath
          if (!path) return
          if (hit) {
            newSelection.add(path)
          } else if (!baseSelectionRef.current.has(path)) {
            newSelection.delete(path)
          }
        })

        onSelectionChange(newSelection)
      })
    }

    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      startPointRef.current = null
      isActiveRef.current = false
      setMarqueeRect(null)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, itemSelector, onSelectionChange])

  return { marqueeRect, handleMouseDown, handleContainerClick }
}
