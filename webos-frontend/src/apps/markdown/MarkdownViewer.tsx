import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import './markdown.css'
import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { useEditorStore } from '@/apps/editor/store'
import { BookOpen, Edit3 } from 'lucide-react'
import type { FileInfo, EditorTab } from '@/types'

interface MarkdownViewerProps {
  windowId: string
}

export default function MarkdownViewer({ windowId }: MarkdownViewerProps) {
  const { t } = useTranslation()
  const { win, procState: d } = useCurrentProcess(windowId)
  const staticContent = (d.content as string) || ''
  const filePath = (d.filePath as string) || ''
  const file = d.file as FileInfo | undefined

  // Subscribe to editor windows to get live content for this file
  const editorContent = useProcessStore(s => {
    const editorWindows = useWindowStore.getState().windows.filter(w => w.type === 'editor')
    for (const w of editorWindows) {
      const proc = s.processes.find(p => p.pid === w.pid)
      if (!proc) continue
      const ed = proc.state as Record<string, any>
      const tabs = (ed.tabs || []) as EditorTab[]
      const tab = tabs.find(t => t.file.path === filePath)
      if (tab) return tab.content
    }
    return null
  })

  const content = editorContent ?? staticContent

  // Sync editor content back to markdown window's process state so closing the editor doesn't revert
  const prevEditorContent = useRef(editorContent)
  useEffect(() => {
    if (prevEditorContent.current !== null && editorContent === null) {
      // Editor just closed — persist the last known content
      const currentWin = useWindowStore.getState().windows.find(w => w.id === windowId)
      if (currentWin) {
        useProcessStore.getState().updateProcessState(currentWin.pid, { content: prevEditorContent.current })
      }
    }
    prevEditorContent.current = editorContent
  }, [editorContent, windowId])

  const handleOpenEditor = useCallback(async () => {
    if (!file) return
    await useEditorStore.getState().findOrCreateEditorWindow(file, { forceEditor: true })
  }, [file])

  if (!win) return null

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 min-w-0">
          <BookOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">{filePath}</span>
        </div>
        <button
          onClick={handleOpenEditor}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md
            bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300
            hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>{t('apps.markdown.viewer.edit')}</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <article className="markdown-body max-w-4xl mx-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  )
}
