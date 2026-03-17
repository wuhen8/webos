import type { ContextMenuConfig } from '@/types'

// ── 系统级右键菜单（不归属任何 app） ──

// 桌面右键菜单
export const desktopContextMenu: ContextMenuConfig = {
  id: 'desktop',
  items: [
    {
      id: 'desktop-open-fm',
      label: '打开文件管理器',
      icon: 'Folder',
      action: 'desktop.openFileManager',
    },
    {
      id: 'desktop-open-editor',
      label: '打开编辑器',
      icon: 'FileCode',
      action: 'desktop.openEditor',
    },
    {
      id: 'desktop-divider-widgets',
      type: 'divider',
    },
    {
      id: 'desktop-add-widget',
      label: '添加小组件',
      icon: 'AppWindow',
      action: 'desktop.addWidget',
      children: [
        {
          id: 'widget.clock',
          label: '时钟',
          icon: 'Clock',
          action: 'desktop.addWidget',
        },
        {
          id: 'widget.weather',
          label: '天气',
          icon: 'Cloud',
          action: 'desktop.addWidget',
        },
        {
          id: 'widget.system-monitor',
          label: '系统监控',
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
      label: '打开剪切板',
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
      label: '退出登录',
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
      label: '最小化',
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
      label: '新建窗口',
      icon: 'Monitor',
      action: 'dock.newWindow',
    },
    {
      id: 'dock-divider-1',
      type: 'divider',
    },
    {
      id: 'dock-remove',
      label: '从 Dock 中移除',
      icon: 'Minus',
      action: 'dock.removeFromDock',
    },
    {
      id: 'dock-quit',
      label: '退出',
      icon: 'LogOut',
      action: 'dock.quit',
      variant: 'danger',
    },
  ],
}

// Webview 窗口标题栏右键菜单
export const webviewTitleBarContextMenu: ContextMenuConfig = {
  id: 'webview-titlebar',
  items: [
    {
      id: 'webview-titlebar-minimize',
      label: '最小化',
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
      label: '刷新',
      icon: 'RefreshCw',
      action: 'window.reload',
    },
    {
      id: 'webview-titlebar-divider-2',
      type: 'divider',
    },
    {
      id: 'webview-titlebar-open-browser',
      label: '在浏览器中打开',
      icon: 'Globe',
      action: 'window.openInBrowser',
    },
  ],
}
