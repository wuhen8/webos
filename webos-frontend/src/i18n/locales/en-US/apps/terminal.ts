const terminal = {
          name: 'Terminal',
          menu: {
            shell: 'Shell',
            newWindow: 'New Window',
            newTab: 'New Tab',
            manageSnippets: 'Manage Snippets...',
          },
          tabBar: {
            newTab: 'New Tab',
          },
          toolbar: {
            show: 'Show quick action bar',
            hide: 'Hide quick action bar',
            tips: {
              autocomplete: 'Autocomplete',
              escape: 'Escape',
              previousCommand: 'Previous command',
              nextCommand: 'Next command',
              cursorLeft: 'Move cursor left',
              cursorRight: 'Move cursor right',
              lineStart: 'Start of line',
              lineEnd: 'End of line',
              pageUp: 'Page up',
              pageDown: 'Page down',
              pipe: 'Pipe',
            },
          },
          messages: {
            exited: 'Terminal process exited. Press Enter to reopen...',
            reconnected: 'Connection restored. Reopening terminal...',
            disconnected: 'Connection lost...',
          },
          snippets: {
            title: 'Manage Snippets',
            description: 'Add quick commands that will appear in the terminal toolbar',
            namePlaceholder: 'Name, e.g. View Logs',
            commandPlaceholder: 'Command, e.g. tail -f /var/log/syslog',
            add: 'Add',
            empty: 'No custom commands yet',
          },
        } as const

export default terminal
