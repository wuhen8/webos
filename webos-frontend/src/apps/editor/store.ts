import { create } from 'zustand'
import { fsApi } from '@/lib/storageApi'
import { getAppConfig } from '@/config/appRegistry'
import { getDefaultAppForExtension } from '@/config/fileAssociationRegistry'
import { wrapStateRef } from '@/stores/editorRefs'
import { useUIStore } from '@/stores/uiStore'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { createTabManager } from '@/hooks/useTabManager'
import type { FileInfo, EditorTab } from '@/types'
import { createElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import i18n from '@/i18n'

const editorTabMgr = createTabManager({
  tabsKey: 'tabs',
  activeIndexKey: 'activeTabIndex',
  getTitle: (tabs) => tabs.length > 1 ? i18n.t('apps.editor.store.titleMultiple', { count: tabs.length }) : (tabs[0]?.file?.name || i18n.t('apps.editor.store.titleSingle')),
  onSwitch: (tab) => tab ? { file: tab.file, content: tab.content } : {},
})

interface EditorStore {
  addNewEditorTab: (windowId: string) => void
  openNewEditor: () => void
  reorderEditorTabs: (windowId: string, fromIndex: number, toIndex: number) => void
  switchEditorTab: (windowId: string, tabIndex: number) => void
  closeEditorTab: (windowId: string, tabIndex: number) => void
  doCloseEditorTab: (windowId: string, tabIndex: number) => void
  updateEditorContent: (id: string, content: string) => void
  saveEditorContent: (id: string, fullPath?: string) => Promise<boolean>
  updateFilePath: (windowId: string, tabIndex: number, fullPath: string) => void
  formatEditor: (id: string) => Promise<{ ok: boolean; message: string }>
  toggleWordWrap: (id: string) => { ok: boolean; message: string }
  findOrCreateEditorWindow: (file: FileInfo, options?: { forceEditor?: boolean; forceApp?: string }) => Promise<{ ok: boolean; message?: string }>
}

// Helper: get process state for a window
function getProcessStateForWindow(windowId: string): { pid: string; state: Record<string, unknown> } | null {
  const win = useWindowStore.getState().windows.find(w => w.id === windowId)
  if (!win) return null
  const process = useProcessStore.getState().getProcess(win.pid)
  if (!process) return null
  return { pid: win.pid, state: process.state }
}

export const useEditorStore = create<EditorStore>(() => ({
  addNewEditorTab: (windowId) => {
    const ps = getProcessStateForWindow(windowId)
    if (!ps) return
    const defaultPath = i18n.t('apps.editor.store.untitledPath')
    const newFile: FileInfo = {
      name: i18n.t('apps.editor.store.untitledName'),
      path: defaultPath,
      isDir: false,
      size: 0,
      extension: '.txt',
      modifiedTime: new Date().toISOString(),
    }
    const newTab: EditorTab = { file: newFile, content: '', isModified: false, isNew: true }

    useProcessStore.getState().setProcessState(ps.pid, (prev) => {
      const tabs = [...((prev.tabs || []) as EditorTab[]), newTab]
      return { ...prev, tabs, activeTabIndex: tabs.length - 1, file: newFile, content: '', isModified: false }
    })
    useWindowStore.getState().updateWindowTitle(windowId, i18n.t('apps.editor.store.titleMultiple', { count: ((ps.state.tabs || []) as EditorTab[]).length + 1 }))
  },

  openNewEditor: () => {
    const state = useWindowStore.getState()
    const existingEditorWindow = state.windows.find(w => w.type === 'editor')
    const defaultPath = i18n.t('apps.editor.store.untitledPath')
    const newFile: FileInfo = {
      name: i18n.t('apps.editor.store.untitledName'),
      path: defaultPath,
      isDir: false,
      size: 0,
      extension: '.txt',
      modifiedTime: new Date().toISOString(),
    }
    const newTab: EditorTab = { file: newFile, content: '', isModified: false, isNew: true }

    if (existingEditorWindow) {
      const ps = getProcessStateForWindow(existingEditorWindow.id)
      if (!ps) return
      const d = ps.state
      const tabs = [...((d.tabs || []) as EditorTab[]), newTab]

      useProcessStore.getState().setProcessState(ps.pid, () => ({
        ...d, tabs, activeTabIndex: tabs.length - 1, file: newFile, content: '', isModified: false,
      }))

      useWindowStore.getState().updateWindowTitle(existingEditorWindow.id, i18n.t('apps.editor.store.titleMultiple', { count: tabs.length }))
      useWindowStore.getState().activateWindow(existingEditorWindow.id)
    } else {
      useWindowStore.getState().createWindow({
        type: 'editor',
        title: i18n.t('apps.editor.store.untitledName'),
        appData: {
          file: newFile, content: '', isModified: false,
          tabs: [newTab], activeTabIndex: 0,
        },
      })
    }
  },

  reorderEditorTabs: editorTabMgr.reorder,

  switchEditorTab: editorTabMgr.switch,

  closeEditorTab: (windowId, tabIndex) => {
    const ps = getProcessStateForWindow(windowId)
    if (!ps) return
    const d = ps.state
    const tabs = (d.tabs || []) as EditorTab[]

    const tab = tabs[tabIndex]
    if (tab?.isModified) {
      useUIStore.getState().showConfirm({
        title: i18n.t('apps.editor.store.unsavedChangesTitle'),
        description: i18n.t('apps.editor.store.unsavedChangesDescription', { name: tab.file.name }),
        confirmText: i18n.t('apps.editor.store.closeWithoutSaving'),
        variant: 'destructive',
        icon: createElement(AlertTriangle, { className: 'h-5 w-5 text-amber-500' }),
        onConfirm: () => useEditorStore.getState().doCloseEditorTab(windowId, tabIndex),
      })
      return
    }

    useEditorStore.getState().doCloseEditorTab(windowId, tabIndex)
  },

  doCloseEditorTab: editorTabMgr.close,

  updateEditorContent: (id, content) => {
    const ps = getProcessStateForWindow(id)
    if (!ps) return
    useProcessStore.getState().setProcessState(ps.pid, (prev) => {
      const tabs = [...((prev.tabs || []) as EditorTab[])]
      const activeIdx = (prev.activeTabIndex as number) || 0
      if (tabs[activeIdx]) {
        tabs[activeIdx] = { ...tabs[activeIdx], content, isModified: true }
      }
      return { ...prev, content, isModified: true, tabs }
    })
  },

  saveEditorContent: async (id, fullPath) => {
    const ps = getProcessStateForWindow(id)
    if (!ps) return false
    const d = ps.state
    const file = d.file as FileInfo | undefined
    if (!file) return false

    const currentTab = (d.tabs as EditorTab[])?.[((d.activeTabIndex as number) || 0)]
    let savePath = fullPath || file.path
    const pathParts = savePath.split('/')
    const saveFileName = pathParts.pop() || i18n.t('apps.editor.store.untitledName')
    const actualPath = savePath.startsWith('~') ? savePath.replace('~', '') : savePath
    const nodeId = currentTab?.file?.nodeId || file?.nodeId || 'local_1'

    try {
      await fsApi.write(nodeId, actualPath, (d.content as string) || '')

      useProcessStore.getState().setProcessState(ps.pid, (prev) => {
        const tabs = [...((prev.tabs || []) as EditorTab[])]
        const tabIndex = (prev.activeTabIndex as number) || 0
        if (tabs[tabIndex]) {
          const updatedFile: FileInfo = {
            ...tabs[tabIndex].file,
            name: saveFileName,
            path: savePath,
            extension: '.' + (saveFileName.split('.').pop() || 'txt'),
          }
          tabs[tabIndex] = { ...tabs[tabIndex], file: updatedFile, isModified: false, isNew: false }
        }
        return {
          ...prev,
          isModified: false,
          tabs,
          file: tabs[tabIndex]?.file,
        }
      })
      useWindowStore.getState().updateWindowTitle(id,
        ((d.tabs as EditorTab[])?.length || 0) > 1 ? i18n.t('apps.editor.store.titleMultiple', { count: (d.tabs as EditorTab[]).length }) : saveFileName
      )
      return true
    } catch {
      return false
    }
  },

  updateFilePath: (windowId, tabIndex, fullPath) => {
    const ps = getProcessStateForWindow(windowId)
    if (!ps) return
    const pathParts = fullPath.split('/')
    const fileName = pathParts.pop() || i18n.t('apps.editor.store.untitledName')

    useProcessStore.getState().setProcessState(ps.pid, (prev) => {
      const tabs = [...((prev.tabs || []) as EditorTab[])]
      if (tabs[tabIndex]) {
        tabs[tabIndex] = {
          ...tabs[tabIndex],
          file: {
            ...tabs[tabIndex].file,
            name: fileName,
            path: fullPath,
            extension: '.' + (fileName.split('.').pop() || 'txt'),
          },
          isModified: true,
        }
      }
      return { ...prev, tabs, file: tabs[tabIndex]?.file, isModified: true }
    })
  },

  formatEditor: async () => {
    return { ok: false, message: i18n.t('apps.editor.store.unsupportedFormat') }
  },

  toggleWordWrap: (id) => {
    const current = wrapStateRef[id] ?? true
    const next = !current
    wrapStateRef[id] = next
    return { ok: true, message: next ? i18n.t('apps.editor.store.wordWrapOn') : i18n.t('apps.editor.store.wordWrapOff') }
  },

  findOrCreateEditorWindow: async (file, options) => {
    const forceEditor = options?.forceEditor === true
    const forceApp = options?.forceApp

    let targetAppId: string
    if (forceEditor) {
      targetAppId = 'editor'
    } else if (forceApp) {
      targetAppId = forceApp === 'audio' ? 'musicPlayer' : forceApp
    } else {
      targetAppId = getDefaultAppForExtension(file.extension)
    }

    const appConfig = getAppConfig(targetAppId)
    const opener = appConfig.openFile
    if (opener) {
      const ctx = useWindowStore.getState().buildOpenFileContext()
      return opener(file, ctx)
    }

    // Fallback to editor
    const editorConfig = getAppConfig('editor')
    if (editorConfig.openFile) {
      const ctx = useWindowStore.getState().buildOpenFileContext()
      return editorConfig.openFile(file, ctx)
    }
    return { ok: false, message: i18n.t('apps.editor.store.openUnsupported') }
  },
}))
