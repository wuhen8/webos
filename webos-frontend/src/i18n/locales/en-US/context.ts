const context = {
        desktop: {
          openFileManager: 'Open File Manager',
          openEditor: 'Open Editor',
          addWidget: 'Add Widget',
          clock: 'Clock',
          weather: 'Weather',
          systemMonitor: 'System Monitor',
          githubRepo: 'GitHub Repository',
          openClipboard: 'Open Clipboard',
          logout: 'Log Out',
        },
        window: {
          minimize: 'Minimize',
          maximize: '{{maximizeLabel}}',
          maximizeAction: 'Maximize',
          restoreAction: 'Restore',
          newWindow: 'New Window',
          removeFromDock: 'Remove from Dock',
          quit: 'Quit',
          openGithubRepo: 'Open GitHub Repository',
          copyLink: 'Copy Link',
          reload: 'Reload',
          openInBrowser: 'Open in Browser',
        },
      } as const

export default context
