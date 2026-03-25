const menu = {
        apple: {
          aboutThisMachine: 'About This Machine',
          systemSettings: 'System Settings...',
          sleep: 'Sleep',
          restart: 'Restart...',
          shutdown: 'Shut Down...',
          lockScreen: 'Lock Screen',
          logout: 'Log Out...',
        },
        window: {
          title: 'Window',
          minimize: 'Minimize',
          zoom: 'Zoom',
          openWindows: 'Open Windows',
          minimizedSuffix: ' (Minimized)',
        },
        help: {
          title: 'Help',
          search: 'Search',
          aboutWebOS: 'About WebOS',
        },
      } as const

export default menu
