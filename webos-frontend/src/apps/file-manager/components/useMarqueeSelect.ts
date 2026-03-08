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
  const additiveModeRef = useRef(false)
  const baseSelectionRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    // Only start on left button, on the container background (not on a file item)
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
    // Don't show rect yet — wait for a small drag threshold
  }, [containerRef, itemSelector, currentSelection, disabled])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!startPointRef.current) return

      const dx = e.clientX - startPointRef.current.x
      const dy = e.clientY - startPointRef.current.y

      // Activation threshold: 5px to avoid accidental marquee on simple clicks
      if (!isActiveRef.current) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        isActiveRef.current = true
      }

      const sx = startPointRef.current.x
      const sy = startPointRef.current.y
      const rect: MarqueeRect = {
        left: Math.min(e.clientX, sx),
        top: Math.min(e.clientY, sy),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }

      setMarqueeRect(rect)

      // Throttle hit-testing with rAF
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const container = containerRef.current
        if (!container) return

        const items = container.querySelectorAll(itemSelector)
        const newSelection = new Set(baseSelectionRef.current)

        items.forEach((item) => {
          const r = item.getBoundingClientRect()
          const hit = !(
            r.right < rect.left ||
            r.left > rect.left + rect.width ||
            r.bottom < rect.top ||
            r.top > rect.top + rect.height
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

  return { marqueeRect, handleMouseDown }
}
