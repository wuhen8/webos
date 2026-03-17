import type { WidgetDefinition } from '@/stores/widgetStore'
import { ClockWidget } from './ClockWidget'

export const clockWidgetDefinition: WidgetDefinition = {
  type: 'clock',
  name: '时钟',
  icon: 'Clock',
  description: '显示当前时间和日期',
  defaultSize: { width: 280, height: 140 },
  minSize: { width: 200, height: 100 },
  maxSize: { width: 400, height: 200 },
  component: ClockWidget,
  configSchema: {
    show24Hour: { type: 'boolean', label: '24小时制', default: true },
    showSeconds: { type: 'boolean', label: '显示秒数', default: true },
    showDate: { type: 'boolean', label: '显示日期', default: true },
  },
}
