import { useState, useEffect, useCallback } from 'react'
import { request as wsRequest } from '@/stores/webSocketStore'
import { useWebSocketStore } from '@/stores'

// 侧边栏项目类型
export interface SidebarItem {
  id: string
  name: string
  icon: string
  path?: string
  nodeId?: string
  isDirectory?: boolean
  children?: SidebarItem[]
  sortOrder?: number
}

// 侧边栏配置类型
export interface SidebarConfig {
  items: SidebarItem[]
  expandedItems: string[]
}

const LS_EXPANDED_KEY = 'fm_sidebar_expanded'

function loadExpandedItems(): string[] {
  try {
    const raw = localStorage.getItem(LS_EXPANDED_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return ['home']
}

function saveExpandedItems(items: string[]) {
  try {
    localStorage.setItem(LS_EXPANDED_KEY, JSON.stringify(items))
  } catch {}
}

// 后端返回的树形结构转换为前端 SidebarItem
function mapApiItem(item: any): SidebarItem {
  return {
    id: item.id,
    name: item.name,
    icon: item.icon || 'file',
    path: item.path || undefined,
    nodeId: item.nodeId || undefined,
    isDirectory: !!(item.children && item.children.length > 0) || !!item.path,
    children: item.children?.map(mapApiItem) || [],
    sortOrder: item.sortOrder ?? 0,
  }
}

// 前端 SidebarItem 转换为后端 API 格式
function mapToApiItem(item: SidebarItem): any {
  return {
    id: item.id,
    name: item.name,
    icon: item.icon,
    path: item.path || null,
    nodeId: item.nodeId || '',
    sortOrder: item.sortOrder ?? 0,
    children: item.children?.map(mapToApiItem) || [],
  }
}

// 默认侧边栏配置（后端未返回数据时的 fallback）
const DEFAULT_ITEMS: SidebarItem[] = [
  {
    id: 'home',
    name: '个人收藏',
    icon: 'star',
    isDirectory: true,
    children: [],
  },
]

export const useSidebarConfig = () => {
  const [sidebarConfig, setSidebarConfig] = useState<SidebarConfig>({
    items: DEFAULT_ITEMS,
    expandedItems: loadExpandedItems(),
  })
  const [isLoading, setIsLoading] = useState(true)
  const subscribe = useWebSocketStore((s) => s.subscribe)

  // Subscribe to sidebar channel — initial push + live updates on change
  useEffect(() => {
    return subscribe("sub.sidebar", 0, (data: any) => {
      if (Array.isArray(data)) {
        setSidebarConfig(prev => ({
          items: data.length > 0 ? data.map(mapApiItem) : DEFAULT_ITEMS,
          expandedItems: prev.expandedItems,
        }))
      }
      setIsLoading(false)
    })
  }, [subscribe])

  // 保存配置到后端
  const saveSidebarConfig = useCallback(async (config: SidebarConfig) => {
    try {
      await wsRequest('settings.sidebar_save', { items: config.items.map(mapToApiItem) })
      setSidebarConfig(config)
    } catch (error) {
      console.error('Failed to save sidebar config:', error)
      throw error
    }
  }, [])

  // 添加收藏项
  const addFavorite = useCallback(async (file: { name: string; path: string; isDir: boolean; nodeId?: string }) => {
    const newConfig = {
      ...sidebarConfig,
      items: sidebarConfig.items.map(item =>
        item.id === 'home'
          ? {
              ...item,
              children: [
                ...(item.children || []),
                {
                  id: `fav-${file.nodeId || 'local_1'}-${file.path}`,
                  name: file.name,
                  icon: file.isDir ? 'folder' : 'file',
                  path: file.path,
                  nodeId: file.nodeId || 'local_1',
                  isDirectory: file.isDir,
                },
              ],
            }
          : item
      ),
    }
    await saveSidebarConfig(newConfig)
    return newConfig
  }, [sidebarConfig, saveSidebarConfig])

  // 删除收藏项
  const removeFavorite = useCallback(async (itemId: string) => {
    const newConfig = {
      ...sidebarConfig,
      items: sidebarConfig.items.map(item =>
        item.id === 'home'
          ? {
              ...item,
              children: (item.children || []).filter(child => child.id !== itemId),
            }
          : item
      ),
    }
    await saveSidebarConfig(newConfig)
    return newConfig
  }, [sidebarConfig, saveSidebarConfig])

  // 收藏项排序
  const reorderFavorites = useCallback(async (fromIndex: number, toIndex: number) => {
    const homeItem = sidebarConfig.items.find(item => item.id === 'home')
    if (!homeItem?.children) return
    const children = [...homeItem.children]
    const [moved] = children.splice(fromIndex, 1)
    children.splice(toIndex, 0, moved)
    const newConfig = {
      ...sidebarConfig,
      items: sidebarConfig.items.map(item =>
        item.id === 'home' ? { ...item, children } : item
      ),
    }
    await saveSidebarConfig(newConfig)
    return newConfig
  }, [sidebarConfig, saveSidebarConfig])

  // 重命名侧边栏项目
  const renameItem = useCallback(async (itemId: string, newName: string) => {
    const updateItems = (items: SidebarItem[]): SidebarItem[] => {
      return items.map(item => {
        if (item.id === itemId) return { ...item, name: newName }
        if (item.children) return { ...item, children: updateItems(item.children) }
        return item
      })
    }
    const newConfig = {
      ...sidebarConfig,
      items: updateItems(sidebarConfig.items),
    }
    await saveSidebarConfig(newConfig)
    return newConfig
  }, [sidebarConfig, saveSidebarConfig])

  // 切换展开状态（纯前端，不需要后端持久化）
  const toggleExpand = useCallback(async (itemId: string) => {
    setSidebarConfig(prev => {
      const isExpanded = prev.expandedItems.includes(itemId)
      const newExpanded = isExpanded
        ? prev.expandedItems.filter(id => id !== itemId)
        : [...prev.expandedItems, itemId]
      saveExpandedItems(newExpanded)
      return { ...prev, expandedItems: newExpanded }
    })
  }, [])

  // 重置为默认配置
  const resetToDefault = useCallback(async () => {
    const defaultConfig: SidebarConfig = {
      items: DEFAULT_ITEMS,
      expandedItems: ['home'],
    }
    saveExpandedItems(['home'])
    await saveSidebarConfig(defaultConfig)
    return defaultConfig
  }, [saveSidebarConfig])

  return {
    sidebarConfig,
    isLoading,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    renameItem,
    toggleExpand,
    resetToDefault,
    saveSidebarConfig,
  }
}
