import { fsApi } from '@/lib/storageApi'
import type { AppConfig, EditorTab } from '@/types'

export const manifest: AppConfig = {
  id: 'editor',
  name: '文本编辑器',
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
      label: '文件',
      items: [
        { label: '保存', shortcut: '⌘S', action: 'save' },
      ],
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', shortcut: '⌘Z', action: 'undo' },
        { label: '重做', shortcut: '⇧⌘Z', action: 'redo', dividerAfter: true },
        { label: '剪切', shortcut: '⌘X', action: 'cut' },
        { label: '复制', shortcut: '⌘C', action: 'copy' },
        { label: '粘贴', shortcut: '⌘V', action: 'paste' },
        { label: '全选', shortcut: '⌘A', action: 'selectAll' },
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
      label: '文本编辑器',
      icon: 'FileCode',
    },
  ],
  openFile: async (file, ctx) => {
    const nodeId = file.nodeId || 'local_1'
    const MAX_EDIT_SIZE = 16 * 1024 * 1024
    if (file.size > MAX_EDIT_SIZE) {
      return { ok: false, message: `文件太大（${(file.size / 1024 / 1024).toFixed(1)}MB），不支持打开编辑，最大支持 16MB` }
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
        ctx.updateWindowTitle(existing.id, `${newTabs.length} 个文件`)
        ctx.activateWindow(existing.id)
        return { ok: true }
      } catch {
        return { ok: false, message: '加载文件失败' }
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
      return { ok: false, message: '加载文件失败' }
    }
  },
}
