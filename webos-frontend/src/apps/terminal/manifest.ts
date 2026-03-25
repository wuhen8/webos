import type { AppConfig } from '@/types'
import type { TerminalTab } from '@/types'

export const manifest: AppConfig = {
  id: 'terminal',
  name: 'i18n:apps.terminal.name',
  icon: 'TerminalSquare',
  gradient: 'from-gray-700 to-gray-900',
  shadow: 'shadow-gray-800/30',
  defaultSize: { width: 720, height: 450 },
  defaultPosition: { xOffset: 100, yOffset: 100 },
  singleton: false,
  autoNumber: true,
  showInDock: true,
  dockOrder: 3,
  menus: [
    {
      label: 'i18n:apps.terminal.menu.shell',
      items: [
        { label: 'i18n:apps.terminal.menu.newWindow', shortcut: '⌘N', action: 'newTerminal' },
        { label: 'i18n:apps.terminal.menu.newTab', shortcut: '⌘T', action: 'newTerminalTab', dividerAfter: true },
        { label: 'i18n:apps.terminal.menu.manageSnippets', action: 'manageSnippets' },
      ],
    },
  ],
  defaultAppData: (options) => {
    const initialCommand = options?.initialCommand as string | undefined
    const defaultTab: TerminalTab = {
      id: `termtab-${Date.now()}`,
      title: initialCommand ? 'docker' : 'zsh',
      initialCommand,
    }
    return { terminalTabs: [defaultTab], activeTerminalTabIndex: 0 }
  },
}
