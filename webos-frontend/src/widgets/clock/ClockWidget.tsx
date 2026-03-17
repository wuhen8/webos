import { useState, useEffect } from 'react'
import type { WidgetProps } from '@/stores/widgetStore'

export function ClockWidget({ widget, onUpdateConfig }: WidgetProps) {
  const [time, setTime] = useState(new Date())
  const show24Hour = widget.config.show24Hour ?? true
  const showSeconds = widget.config.showSeconds ?? true
  const showDate = widget.config.showDate ?? true

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = () => {
    const hours = show24Hour ? time.getHours() : time.getHours() % 12 || 12
    const minutes = time.getMinutes().toString().padStart(2, '0')
    const seconds = time.getSeconds().toString().padStart(2, '0')
    const ampm = show24Hour ? '' : ` ${time.getHours() >= 12 ? 'PM' : 'AM'}`

    if (showSeconds) {
      return `${hours}:${minutes}:${seconds}${ampm}`
    }
    return `${hours}:${minutes}${ampm}`
  }

  const formatDate = () => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
    return time.toLocaleDateString('zh-CN', options)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      <div className="text-4xl font-light text-slate-800 tracking-wider">
        {formatTime()}
      </div>
      {showDate && (
        <div className="text-sm text-slate-600 mt-2">
          {formatDate()}
        </div>
      )}
    </div>
  )
}
