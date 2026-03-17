import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileInfo } from '@/types'
import { useDesktopStore } from '@/stores/desktopStore'
import { useDraggable } from '@/hooks/useDraggable'
import { fsService } from '@/lib/services'
import { useWindowStore } from '@/stores/windowStore'
import { useUIStore, useWebSocketStore } from '@/stores'
import { getFileIconConfig } from '@/utils'
import { getContextMenu } from '@/config/appRegistry'
import { useEditorStore } from '@/apps/editor/store'

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70
const PADDING = 20

interface DesktopIconProps {
  file: FileInfo
  position: { x: number; y: number }
  gridSize: number
  isSelected: boolean
  onSelect: (name: string, multi: boolean) => void
  onOpen: (file: FileInfo) => void
}

function DesktopIcon({ file, position, gridSize, isSelected, onSelect, onOpen }: DesktopIconProps) {
  const updateIconPosition = useDesktopStore((s) => s.updateIconPosition)
  const [localPosition, setLocalPosition] = useState(position)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)

  const { isDragging, position: dragPosition, handleMouseDown } = useDraggable({
    initialPosition: position,
    onDragEnd: (x, y) => {
      // 计算网格位置
      const gridX = Math.round((x - PADDING) / gridSize)
      const gridY = Math.round((y - TOP_BAR_HEIGHT) / gridSize)
      const snappedX = PADDING + gridX * gridSize
      const snappedY = TOP_BAR_HEIGHT + gridY * gridSize

      setLocalPosition({ x: snappedX, y: snappedY })
      updateIconPosition(file.name, { x: snappedX, y: snappedY, gridX, gridY })
    },
    bounds: {
      left: PADDING,
      top: TOP_BAR_HEIGHT,  // 移除 PADDING，可以拖到顶部菜单栏下方
      right: window.innerWidth - gridSize - PADDING,
      bottom: window.innerHeight - DOCK_HEIGHT - gridSize - PADDING,
    },
  })

  // 同步外部位置变化
  useEffect(() => {
    if (!isDragging) {
      setLocalPosition(position)
    }
  }, [position, isDragging])

  const displayPosition = isDragging ? dragPosition : localPosition

  // 获取文件图标（复用文件管理器的逻辑）
  const iconConfig = getFileIconConfig(file)
  const Icon = iconConfig.icon

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
      className={`absolute flex flex-col items-center cursor-pointer select-none group pointer-events-auto ${
        isDragging ? 'z-50' : 'z-10'
      }`}
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
        width: gridSize,
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation()  // 阻止事件冒泡
          onSelect(file.name, e.metaKey || e.ctrlKey || e.shiftKey)
          handleMouseDown(e)
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen(file)
      }}
      onClick={(e) => {
        e.stopPropagation()  // 也阻止 click 事件冒泡
      }}
      onContextMenu={handleContextMenu}
    >
      {/* 选中背景 */}
      {isSelected && (
        <div className="absolute inset-0 -m-1 bg-blue-400/20 rounded-lg border border-blue-400/40 backdrop-blur-sm" />
      )}

      {/* 图标 */}
      <div
        className={`relative w-12 h-12 mb-1 flex items-center justify-center rounded-lg transition-all ${
          isSelected
            ? 'bg-white/40 shadow-lg'
            : 'bg-white/20 group-hover:bg-white/30 group-hover:shadow-md'
        }`}
      >
        <Icon className={`w-7 h-7 ${iconConfig.className.replace(/h-\d+\s+w-\d+/, '').trim()}`} />
      </div>

      {/* 文件名 */}
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

export function DesktopIconGrid() {
  const desktopFiles = useDesktopStore((s) => s.desktopFiles)
  const iconPositions = useDesktopStore((s) => s.iconPositions)
  const gridSize = useDesktopStore((s) => s.gridSize)
  const setDesktopFiles = useDesktopStore((s) => s.setDesktopFiles)
  const autoArrangeIcons = useDesktopStore((s) => s.autoArrangeIcons)

  const openWindow = useWindowStore((s) => s.openWindow)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const wsConnected = useWebSocketStore((s) => s.connected)
  const findOrCreateEditorWindow = useEditorStore((s) => s.findOrCreateEditorWindow)
  const clearSelectionSignal = useUIStore((s) => s.clearSelectionSignal)

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // 监听清除选中信号
  useEffect(() => {
    if (clearSelectionSignal > 0) {
      setSelectedFiles(new Set())
    }
  }, [clearSelectionSignal])

  // 监听 Desktop 文件夹
  useEffect(() => {
    const nodeId = 'local_1'
    const desktopPath = '~/Desktop'
    let unwatchFn: (() => void) | undefined

    if (!wsConnected) {
      console.log('[Desktop] WebSocket not connected, waiting...')
      return
    }

    console.log('[Desktop] Loading files from:', nodeId, desktopPath)

    // 初始加载
    fsService.list(nodeId, desktopPath)
      .then(files => {
        console.log('[Desktop] Files loaded:', files.length, 'files')
        setDesktopFiles(files)
      })
      .catch(err => {
        console.error('[Desktop] Failed to load files:', err)
      })

    // 监听文件变化
    unwatchFn = fsService.watch(nodeId, desktopPath, (files) => {
      console.log('[Desktop] Files updated:', files.length, 'files')
      setDesktopFiles(files)
    })

    // 清理函数
    return () => {
      if (unwatchFn) {
        unwatchFn()
      }
    }
  }, [wsConnected, setDesktopFiles])

  // 自动排列图标（首次加载时）
  useEffect(() => {
    if (desktopFiles.length > 0 && Object.keys(iconPositions).length === 0) {
      autoArrangeIcons()
    }
  }, [desktopFiles.length, iconPositions, autoArrangeIcons])

  const handleSelect = useCallback((name: string, multi: boolean) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (multi) {
        if (next.has(name)) {
          next.delete(name)
        } else {
          next.add(name)
        }
      } else {
        next.clear()
        next.add(name)
      }
      return next
    })
  }, [])

  const handleOpen = useCallback((file: FileInfo) => {
    console.log('[Desktop] Opening file:', file)
    if (file.isDir) {
      // 打开文件管理器，进入该文件夹
      console.log('[Desktop] Opening folder:', file.path)
      openWindow('fileManager', {
        appDataOptions: {
          initialPath: file.path,
          nodeId: 'local_1',
        },
      })
    } else {
      // 使用 findOrCreateEditorWindow 自动选择合适的应用
      console.log('[Desktop] Opening file with findOrCreateEditorWindow')
      findOrCreateEditorWindow({ ...file, nodeId: 'local_1' }).then(res => {
        if (!res.ok && res.message) {
          console.error('[Desktop] Failed to open file:', res.message)
        }
      })
    }
  }, [openWindow, findOrCreateEditorWindow])

  const handleContextMenu = useCallback((e: React.MouseEvent, file?: FileInfo) => {
    e.preventDefault()
    e.stopPropagation()

    if (file) {
      // 文件右键菜单
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
  }, [openGlobalMenu, closeGlobalMenu])

  return (
    <div
      className="absolute inset-0 z-[5] pointer-events-none"
      style={{
        top: TOP_BAR_HEIGHT,
        bottom: DOCK_HEIGHT,
      }}
    >
      <AnimatePresence>
        {desktopFiles.map((file) => {
          const pos = iconPositions[file.name] || { x: PADDING, y: TOP_BAR_HEIGHT }
          return (
            <DesktopIcon
              key={file.name}
              file={file}
              position={pos}
              gridSize={gridSize}
              isSelected={selectedFiles.has(file.name)}
              onSelect={handleSelect}
              onOpen={handleOpen}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
