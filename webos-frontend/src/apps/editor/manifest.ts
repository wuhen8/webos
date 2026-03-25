import { fsApi } from '@/lib/storageApi'
import i18n from '@/i18n'
import type { AppConfig, EditorTab } from '@/types'

export const manifest: AppConfig = {
  id: 'editor',
  name: 'i18n:apps.editor.name',
  icon: 'FileCode',
  gradient: 'from-purple-400 to-purple-600',
  shadow: 'shadow-purple-500/30',
  defaultSize: { width: 900, height: 650 },
  defaultPosition: { xOffset: 100, yOffset: 80 },
  singleton: false,
  showInDock: false,
  dockOrder: 2,
  menus: [
    {
      label: 'i18n:apps.editor.menu.file',
      items: [
        { label: 'i18n:apps.editor.menu.save', shortcut: '⌘S', action: 'save' },
      ],
    },
    {
      label: 'i18n:apps.editor.menu.edit',
      items: [
        { label: 'i18n:apps.editor.menu.undo', shortcut: '⌘Z', action: 'undo' },
        { label: 'i18n:apps.editor.menu.redo', shortcut: '⇧⌘Z', action: 'redo', dividerAfter: true },
        { label: 'i18n:apps.editor.menu.cut', shortcut: '⌘X', action: 'cut' },
        { label: 'i18n:apps.editor.menu.copy', shortcut: '⌘C', action: 'copy' },
        { label: 'i18n:apps.editor.menu.paste', shortcut: '⌘V', action: 'paste' },
        { label: 'i18n:apps.editor.menu.selectAll', shortcut: '⌘A', action: 'selectAll' },
      ],
    },
  ],
  fileAssociations: [
    {
      extensions: [
        '.txt', '.js', '.jsx', '.ts', '.tsx', '.json', '.py', '.go', '.java',
        '.cpp', '.c', '.h', '.css', '.html', '.xml', '.sql', '.sh', '.yaml',
        '.yml', '.toml', '.ini', '.conf', '.cfg', '.env', '.log', '.csv',
        '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.lua', '.r',
        '.pl', '.dockerfile', '.makefile','.md', '.gitignore',
        '.vlist', '.alist', '.m3u',
      ],
      label: 'i18n:apps.editor.fileAssociationLabel',
      icon: 'FileCode',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    const MAX_EDIT_SIZE = 16 * 1024 * 1024
    if (file.size > MAX_EDIT_SIZE) {
      return {
        ok: false,
        message: i18n.t('apps.editor.manifest.fileTooLarge', {
          size: (file.size / 1024 / 1024).toFixed(1),
          maxSize: 16,
        }),
      }
    }

    // Check for existing editor window
    const existing = ctx.findWindow(w => w.type === 'editor')

    if (existing) {
      const appData = ctx.getAppData(existing.id)
      const tabs = (appData.tabs || []) as EditorTab[]
      const existingTabIndex = tabs.findIndex((t: EditorTab) => t.file.path === file.path)

      if (existingTabIndex >= 0) {
        // File already open — switch to that tab
        ctx.updateAppData(existing.id, {
          activeTabIndex: existingTabIndex,
          file: tabs[existingTabIndex]?.file,
          content: tabs[existingTabIndex]?.content,
        })
        ctx.activateWindow(existing.id)
        return { ok: true }
      }

      // Add new tab to existing window
      try {
        const data = await fsApi.read(nodeId, file.path)
        const newTab: EditorTab = { file, content: data.content, isModified: false }
        const newTabs = [...tabs, newTab]
        ctx.updateAppData(existing.id, {
          tabs: newTabs,
          activeTabIndex: newTabs.length - 1,
          file,
          content: data.content,
        })
        ctx.updateWindowTitle(existing.id, i18n.t('apps.editor.store.titleMultiple', { count: newTabs.length }))
        ctx.activateWindow(existing.id)
        return { ok: true }
      } catch {
        return { ok: false, message: i18n.t('apps.editor.manifest.loadFailed') }
      }
    }

    // No existing editor — create new window
    try {
      const data = await fsApi.read(nodeId, file.path)
      ctx.createWindow({
        type: 'editor',
        title: file.name,
        appData: {
          file, content: data.content, isModified: false,
          tabs: [{ file, content: data.content, isModified: false }],
          activeTabIndex: 0,
        },
      })
      return { ok: true }
    } catch {
      return { ok: false, message: i18n.t('apps.editor.manifest.loadFailed') }
    }
  },
}
