import { create } from 'zustand'

export interface Widget {
  id: string
  type: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: Record<string, any>
  zIndex: number
}

export interface WidgetDefinition {
  type: string
  name: string
  icon: string
  description: string
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
  maxSize?: { width: number; height: number }
  component: React.ComponentType<WidgetProps>
  configSchema?: any
}

export interface WidgetProps {
  widget: Widget
  onUpdateConfig: (config: Record<string, any>) => void
}

interface WidgetStore {
  widgets: Widget[]
  availableWidgets: WidgetDefinition[]
  nextZIndex: number

  // Actions
  addWidget: (type: string, position?: { x: number; y: number }) => void
  removeWidget: (id: string) => void
  updateWidget: (id: string, updates: Partial<Widget>) => void
  moveWidget: (id: string, position: { x: number; y: number }) => void
  resizeWidget: (id: string, size: { width: number; height: number }) => void
  bringToFront: (id: string) => void
  registerWidget: (definition: WidgetDefinition) => void
  loadWidgets: () => void
  saveWidgets: () => void
}

const STORAGE_KEY = 'widgets:instances'

let idSeq = 0

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  widgets: [],
  availableWidgets: [],
  nextZIndex: 1000,

  addWidget: (type, position) => {
    const definition = get().availableWidgets.find(w => w.type === type)
    if (!definition) {
      console.error(`Widget type "${type}" not found`)
      return
    }

    const id = `widget-${++idSeq}`
    const defaultPosition = position || {
      x: window.innerWidth / 2 - definition.defaultSize.width / 2,
      y: window.innerHeight / 2 - definition.defaultSize.height / 2,
    }

    const newWidget: Widget = {
      id,
      type,
      position: defaultPosition,
      size: definition.defaultSize,
      config: {},
      zIndex: get().nextZIndex,
    }

    set((state) => ({
      widgets: [...state.widgets, newWidget],
      nextZIndex: state.nextZIndex + 1,
    }))

    // 延迟保存
    setTimeout(() => get().saveWidgets(), 500)
  },

  removeWidget: (id) => {
    set((state) => ({
      widgets: state.widgets.filter(w => w.id !== id),
    }))
    get().saveWidgets()
  },

  updateWidget: (id, updates) => {
    set((state) => ({
      widgets: state.widgets.map(w =>
        w.id === id ? { ...w, ...updates } : w
      ),
    }))
    // 延迟保存
    setTimeout(() => get().saveWidgets(), 500)
  },

  moveWidget: (id, position) => {
    get().updateWidget(id, { position })
  },

  resizeWidget: (id, size) => {
    const widget = get().widgets.find(w => w.id === id)
    if (!widget) return

    const definition = get().availableWidgets.find(w => w.type === widget.type)
    if (!definition) return

    // 限制最小/最大尺寸
    const constrainedSize = {
      width: Math.max(
        definition.minSize.width,
        Math.min(size.width, definition.maxSize?.width || Infinity)
      ),
      height: Math.max(
        definition.minSize.height,
        Math.min(size.height, definition.maxSize?.height || Infinity)
      ),
    }

    get().updateWidget(id, { size: constrainedSize })
  },

  bringToFront: (id) => {
    set((state) => {
      const newZIndex = state.nextZIndex + 1
      return {
        widgets: state.widgets.map(w =>
          w.id === id ? { ...w, zIndex: newZIndex } : w
        ),
        nextZIndex: newZIndex,
      }
    })
  },

  registerWidget: (definition) => {
    set((state) => {
      // 避免重复注册
      if (state.availableWidgets.some(w => w.type === definition.type)) {
        return state
      }
      return {
        availableWidgets: [...state.availableWidgets, definition],
      }
    })
  },

  loadWidgets: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const widgets = JSON.parse(saved)
        set({ widgets })
      }
    } catch (err) {
      console.error('Failed to load widgets:', err)
    }
  },

  saveWidgets: () => {
    try {
      const { widgets } = get()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
    } catch (err) {
      console.error('Failed to save widgets:', err)
    }
  },
}))

// 初始化时加载小组件
useWidgetStore.getState().loadWidgets()
