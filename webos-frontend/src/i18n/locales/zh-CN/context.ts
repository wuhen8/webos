const context = {
        desktop: {
          openFileManager: '打开文件管理器',
          openEditor: '打开编辑器',
          addWidget: '添加小组件',
          clock: '时钟',
          weather: '天气',
          systemMonitor: '系统监控',
          githubRepo: 'GitHub 仓库',
          openClipboard: '打开剪切板',
          logout: '退出登录',
        },
        window: {
          minimize: '最小化',
          maximize: '{{maximizeLabel}}',
          maximizeAction: '最大化',
          restoreAction: '还原',
          newWindow: '新建窗口',
          removeFromDock: '从 Dock 中移除',
          quit: '退出',
          openGithubRepo: '打开 GitHub 仓库',
          copyLink: '复制链接',
          reload: '刷新',
          openInBrowser: '在浏览器中打开',
        },
      } as const

export default context
