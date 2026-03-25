const terminal = {
          name: '终端',
          menu: {
            shell: 'Shell',
            newWindow: '新建窗口',
            newTab: '新建标签页',
            manageSnippets: '管理快捷命令...',
          },
          tabBar: {
            newTab: '新建标签页',
          },
          toolbar: {
            show: '显示快捷操作栏',
            hide: '隐藏快捷操作栏',
            tips: {
              autocomplete: '自动补全',
              escape: 'Escape',
              previousCommand: '上一条命令',
              nextCommand: '下一条命令',
              cursorLeft: '光标左移',
              cursorRight: '光标右移',
              lineStart: '行首',
              lineEnd: '行尾',
              pageUp: '向上翻页',
              pageDown: '向下翻页',
              pipe: '管道符',
            },
          },
          messages: {
            exited: '终端进程已退出。按 Enter 重新打开...',
            reconnected: '连接已恢复，正在重新打开终端...',
            disconnected: '连接已断开...',
          },
          snippets: {
            title: '管理快捷命令',
            description: '添加快捷命令，将显示在终端工具栏中',
            namePlaceholder: '名称，如：查看日志',
            commandPlaceholder: '命令，如：tail -f /var/log/syslog',
            add: '添加',
            empty: '暂无自定义命令',
          },
        } as const

export default terminal
