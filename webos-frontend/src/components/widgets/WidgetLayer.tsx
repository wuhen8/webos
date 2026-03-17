import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useWidgetStore } from '@/stores/widgetStore'
import { WidgetContainer } from './WidgetContainer'

// 自动注册所有小组件
import { clockWidgetDefinition } from '@/widgets/clock/manifest'
import { weatherWidgetDefinition } from '@/widgets/weather/manifest'

export function WidgetLayer() {
  const widgets = useWidgetStore((s) => s.widgets)
  const registerWidget = useWidgetStore((s) => s.registerWidget)
  const addWidget = useWidgetStore((s) => s.addWidget)

  // 注册内置小组件
  useEffect(() => {
    registerWidget(clockWidgetDefinition)
    registerWidget(weatherWidgetDefinition)
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

  return (
    <div className="absolute inset-0 z-[10] pointer-events-none">
      <AnimatePresence>
        {widgets.map((widget) => (
          <WidgetContainer key={widget.id} widget={widget} />
        ))}
      </AnimatePresence>
    </div>
  )
}
