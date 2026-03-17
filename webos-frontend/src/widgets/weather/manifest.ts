import type { WidgetDefinition } from '@/stores/widgetStore'
import { WeatherWidget } from './WeatherWidget'

export const weatherWidgetDefinition: WidgetDefinition = {
  type: 'weather',
  name: '天气',
  icon: 'Cloud',
  description: '显示当前天气信息',
  defaultSize: { width: 200, height: 220 },
  minSize: { width: 180, height: 200 },
  maxSize: { width: 300, height: 300 },
  component: WeatherWidget,
}
