import type { MenuActionHandler } from '@/types'
import { useEditorStore } from './store'

export const actions: Record<string, MenuActionHandler> = {
  save: (ctx) => {
    if (ctx.windowId) {
      useEditorStore.getState().saveEditorContent(ctx.windowId)
    }
  },
  undo: () => {
    document.execCommand('undo')
  },
  redo: () => {
    document.execCommand('redo')
  },
  cut: () => {
    document.execCommand('cut')
  },
  copy: () => {
    document.execCommand('copy')
  },
  paste: () => {
    document.execCommand('paste')
  },
  selectAll: () => {
    document.execCommand('selectAll')
  },
}
