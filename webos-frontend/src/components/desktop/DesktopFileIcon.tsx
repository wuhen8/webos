import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { FileInfo } from '@/types'
import type { DesktopItem } from '@/stores/desktopLayoutStore'
import { useDesktopLayoutStore } from '@/stores/desktopLayoutStore'
import { useWindowStore } from '@/stores/windowStore'
import { useUIStore } from '@/stores'
import { useEditorStore } from '@/apps/editor/store'
import { getFileIconConfig } from '@/utils'
import { getContextMenu } from '@/config/appRegistry'
import { useDraggable } from '@/hooks/useDraggable'

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70
const PADDING = 20

interface DesktopFileIconProps {
  item: DesktopItem
  file: FileInfo
  position: { x: number; y: number }
  isSelected: boolean
  onSelect: (name: string, multi: boolean) => void
}

export function DesktopFileIcon({ item, file, position, isSelected, onSelect }: DesktopFileIconProps) {
  const moveItem = useDesktopLayoutStore((s) => s.moveItem)

  const openWindow = useWindowStore((s) => s.openWindow)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const findOrCreateEditorWindow = useEditorStore((s) => s.findOrCreateEditorWindow)

  // 动态计算边界
  const bounds = useMemo(() => ({
    left: PADDING,
    top: 0,
    right: Math.max(PADDING, window.innerWidth - item.width - PADDING),
    bottom: Math.max(0, window.innerHeight - DOCK_HEIGHT - TOP_BAR_HEIGHT - item.height - PADDING),
  }), [item.width, item.height])

  // 约束位置在边界内
  const constrainedPosition = {
    x: Math.max(bounds.left, Math.min(position.x, bounds.right)),
    y: Math.max(bounds.top, Math.min(position.y, bounds.bottom)),
  }

  const handleDragEnd = useCallback((x: number, y: number) => {
    moveItem(item.id, x, y)
  }, [item.id, moveItem])

  const { isDragging, position: dragPosition, handleMouseDown } = useDraggable({
    initialPosition: constrainedPosition,
    onDragEnd: handleDragEnd,
    bounds,
  })

  const displayPosition = isDragging ? dragPosition : constrainedPosition

  const iconConfig = getFileIconConfig(file)
  const Icon = iconConfig.icon

  const handleOpen = useCallback(() => {
    if (file.isDir) {
      openWindow('fileManager', {
        appDataOptions: {
          initialPath: file.path,
          nodeId: 'local_1',
        },
      })
    } else {
      findOrCreateEditorWindow({ ...file, nodeId: 'local_1' }).then(res => {
        if (!res.ok && res.message) {
          console.error('[Desktop] Failed to open file:', res.message)
        }
      })
    }
  }, [file, openWindow, findOrCreateEditorWindow])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const menuConfig = getContextMenu('fileManager', 'file')
    openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: menuConfig,
      context: {
        selectedFiles: [file],
        selectedCount: 1,
      },
      onAction: (action: string) => {
        console.log('Desktop file action:', action, file)
        closeGlobalMenu()
      },
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`absolute flex flex-col items-center cursor-pointer select-none group pointer-events-auto desktop-item ${
        isDragging ? 'z-50' : 'z-10'
      }`}
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
        width: item.width,
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation()
          onSelect(file.name, e.metaKey || e.ctrlKey || e.shiftKey)
          handleMouseDown(e)
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        handleOpen()
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="relative mb-3">
        {isSelected && (
          <div className="absolute inset-0 -m-2 rounded-xl border-2 border-blue-500 pointer-events-none" />
        )}
        <div
          className={`w-12 h-12 flex items-center justify-center rounded-lg transition-all ${
            isSelected
              ? 'bg-white/30'
              : 'bg-white/20 group-hover:bg-white/30'
          }`}
        >
          <Icon className={`w-7 h-7 ${iconConfig.className.replace(/h-\d+\s+w-\d+/, '').trim()}`} />
        </div>
      </div>

      <div
        className={`text-xs text-center px-1 py-0.5 rounded max-w-full break-words line-clamp-2 ${
          isSelected
            ? 'bg-blue-500/80 text-white'
            : 'bg-black/40 text-white group-hover:bg-black/50'
        }`}
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
      >
        {file.name}
      </div>
    </motion.div>
  )
}
