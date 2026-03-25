import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, ChevronRight, ArrowLeft, Loader2, Check } from 'lucide-react'
import { fsApi } from '@/lib/storageApi'
import type { FileInfo } from '@/types'

interface FolderPickerProps {
  nodeId: string
  onSelect: (path: string) => void
  onClose: () => void
}

export default function FolderPicker({ nodeId, onSelect, onClose }: FolderPickerProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('~')
  const [folders, setFolders] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)

  const loadFolders = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const files = await fsApi.list(nodeId, path)
      setFolders(files.filter(f => f.isDir))
      setCurrentPath(path)
    } catch {
      setFolders([])
    } finally {
      setLoading(false)
    }
  }, [nodeId])

  useEffect(() => { loadFolders('~') }, [loadFolders])

  const goUp = () => {
    if (currentPath === '/') return
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/'
    loadFolders(parent)
  }

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/95 flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 shrink-0">
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-xs text-slate-400 truncate flex items-center gap-0.5">
          <span
            className="hover:text-white cursor-pointer"
            onClick={() => loadFolders('/')}
          >/</span>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span
                className="hover:text-white cursor-pointer"
                onClick={() => loadFolders('/' + pathParts.slice(0, i + 1).join('/'))}
              >{part}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : folders.length === 0 ? (
          <div className="text-slate-600 text-xs text-center py-6">{t('apps.musicPlayer.folderPicker.empty')}</div>
        ) : (
          folders.map(f => (
            <div
              key={f.path}
              onClick={() => loadFolders(f.path)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
            >
              <Folder className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-700/50 shrink-0">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-1.5 text-xs rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600"
        >
          {t('apps.musicPlayer.folderPicker.cancel')}
        </button>
        <button
          onClick={() => onSelect(currentPath)}
          className="flex-1 px-3 py-1.5 text-xs rounded-md bg-violet-600 text-white hover:bg-violet-500 flex items-center justify-center gap-1"
        >
          <Check className="w-3.5 h-3.5" />
          {t('apps.musicPlayer.folderPicker.selectCurrent')}
        </button>
      </div>
    </div>
  )
}
