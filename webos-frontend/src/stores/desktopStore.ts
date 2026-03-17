import { create } from 'zustand'
import type { FileInfo } from '@/types'

interface IconPosition {
  x: number
  y: number
  gridX: number
  gridY: number
}

interface DesktopStore {
  desktopFiles: FileInfo[]
  iconPositions: Record<string, IconPosition>
  iconSize: 'small' | 'medium' | 'large'
  gridSize: number  // 网格大小（像素）

  // Actions
  setDesktopFiles: (files: FileInfo[]) => void
  updateIconPosition: (fileName: string, position: IconPosition) => void
  loadIconPositions: () => void
  saveIconPositions: () => void
  setIconSize: (size: 'small' | 'medium' | 'large') => void
  autoArrangeIcons: () => void
}

const STORAGE_KEY = 'desktop:iconPositions'
const ICON_SIZE_KEY = 'desktop:iconSize'

// 根据图标大小计算网格尺寸
const getGridSize = (iconSize: 'small' | 'medium' | 'large'): number => {
  switch (iconSize) {
    case 'small': return 70
    case 'medium': return 90
    case 'large': return 110
    default: return 90
  }
}

export const useDesktopStore = create<DesktopStore>((set, get) => {
  // 从 localStorage 加载图标大小
  let savedIconSize: 'small' | 'medium' | 'large' = 'medium'
  try {
    const saved = localStorage.getItem(ICON_SIZE_KEY)
    if (saved === 'small' || saved === 'medium' || saved === 'large') {
      savedIconSize = saved
    }
  } catch {}

  return {
    desktopFiles: [],
    iconPositions: {},
    iconSize: savedIconSize,
    gridSize: getGridSize(savedIconSize),

    setDesktopFiles: (files) => {
      set({ desktopFiles: files })
      // 自动为新文件分配位置
      const { iconPositions, autoArrangeIcons } = get()
      const hasNewFiles = files.some(f => !iconPositions[f.name])
      if (hasNewFiles) {
        autoArrangeIcons()
      }
    },

    updateIconPosition: (fileName, position) => {
      set((state) => ({
        iconPositions: {
          ...state.iconPositions,
          [fileName]: position,
        },
      }))
      // 防抖保存
      const timeoutId = setTimeout(() => {
        get().saveIconPositions()
      }, 500)
      return () => clearTimeout(timeoutId)
    },

    loadIconPositions: () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const positions = JSON.parse(saved)
          set({ iconPositions: positions })
        }
      } catch (err) {
        console.error('Failed to load icon positions:', err)
      }
    },

    saveIconPositions: () => {
      try {
        const { iconPositions } = get()
        localStorage.setItem(STORAGE_KEY, JSON.stringify(iconPositions))
      } catch (err) {
        console.error('Failed to save icon positions:', err)
      }
    },

    setIconSize: (size) => {
      set({ iconSize: size, gridSize: getGridSize(size) })
      try {
        localStorage.setItem(ICON_SIZE_KEY, size)
      } catch {}
      // 重新排列图标以适应新的网格大小
      get().autoArrangeIcons()
    },

    autoArrangeIcons: () => {
      const { desktopFiles, iconPositions, gridSize } = get()
      const TOP_BAR_HEIGHT = 30
      const DOCK_HEIGHT = 70
      const PADDING = 20

      const availableWidth = window.innerWidth - PADDING * 2
      const availableHeight = window.innerHeight - TOP_BAR_HEIGHT - DOCK_HEIGHT - PADDING
      const cols = Math.floor(availableWidth / gridSize)
      const rows = Math.floor(availableHeight / gridSize)

      const newPositions: Record<string, IconPosition> = {}
      let currentCol = 0
      let currentRow = 0

      // 优先保留已有位置的文件
      const filesWithPosition = desktopFiles.filter(f => iconPositions[f.name])
      const filesWithoutPosition = desktopFiles.filter(f => !iconPositions[f.name])

      // 保留已有位置
      filesWithPosition.forEach(file => {
        newPositions[file.name] = iconPositions[file.name]
      })

      // 为新文件分配位置
      filesWithoutPosition.forEach(file => {
        // 找到第一个空闲的网格位置
        while (currentRow < rows) {
          const gridX = currentCol
          const gridY = currentRow
          const x = PADDING + currentCol * gridSize
          const y = TOP_BAR_HEIGHT + currentRow * gridSize  // 移除 PADDING

          // 检查该位置是否被占用
          const isOccupied = Object.values(newPositions).some(
            pos => pos.gridX === gridX && pos.gridY === gridY
          )

          if (!isOccupied) {
            newPositions[file.name] = { x, y, gridX, gridY }
            break
          }

          currentCol++
          if (currentCol >= cols) {
            currentCol = 0
            currentRow++
          }
        }

        currentCol++
        if (currentCol >= cols) {
          currentCol = 0
          currentRow++
        }
      })

      set({ iconPositions: newPositions })
      get().saveIconPositions()
    },
  }
})

// 初始化时加载位置
useDesktopStore.getState().loadIconPositions()
