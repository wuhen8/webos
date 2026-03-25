const widgets = {
  actions: {
    remove: 'Remove Widget',
  },
  clock: {
    name: 'Clock',
    description: 'Display the current time and date',
    config: {
      show24Hour: '24-hour format',
      showSeconds: 'Show seconds',
      showDate: 'Show date',
    },
  },
  weather: {
    name: 'Weather',
    description: 'Display current weather information',
    conditions: {
      sunny: 'Sunny',
      cloudy: 'Cloudy',
      rainy: 'Rainy',
    },
  },
  systemMonitor: {
    name: 'System Monitor',
    description: 'Display CPU, memory, disk usage, and network speed',
    metrics: {
      cpu: 'CPU',
      memory: 'Memory',
      disk: 'Disk',
    },
  },
} as const

export default widgets
