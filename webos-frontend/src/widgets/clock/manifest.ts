import i18n from '@/i18n'
import type { WidgetDefinition } from '@/stores/widgetStore'
import { ClockWidget } from './ClockWidget'

export const clockWidgetDefinition: WidgetDefinition = {
  type: 'clock',
  name: i18n.t('widgets.clock.name'),
  icon: 'Clock',
  description: i18n.t('widgets.clock.description'),
  defaultSize: { width: 280, height: 140 },
  minSize: { width: 200, height: 100 },
  maxSize: { width: 400, height: 200 },
  component: ClockWidget,
  configSchema: {
    show24Hour: { type: 'boolean', label: i18n.t('widgets.clock.config.show24Hour'), default: true },
    showSeconds: { type: 'boolean', label: i18n.t('widgets.clock.config.showSeconds'), default: true },
    showDate: { type: 'boolean', label: i18n.t('widgets.clock.config.showDate'), default: true },
  },
}
