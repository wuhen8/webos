import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useDesktopLayoutStore } from '@/stores/desktopLayoutStore'
import { useDesktopStore } from '@/stores/desktopStore'
import { useWidgetStore } from '@/stores/widgetStore'
import { useWindowStore } from '@/stores/windowStore'
import { useUIStore, useWebSocketStore } from '@/stores'
import { useEditorStore } from '@/apps/editor/store'
import { fsService } from '@/lib/services'
import { DesktopFileIcon } from './DesktopFileIcon'
import { DesktopWidget } from './DesktopWidget'
import type { FileInfo } from '@/types'

// 自动注册所有小组件
import { clockWidgetDefinition } from '@/widgets/clock/manifest'
import { weatherWidgetDefinition } from '@/widgets/weather/manifest'
import { systemMonitorWidgetDefinition } from '@/widgets/system-monitor/manifest'

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70
const PADDING = 20

export function UnifiedDesktop() {
  const layoutItems = useDesktopLayoutStore((s) => s.items)
  const addLayoutItem = useDesktopLayoutStore((s) => s.addItem)
  const removeLayoutItem = useDesktopLayoutStore((s) => s.removeItem)

  const desktopFiles = useDesktopStore((s) => s.desktopFiles)
  const setDesktopFiles = useDesktopStore((s) => s.setDesktopFiles)

  const widgets = useWidgetStore((s) => s.widgets)
  const availableWidgets = useWidgetStore((s) => s.availableWidgets)
  const registerWidget = useWidgetStore((s) => s.registerWidget)
  const addWidget = useWidgetStore((s) => s.addWidget)

  const wsConnected = useWebSocketStore((s) => s.connected)
  const clearSelectionSignal = useUIStore((s) => s.clearSelectionSignal)

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // 注册内置小组件
  useEffect(() => {
    registerWidget(clockWidgetDefinition)
    registerWidget(weatherWidgetDefinition)
    registerWidget(systemMonitorWidgetDefinition)
  }, [registerWidget])

  // 监听添加小组件事件
  useEffect(() => {
    const handleAddWidget = (e: CustomEvent) => {
      const { type } = e.detail
      if (type) {
        addWidget(type)
      }
    }

    window.addEventListener('widget:add', handleAddWidget as EventListener)
    return () => {
      window.removeEventListener('widget:add', handleAddWidget as EventListener)
    }
  }, [addWidget])


  // 监听清除选中信号
  useEffect(() => {
    if (clearSelectionSignal > 0) {
      setSelectedFiles(new Set())
    }
  }, [clearSelectionSignal])

  // 加载 Desktop 文件夹
  useEffect(() => {
    const nodeId = 'local_1'
    const desktopPath = '~/Desktop'
    let unwatchFn: (() => void) | undefined

    if (!wsConnected) {
      return
    }

    fsService.list(nodeId, desktopPath)
      .then(files => {
        setDesktopFiles(files)
      })
      .catch(err => {
        console.error('[Desktop] Failed to load files:', err)
      })

    unwatchFn = fsService.watch(nodeId, desktopPath, (files) => {
      setDesktopFiles(files)
    })

    return () => {
      if (unwatchFn) {
        unwatchFn()
      }
    }
  }, [wsConnected, setDesktopFiles])

  // 同步文件到布局系统
  useEffect(() => {
    const currentLayoutIds = new Set(layoutItems.map(item => item.id))
    const fileIds = new Set(desktopFiles.map(f => `file-${f.name}`))

    // 移除已删除的文件
    layoutItems.forEach(item => {
      if (item.type === 'file' && !fileIds.has(item.id)) {
        removeLayoutItem(item.id)
      }
    })

    // 添加新文件（检查是否已存在）
    desktopFiles.forEach(file => {
      const id = `file-${file.name}`
      if (!currentLayoutIds.has(id)) {
        addLayoutItem({
          id,
          type: 'file',
          x: PADDING,
          y: PADDING,
          width: 90,
          height: 90,
          file,
        })
      }
    })
  }, [desktopFiles, addLayoutItem, removeLayoutItem])

  // 同步小组件到布局系统
  useEffect(() => {
    const currentLayoutIds = new Set(layoutItems.map(item => item.id))
    const widgetIds = new Set(widgets.map(w => `widget-${w.id}`))

    // 移除已删除的小组件
    layoutItems.forEach(item => {
      if (item.type === 'widget' && !widgetIds.has(item.id)) {
        removeLayoutItem(item.id)
      }
    })

    // 添加新小组件（检查是否已存在）
    widgets.forEach(widget => {
      const id = `widget-${widget.id}`
      if (!currentLayoutIds.has(id)) {
        addLayoutItem({
          id,
          type: 'widget',
          x: widget.position.x,
          y: widget.position.y,
          width: widget.size.width,
          height: widget.size.height,
          widget,
        })
      }
    })
  }, [widgets, addLayoutItem, removeLayoutItem])

  return (
    <div
      className="absolute inset-0 z-[5] pointer-events-none"
      style={{
        top: TOP_BAR_HEIGHT,
        bottom: DOCK_HEIGHT,
      }}
    >
      <AnimatePresence>
        {layoutItems.map((item) => {

          if (item.type === 'file' && item.file) {
            return (
              <DesktopFileIcon
                key={item.id}
                item={item}
                file={item.file}
                position={{ x: item.x, y: item.y }}
                isSelected={selectedFiles.has(item.file.name)}
                onSelect={(name, multi) => {
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
                }}
              />
            )
          }

          if (item.type === 'widget' && item.widget) {
            const definition = availableWidgets.find(w => w.type === item.widget!.type)
            if (!definition) return null

            return (
              <DesktopWidget
                key={item.id}
                item={item}
                widget={item.widget}
                definition={definition}
                position={{ x: item.x, y: item.y }}
              />
            )
          }

          return null
        })}
      </AnimatePresence>
    </div>
  )
}
