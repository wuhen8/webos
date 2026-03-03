import type { AppConfig } from '@/types'
import type { FileManagerTab } from '@/types'

export const manifest: AppConfig = {
  id: 'fileManager',
  name: '文件管理',
  icon: 'Folder',
  gradient: 'from-blue-400 to-blue-600',
  shadow: 'shadow-blue-500/30',
  defaultSize: { width: 900, height: 600 },
  defaultPosition: { xOffset: 50, yOffset: 50 },
  singleton: false,
  backgroundable: true,
  showInDock: true,
  dockOrder: 1,
  menus: [
    {
      label: '文件',
      items: [
        { label: '新建文件窗口', shortcut: '⌘N', action: 'newFinderWindow' },
        { label: '分享管理...', action: 'manageShares' },
      ],
    },
    {
      label: '显示',
      items: [
        { label: '显示为图标', action: 'viewAsIcons' },
        { label: '显示为列表', action: 'viewAsList' },
      ],
    },
  ],
  contextMenus: {
    file: {
      id: 'fm-file',
      items: [
        { id: 'fm-file-header', type: 'header', label: '已选中 {{selectedCount}} 个项目', visible: 'multipleSelected' },
        { id: 'fm-file-open', label: '打开', icon: 'FolderOpen', action: 'fm.open' },
        { id: 'fm-file-open-with', label: '打开方式', icon: 'AppWindow', action: 'fm.openWith', visible: 'singleFile', children: [] },
        { id: 'fm-file-download', label: '下载', icon: 'Download', action: 'fm.download' },
        { id: 'fm-file-share', label: '分享链接', icon: 'Share2', action: 'fm.share', visible: 'singleFile', dividerAfter: true },
        { id: 'fm-file-extract', label: '解压到当前目录', icon: 'PackageOpen', action: 'fm.extract', visible: 'isArchive' },
        { id: 'fm-file-compress', label: '压缩为 ZIP', icon: 'Package', action: 'fm.compress', dividerAfter: true },
        { id: 'fm-file-copy', label: '复制', icon: 'Copy', action: 'fm.copy' },
        { id: 'fm-file-cut', label: '剪切', icon: 'Scissors', action: 'fm.cut', dividerAfter: true },
        { id: 'fm-file-rename', label: '重命名', icon: 'Edit2', action: 'fm.rename' },
        { id: 'fm-file-delete', label: '移到回收站', icon: 'Trash2', action: 'fm.delete', variant: 'danger', dividerAfter: true },
        { id: 'fm-file-info', label: '详细信息', icon: 'Info', action: 'fm.info' },
      ],
    },
    blank: {
      id: 'fm-blank',
      items: [
        { id: 'fm-blank-new-file', label: '新建文件', icon: 'FilePlus', action: 'fm.newFile' },
        { id: 'fm-blank-new-folder', label: '新建文件夹', icon: 'FolderPlus', action: 'fm.newFolder', dividerAfter: true },
        { id: 'fm-blank-upload', label: '上传文件', icon: 'Upload', action: 'fm.upload' },
        { id: 'fm-blank-offline-download', label: '离线下载', icon: 'Download', action: 'fm.offlineDownload' },
        { id: 'fm-blank-refresh', label: '刷新', icon: 'RefreshCw', action: 'fm.refresh' },
        { id: 'fm-blank-paste-divider', type: 'divider', visible: 'hasClipboard' },
        { id: 'fm-blank-paste', label: '粘贴 ({{clipboardCount}})', icon: 'ClipboardCopy', action: 'fm.paste', visible: 'hasClipboard' },
      ],
    },
    'sidebar-favorite': {
      id: 'sidebar-favorite',
      items: [
        { id: 'sidebar-remove-fav', label: '从收藏夹中移除', icon: 'Trash2', action: 'sidebar.removeFavorite', variant: 'danger' },
      ],
    },
  },
  defaultAppData: (options) => {
    const initialPath = (options?.initialPath as string) || '~'
    const nodeId = (options?.nodeId as string) || 'local_1'
    const showTrash = !!(options?.showTrash)
    const defaultTab: FileManagerTab = {
      id: `fmtab-${Date.now()}`,
      currentPath: initialPath,
      history: [initialPath],
      historyIndex: 0,
      files: [],
      selectedFiles: [],
      activeNodeId: nodeId,
      title: initialPath.split('/').filter(Boolean).pop() || '/',
    }
    return { fmTabs: [defaultTab], activeFmTabIndex: 0, showTrash }
  },
}
