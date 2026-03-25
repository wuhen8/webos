const menu = {
        apple: {
          aboutThisMachine: '关于本机',
          systemSettings: '系统设置...',
          sleep: '睡眠',
          restart: '重新启动...',
          shutdown: '关机...',
          lockScreen: '锁定屏幕',
          logout: '退出登录...',
        },
        window: {
          title: '窗口',
          minimize: '最小化',
          zoom: '缩放',
          openWindows: '已打开的窗口',
          minimizedSuffix: '（已最小化）',
        },
        help: {
          title: '帮助',
          search: '搜索',
          aboutWebOS: '关于 WebOS',
        },
      } as const

export default menu
