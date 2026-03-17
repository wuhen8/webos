import { useState, useEffect } from 'react'
import { Cloud, CloudRain, Sun, Wind } from 'lucide-react'
import type { WidgetProps } from '@/stores/widgetStore'

export function WeatherWidget({ widget, onUpdateConfig }: WidgetProps) {
  const [weather, setWeather] = useState({
    temp: 22,
    condition: 'sunny',
    humidity: 65,
    windSpeed: 12,
  })

  // 模拟天气数据（实际应该从 API 获取）
  useEffect(() => {
    // TODO: 从天气 API 获取真实数据
    const mockWeather = {
      temp: Math.floor(Math.random() * 15) + 15,
      condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
      humidity: Math.floor(Math.random() * 40) + 40,
      windSpeed: Math.floor(Math.random() * 20) + 5,
    }
    setWeather(mockWeather)
  }, [])

  const getWeatherIcon = () => {
    switch (weather.condition) {
      case 'sunny':
        return <Sun className="w-12 h-12 text-yellow-500" />
      case 'cloudy':
        return <Cloud className="w-12 h-12 text-gray-500" />
      case 'rainy':
        return <CloudRain className="w-12 h-12 text-blue-500" />
      default:
        return <Sun className="w-12 h-12 text-yellow-500" />
    }
  }

  const getConditionText = () => {
    switch (weather.condition) {
      case 'sunny': return '晴天'
      case 'cloudy': return '多云'
      case 'rainy': return '雨天'
      default: return '晴天'
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 select-none">
      <div className="mb-3">
        {getWeatherIcon()}
      </div>
      <div className="text-3xl font-light text-slate-800 mb-1">
        {weather.temp}°C
      </div>
      <div className="text-sm text-slate-600 mb-3">
        {getConditionText()}
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span>💧</span>
          <span>{weather.humidity}%</span>
        </div>
        <div className="flex items-center gap-1">
          <Wind className="w-3 h-3" />
          <span>{weather.windSpeed}km/h</span>
        </div>
      </div>
    </div>
  )
}
