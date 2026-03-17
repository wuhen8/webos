import type { WidgetDefinition } from '@/stores/widgetStore'
import { SystemMonitorWidget } from './SystemMonitorWidget'

export const systemMonitorWidgetDefinition: WidgetDefinition = {
  type: 'system-monitor',
  name: '系统监控',
  icon: 'Activity',
  description: '显示 CPU、内存、磁盘使用率和网速',
  defaultSize: { width: 240, height: 180 },
  minSize: { width: 200, height: 160 },
  maxSize: { width: 400, height: 300 },
  component: SystemMonitorWidget,
}
