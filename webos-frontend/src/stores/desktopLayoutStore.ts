import { create } from 'zustand'
import type { FileInfo } from '@/types'
import type { Widget } from './widgetStore'

// 桌面项类型
export type DesktopItemType = 'file' | 'widget'

// 统一的桌面项（绝对像素坐标）
export interface DesktopItem {
  id: string
  type: DesktopItemType
  x: number  // 绝对像素 X 坐标
  y: number  // 绝对像素 Y 坐标
  width: number   // 像素宽度
  height: number  // 像素高度
  // 文件相关
  file?: FileInfo
  // 小组件相关
  widget?: Widget
}

interface DesktopLayoutStore {
  items: DesktopItem[]

  // Actions
  addItem: (item: DesktopItem) => void
  removeItem: (id: string) => void
  moveItem: (id: string, x: number, y: number, pushOthers?: boolean) => void
  updateItemSize: (id: string, width: number, height: number) => void
  getItemById: (id: string) => DesktopItem | undefined
  checkCollision: (item: DesktopItem, excludeId?: string) => DesktopItem[]
  findNearestFreePosition: (item: DesktopItem, preferredX: number, preferredY: number) => { x: number; y: number }
}

const TOP_BAR_HEIGHT = 30
const DOCK_HEIGHT = 70
const PADDING = 20
const PUSH_DISTANCE = 10 // 推开的距离

// 检查两个矩形是否重叠
function isOverlapping(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    rect1.x + rect1.width <= rect2.x ||
    rect2.x + rect2.width <= rect1.x ||
    rect1.y + rect1.height <= rect2.y ||
    rect2.y + rect2.height <= rect1.y
  )
}

// 计算两个矩形的重叠区域
function getOverlapArea(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x))
  const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y))
  return xOverlap * yOverlap
}

export const useDesktopLayoutStore = create<DesktopLayoutStore>((set, get) => ({
  items: [],

  addItem: (item) => {
    const state = get()

    // 检查是否已存在
    if (state.items.find(i => i.id === item.id)) {
      return
    }

    // 检查位置是否被占用
    const collisions = state.checkCollision(item)

    if (collisions.length > 0) {
      // 找到空闲位置
      const freePos = state.findNearestFreePosition(item, item.x, item.y)
      item = { ...item, x: freePos.x, y: freePos.y }
    }

    set((state) => ({
      items: [...state.items, item],
    }))
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter(item => item.id !== id),
    }))
  },

  moveItem: (id, x, y, pushOthers = true) => {
    const state = get()
    const item = state.items.find(i => i.id === id)
    if (!item) return

    const newItem = { ...item, x, y }

    if (pushOthers) {
      // 检查碰撞
      const collisions = state.checkCollision(newItem, id)

      if (collisions.length > 0) {
        // macOS 风格：把碰撞的项推开
        const updatedItems = state.items.map(i => {
          if (i.id === id) {
            return newItem
          }

          // 检查是否与新位置碰撞
          if (collisions.some(c => c.id === i.id)) {
            // 计算推开的方向
            const centerX1 = newItem.x + newItem.width / 2
            const centerY1 = newItem.y + newItem.height / 2
            const centerX2 = i.x + i.width / 2
            const centerY2 = i.y + i.height / 2

            const dx = centerX2 - centerX1
            const dy = centerY2 - centerY1

            // 根据相对位置决定推开方向
            let newX = i.x
            let newY = i.y

            if (Math.abs(dx) > Math.abs(dy)) {
              // 水平推开
              if (dx > 0) {
                newX = newItem.x + newItem.width + PUSH_DISTANCE
              } else {
                newX = newItem.x - i.width - PUSH_DISTANCE
              }
            } else {
              // 垂直推开
              if (dy > 0) {
                newY = newItem.y + newItem.height + PUSH_DISTANCE
              } else {
                newY = newItem.y - i.height - PUSH_DISTANCE
              }
            }

            // 确保不超出边界
            const maxX = window.innerWidth - i.width - PADDING
            const maxY = window.innerHeight - DOCK_HEIGHT - TOP_BAR_HEIGHT - i.height - PADDING
            newX = Math.max(PADDING, Math.min(newX, maxX))
            newY = Math.max(0, Math.min(newY, maxY))

            return { ...i, x: newX, y: newY }
          }

          return i
        })

        set({ items: updatedItems })
        return
      }
    }

    // 没有碰撞，直接更新
    set((state) => ({
      items: state.items.map(i => i.id === id ? newItem : i),
    }))
  },

  updateItemSize: (id, width, height) => {
    set((state) => ({
      items: state.items.map(i => i.id === id ? { ...i, width, height } : i),
    }))
  },

  getItemById: (id) => {
    return get().items.find(i => i.id === id)
  },

  checkCollision: (item, excludeId) => {
    const state = get()
    const rect1 = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    }

    return state.items.filter(other => {
      if (other.id === excludeId) return false

      const rect2 = {
        x: other.x,
        y: other.y,
        width: other.width,
        height: other.height,
      }

      return isOverlapping(rect1, rect2)
    })
  },

  findNearestFreePosition: (item, preferredX, preferredY) => {
    const state = get()
    const maxX = window.innerWidth - item.width - PADDING
    const maxY = window.innerHeight - DOCK_HEIGHT - TOP_BAR_HEIGHT - item.height - PADDING

    // 从首选位置开始，螺旋式搜索空闲位置
    const step = 20
    const maxRadius = Math.max(window.innerWidth, window.innerHeight)

    for (let radius = 0; radius < maxRadius; radius += step) {
      // 尝试四个方向
      const positions = [
        { x: preferredX + radius, y: preferredY },
        { x: preferredX - radius, y: preferredY },
        { x: preferredX, y: preferredY + radius },
        { x: preferredX, y: preferredY - radius },
        { x: preferredX + radius, y: preferredY + radius },
        { x: preferredX - radius, y: preferredY - radius },
        { x: preferredX + radius, y: preferredY - radius },
        { x: preferredX - radius, y: preferredY + radius },
      ]

      for (const pos of positions) {
        // 检查是否在边界内
        if (pos.x < PADDING || pos.y < 0) continue
        if (pos.x > maxX || pos.y > maxY) continue

        // 检查是否与其他项重叠
        const testItem = { ...item, x: pos.x, y: pos.y }
        const collisions = state.checkCollision(testItem, item.id)

        if (collisions.length === 0) {
          return pos
        }
      }
    }

    // 如果找不到空闲位置，返回首选位置
    return { x: preferredX, y: preferredY }
  },
}))

