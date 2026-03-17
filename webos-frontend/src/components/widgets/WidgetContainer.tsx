import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Widget } from '@/stores/widgetStore'
import { useWidgetStore } from '@/stores/widgetStore'
import { useUIStore } from '@/stores'
import { useDraggable } from '@/hooks/useDraggable'

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70

interface WidgetContainerProps {
  widget: Widget
}

export function WidgetContainer({ widget }: WidgetContainerProps) {
  const removeWidget = useWidgetStore((s) => s.removeWidget)
  const updateWidget = useWidgetStore((s) => s.updateWidget)
  const resizeWidget = useWidgetStore((s) => s.resizeWidget)
  const bringToFront = useWidgetStore((s) => s.bringToFront)
  const availableWidgets = useWidgetStore((s) => s.availableWidgets)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)

  // 提前检查 definition，避免在 hooks 之后 return
  const definition = availableWidgets.find(w => w.type === widget.type)

  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const { isDragging, position, handleMouseDown } = useDraggable({
    initialPosition: widget.position,
    disabled: false,  // 始终可以拖动
    onDragEnd: (x, y) => {
      updateWidget(widget.id, { position: { x, y } })
    },
    bounds: {
      left: 0,
      top: TOP_BAR_HEIGHT,
      right: window.innerWidth - widget.size.width,
      bottom: window.innerHeight - DOCK_HEIGHT - widget.size.height,
    },
  })

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!definition) return
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: widget.size.width,
      height: widget.size.height,
    })
    bringToFront(widget.id)
  }

  useEffect(() => {
    if (!isResizing || !definition) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y

      const newWidth = Math.max(definition.minSize.width, resizeStart.width + deltaX)
      const newHeight = Math.max(definition.minSize.height, resizeStart.height + deltaY)

      resizeWidget(widget.id, { width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeStart, widget.id, definition, resizeWidget])

  const handleUpdateConfig = (config: Record<string, any>) => {
    updateWidget(widget.id, { config })
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: {
        id: 'widget-menu',
        items: [
          {
            id: 'widget-remove',
            label: '移除小组件',
            icon: 'Trash2',
            action: 'widget.remove',
            variant: 'danger',
          },
        ],
      },
      context: { widgetId: widget.id },
      onAction: () => {
        removeWidget(widget.id)
        closeGlobalMenu()
      },
    })
  }

  console.log('[Widget] Render - isDragging:', isDragging)

  // 在所有 hooks 之后再检查并返回
  if (!definition) {
    return null
  }

  const WidgetComponent = definition.component

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute rounded-2xl shadow-2xl overflow-hidden pointer-events-auto cursor-move"
      style={{
        left: position.x,
        top: position.y,
        width: widget.size.width,
        height: widget.size.height,
        zIndex: widget.zIndex,
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(60px) saturate(180%)',
        WebkitBackdropFilter: 'blur(60px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.1)',
      }}
      onMouseDown={(e) => {
        bringToFront(widget.id)
        handleMouseDown(e)
      }}
      onContextMenu={handleContextMenu}
    >
      {/* 小组件内容 */}
      <div className="h-full overflow-hidden">
        <WidgetComponent widget={widget} onUpdateConfig={handleUpdateConfig} />
      </div>

      {/* 调整大小手柄 */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
        onMouseDown={handleResizeStart}
      >
        <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400/60 rounded-br" />
      </div>
    </motion.div>
  )
}
