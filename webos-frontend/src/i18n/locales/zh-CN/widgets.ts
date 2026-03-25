const widgets = {
  actions: {
    remove: '移除小组件',
  },
  clock: {
    name: '时钟',
    description: '显示当前时间和日期',
    config: {
      show24Hour: '24小时制',
      showSeconds: '显示秒数',
      showDate: '显示日期',
    },
  },
  weather: {
    name: '天气',
    description: '显示当前天气信息',
    conditions: {
      sunny: '晴天',
      cloudy: '多云',
      rainy: '雨天',
    },
  },
  systemMonitor: {
    name: '系统监控',
    description: '显示 CPU、内存、磁盘使用率和网速',
    metrics: {
      cpu: 'CPU',
      memory: '内存',
      disk: '磁盘',
    },
  },
} as const

export default widgets
