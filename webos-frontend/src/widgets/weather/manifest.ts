import i18n from '@/i18n'
import type { WidgetDefinition } from '@/stores/widgetStore'
import { WeatherWidget } from './WeatherWidget'

export const weatherWidgetDefinition: WidgetDefinition = {
  type: 'weather',
  name: i18n.t('widgets.weather.name'),
  icon: 'Cloud',
  description: i18n.t('widgets.weather.description'),
  defaultSize: { width: 200, height: 220 },
  minSize: { width: 180, height: 200 },
  maxSize: { width: 300, height: 300 },
  component: WeatherWidget,
}
