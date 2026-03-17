import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Widget, WidgetDefinition } from '@/stores/widgetStore'
import type { DesktopItem } from '@/stores/desktopLayoutStore'
import { useDesktopLayoutStore } from '@/stores/desktopLayoutStore'
import { useWidgetStore } from '@/stores/widgetStore'
import { useUIStore } from '@/stores'
import { useDraggable } from '@/hooks/useDraggable'

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70

interface DesktopWidgetProps {
  item: DesktopItem
  widget: Widget
  definition: WidgetDefinition
  position: { x: number; y: number }
}

export function DesktopWidget({ item, widget, definition, position }: DesktopWidgetProps) {
  const moveItem = useDesktopLayoutStore((s) => s.moveItem)
  const updateItemSize = useDesktopLayoutStore((s) => s.updateItemSize)

  const removeWidget = useWidgetStore((s) => s.removeWidget)
  const updateWidget = useWidgetStore((s) => s.updateWidget)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)

  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const { isDragging, position: dragPosition, handleMouseDown } = useDraggable({
    initialPosition: position,
    disabled: false,
    onDragEnd: (x, y) => {
      moveItem(item.id, x, y)
      // 同步更新 widget 的像素位置
      updateWidget(widget.id, { position: { x, y } })
    },
    bounds: {
      left: 0,
      top: 0,
      right: window.innerWidth - widget.size.width,
      bottom: window.innerHeight - DOCK_HEIGHT - TOP_BAR_HEIGHT - widget.size.height,
    },
  })

  const displayPosition = isDragging ? dragPosition : position

  const WidgetComponent = definition.component

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: widget.size.width,
      height: widget.size.height,
    })
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y

      const newWidth = Math.max(definition.minSize.width, resizeStart.width + deltaX)
      const newHeight = Math.max(definition.minSize.height, resizeStart.height + deltaY)

      // 更新 widget 尺寸
      updateWidget(widget.id, { size: { width: newWidth, height: newHeight } })

      // 更新布局项的像素尺寸
      updateItemSize(item.id, newWidth, newHeight)
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
  }, [isResizing, resizeStart, widget.id, item.id, definition.minSize, updateWidget, updateItemSize])

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

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute rounded-2xl shadow-2xl overflow-hidden pointer-events-auto cursor-move desktop-item"
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
        width: widget.size.width,
        height: widget.size.height,
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(60px) saturate(180%)',
        WebkitBackdropFilter: 'blur(60px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.1)',
      }}
      onMouseDown={(e) => {
        handleMouseDown(e)
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="h-full overflow-hidden">
        <WidgetComponent widget={widget} onUpdateConfig={handleUpdateConfig} />
      </div>

      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
        onMouseDown={handleResizeStart}
      >
        <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400/60 rounded-br" />
      </div>
    </motion.div>
  )
}
