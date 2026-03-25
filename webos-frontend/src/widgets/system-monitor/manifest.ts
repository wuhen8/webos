import i18n from '@/i18n'
import type { WidgetDefinition } from '@/stores/widgetStore'
import { SystemMonitorWidget } from './SystemMonitorWidget'

export const systemMonitorWidgetDefinition: WidgetDefinition = {
  type: 'system-monitor',
  name: i18n.t('widgets.systemMonitor.name'),
  icon: 'Activity',
  description: i18n.t('widgets.systemMonitor.description'),
  defaultSize: { width: 240, height: 180 },
  minSize: { width: 200, height: 160 },
  maxSize: { width: 400, height: 300 },
  component: SystemMonitorWidget,
}
