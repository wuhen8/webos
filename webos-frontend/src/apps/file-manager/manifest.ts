import type { AppConfig } from '@/types'
import type { FileManagerTab } from '@/types'

export const manifest: AppConfig = {
  id: 'fileManager',
  name: 'i18n:apps.fileManager.name',
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
      label: 'i18n:apps.fileManager.menu.file',
      items: [
        { label: 'i18n:apps.fileManager.menu.newWindow', shortcut: '⌘N', action: 'newFinderWindow' },
        { label: 'i18n:apps.fileManager.menu.manageShares', action: 'manageShares' },
      ],
    },
    {
      label: 'i18n:apps.fileManager.menu.view',
      items: [
        { label: 'i18n:apps.fileManager.menu.viewAsIcons', action: 'viewAsIcons' },
        { label: 'i18n:apps.fileManager.menu.viewAsList', action: 'viewAsList' },
      ],
    },
  ],
  contextMenus: {
    file: {
      id: 'fm-file',
      items: [
        { id: 'fm-file-header', type: 'header', label: 'i18n:apps.fileManager.context.selectedItems', visible: 'multipleSelected' },
        { id: 'fm-file-open', label: 'i18n:apps.fileManager.context.open', icon: 'FolderOpen', action: 'fm.open' },
        { id: 'fm-file-open-with', label: 'i18n:apps.fileManager.context.openWith', icon: 'AppWindow', action: 'fm.openWith', visible: 'singleFile', children: [] },
        { id: 'fm-file-download', label: 'i18n:apps.fileManager.context.download', icon: 'Download', action: 'fm.download' },
        { id: 'fm-file-share', label: 'i18n:apps.fileManager.context.shareLink', icon: 'Share2', action: 'fm.share', visible: 'singleFile', dividerAfter: true },
        { id: 'fm-file-extract', label: 'i18n:apps.fileManager.context.extractHere', icon: 'PackageOpen', action: 'fm.extract', visible: 'isArchive' },
        { id: 'fm-file-compress', label: 'i18n:apps.fileManager.context.compressZip', icon: 'Package', action: 'fm.compress', dividerAfter: true },
        { id: 'fm-file-copy', label: 'i18n:apps.fileManager.context.copy', icon: 'Copy', action: 'fm.copy' },
        { id: 'fm-file-cut', label: 'i18n:apps.fileManager.context.cut', icon: 'Scissors', action: 'fm.cut', dividerAfter: true },
        { id: 'fm-file-rename', label: 'i18n:apps.fileManager.context.rename', icon: 'Edit2', action: 'fm.rename' },
        { id: 'fm-file-delete', label: 'i18n:apps.fileManager.context.moveToTrash', icon: 'Trash2', action: 'fm.delete', variant: 'danger', dividerAfter: true },
        { id: 'fm-file-info', label: 'i18n:apps.fileManager.context.getInfo', icon: 'Info', action: 'fm.info' },
      ],
    },
    blank: {
      id: 'fm-blank',
      items: [
        { id: 'fm-blank-new-file', label: 'i18n:apps.fileManager.blank.newFile', icon: 'FilePlus', action: 'fm.newFile' },
        { id: 'fm-blank-new-folder', label: 'i18n:apps.fileManager.blank.newFolder', icon: 'FolderPlus', action: 'fm.newFolder', dividerAfter: true },
        { id: 'fm-blank-upload', label: 'i18n:apps.fileManager.blank.upload', icon: 'Upload', action: 'fm.upload' },
        { id: 'fm-blank-offline-download', label: 'i18n:apps.fileManager.blank.offlineDownload', icon: 'Download', action: 'fm.offlineDownload' },
        { id: 'fm-blank-refresh', label: 'i18n:apps.fileManager.blank.refresh', icon: 'RefreshCw', action: 'fm.refresh' },
        { id: 'fm-blank-paste-divider', type: 'divider', visible: 'hasClipboard' },
        { id: 'fm-blank-paste', label: 'i18n:apps.fileManager.blank.paste', icon: 'ClipboardCopy', action: 'fm.paste', visible: 'hasClipboard' },
      ],
    },
    'sidebar-favorite': {
      id: 'sidebar-favorite',
      items: [
        { id: 'sidebar-remove-fav', label: 'i18n:apps.fileManager.sidebar.removeFavorite', icon: 'Trash2', action: 'sidebar.removeFavorite', variant: 'danger' },
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
