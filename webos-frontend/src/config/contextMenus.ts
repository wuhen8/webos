import type { ContextMenuConfig } from '@/types'

// ── 系统级右键菜单（不归属任何 app） ──

// 桌面右键菜单
export const desktopContextMenu: ContextMenuConfig = {
  id: 'desktop',
  items: [
    {
      id: 'desktop-open-fm',
      label: 'i18n:context.desktop.openFileManager',
      icon: 'Folder',
      action: 'desktop.openFileManager',
    },
    {
      id: 'desktop-open-editor',
      label: 'i18n:context.desktop.openEditor',
      icon: 'FileCode',
      action: 'desktop.openEditor',
    },
    {
      id: 'desktop-divider-widgets',
      type: 'divider',
    },
    {
      id: 'desktop-add-widget',
      label: 'i18n:context.desktop.addWidget',
      icon: 'AppWindow',
      action: 'desktop.addWidget',
      children: [
        {
          id: 'widget.clock',
          label: 'i18n:context.desktop.clock',
          icon: 'Clock',
          action: 'desktop.addWidget',
        },
        {
          id: 'widget.weather',
          label: 'i18n:context.desktop.weather',
          icon: 'Cloud',
          action: 'desktop.addWidget',
        },
        {
          id: 'widget.system-monitor',
          label: 'i18n:context.desktop.systemMonitor',
          icon: 'Activity',
          action: 'desktop.addWidget',
        },
      ],
    },
    {
      id: 'desktop-divider-web',
      type: 'divider',
    },
    {
      id: 'desktop-open-github',
      label: 'i18n:context.desktop.githubRepo',
      icon: 'Github',
      action: 'desktop.openUrl',
      url: 'https://github.com/wuhen8/webos',
    },
    {
      id: 'desktop-open-clipboard',
      label: 'i18n:context.desktop.openClipboard',
      icon: 'Globe',
      action: 'desktop.openWebview',
      url: 'https://139.196.54.68/netcut/mc',
    },
    {
      id: 'desktop-divider-logout',
      type: 'divider',
    },
    {
      id: 'desktop-logout',
      label: 'i18n:context.desktop.logout',
      icon: 'LogOut',
      action: 'desktop.logout',
      variant: 'danger',
    },
  ],
}

// 窗口标题栏右键菜单
export const windowTitleBarContextMenu: ContextMenuConfig = {
  id: 'window-titlebar',
  items: [
    {
      id: 'titlebar-minimize',
      label: 'i18n:context.window.minimize',
      icon: 'Minus',
      action: 'window.minimize',
    },
    {
      id: 'titlebar-maximize',
      label: '{{maximizeLabel}}',
      icon: 'Square',
      action: 'window.maximize',
    },
  ],
}

// Dock 图标右键菜单
export const dockItemContextMenu: ContextMenuConfig = {
  id: 'dock-item',
  items: [
    {
      id: 'dock-new-window',
      label: 'i18n:context.window.newWindow',
      icon: 'Monitor',
      action: 'dock.newWindow',
    },
    {
      id: 'dock-divider-1',
      type: 'divider',
    },
    {
      id: 'dock-remove',
      label: 'i18n:context.window.removeFromDock',
      icon: 'Minus',
      action: 'dock.removeFromDock',
    },
    {
      id: 'dock-quit',
      label: 'i18n:context.window.quit',
      icon: 'LogOut',
      action: 'dock.quit',
      variant: 'danger',
    },
  ],
}

// GitHub Dock 图标右键菜单
export const githubDockContextMenu: ContextMenuConfig = {
  id: 'github-dock',
  items: [
    {
      id: 'github-open',
      label: 'i18n:context.window.openGithubRepo',
      icon: 'Globe',
      action: 'github.open',
    },
    {
      id: 'github-copy',
      label: 'i18n:context.window.copyLink',
      icon: 'Copy',
      action: 'github.copy',
    },
  ],
}

// Webview 窗口标题栏右键菜单
export const webviewTitleBarContextMenu: ContextMenuConfig = {
  id: 'webview-titlebar',
  items: [
    {
      id: 'webview-titlebar-minimize',
      label: 'i18n:context.window.minimize',
      icon: 'Minus',
      action: 'window.minimize',
    },
    {
      id: 'webview-titlebar-maximize',
      label: '{{maximizeLabel}}',
      icon: 'Square',
      action: 'window.maximize',
    },
    {
      id: 'webview-titlebar-divider',
      type: 'divider',
    },
    {
      id: 'webview-titlebar-reload',
      label: 'i18n:context.window.reload',
      icon: 'RefreshCw',
      action: 'window.reload',
    },
    {
      id: 'webview-titlebar-divider-2',
      type: 'divider',
    },
    {
      id: 'webview-titlebar-open-browser',
      label: 'i18n:context.window.openInBrowser',
      icon: 'Globe',
      action: 'window.openInBrowser',
    },
  ],
}
