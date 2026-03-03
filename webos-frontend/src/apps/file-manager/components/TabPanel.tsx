import { useState, useEffect, useRef, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { fsApi } from "@/lib/storageApi"
import type { FileInfo, ContextMenuContext, ContextMenuConfig } from "@/types"
import { getContextMenu } from "@/config/appRegistry"
import { buildOpenWithMenuItems } from "@/config/fileAssociationRegistry"
import { useUIStore } from "@/stores"
import { useEditorStore } from "@/apps/editor/store"
import { fsService } from "@/lib/services"
import { useTaskStore } from "@/stores/taskStore"
import { useFileManagerStore } from "../store"
import { setPathCache, getPathCache } from "../pathCache"
import { Toolbar } from "./Toolbar"
import { FileList } from "./FileList"
import { PathBar } from "./PathBar"
import { OfflineDownloadDialog } from "./OfflineDownloadDialog"
import { useFileActions } from "./useFileActions"
import { useKeyboardShortcuts } from "./useKeyboardShortcuts"
import { useFileSort } from "./useFileSort"
import type { ViewMode } from "./Toolbar"

interface TabPanelProps {
  windowId: string
  tabIndex: number
  tab: any
  isActive: boolean
  onFileCountChange?: (total: number, selected: number) => void
}

export function TabPanel({ windowId, tabIndex, tab, isActive, onFileCountChange }: TabPanelProps) {
  const findOrCreateEditorWindow = useEditorStore((s) => s.findOrCreateEditorWindow)
  const updateFmTabState = useFileManagerStore((s) => s.updateFmTabState)
  const clipboard = useFileManagerStore((s) => s.clipboard)
  const setClipboard = useFileManagerStore((s) => s.setClipboard)
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const clearSelectionTick = useUIStore((s) => s.clearSelectionTick)
  const showConfirm = useUIStore((s) => s.showConfirm)
  const { toast } = useToast()

  const [files, setFiles] = useState<FileInfo[]>([])
  const filesRef = useRef<FileInfo[]>([])
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [editPath, setEditPath] = useState(false)
  const [pathInput, setPathInput] = useState("")
  const pathInputRef = useRef<HTMLInputElement>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem("fm:viewMode")
      if (saved === "grid" || saved === "list") return saved
    } catch {}
    return "list"
  })
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem("fm:viewMode", mode)
  }
  const [showOfflineDownload, setShowOfflineDownload] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  // Derive state from tab
  const currentPath = tab?.currentPath ?? "/"
  const history = tab?.history ?? ["/"]
  const historyIndex = tab?.historyIndex ?? 0
  const selectedFiles = new Set<string>(tab?.selectedFiles ?? [])
  const activeNodeId = tab?.activeNodeId ?? "local_1"
  const pathCache = tab?.pathCache ?? {}

  // Save current path's view state to pathCache before navigating away
  const saveCurrentViewState = useCallback(() => {
    const scrollEl = dropZoneRef.current
    const scrollTop = scrollEl?.scrollTop ?? 0
    const newCache = setPathCache(pathCache, currentPath, { files, scrollTop })
    updateFmTabState(windowId, tabIndex, { pathCache: newCache })
  }, [pathCache, currentPath, files, windowId, tabIndex, updateFmTabState])

  // Tab state helpers
  const setSelectedFiles = useCallback((sel: Set<string>) => {
    updateFmTabState(windowId, tabIndex, { selectedFiles: Array.from(sel) })
  }, [windowId, tabIndex, updateFmTabState])

  // Navigation
  const navigateTo = useCallback((path: string) => {
    saveCurrentViewState()
    setSearchKeyword("")
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(path)
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, tabIndex, {
      currentPath: path, history: newHistory, historyIndex: newHistory.length - 1, title,
    })
  }, [historyIndex, history, windowId, tabIndex, updateFmTabState, saveCurrentViewState])

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return
    saveCurrentViewState()
    const newIndex = historyIndex - 1
    const path = history[newIndex]
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, tabIndex, { currentPath: path, historyIndex: newIndex, selectedFiles: [], title })
  }, [historyIndex, history, windowId, tabIndex, updateFmTabState, saveCurrentViewState])

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    saveCurrentViewState()
    const newIndex = historyIndex + 1
    const path = history[newIndex]
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, tabIndex, { currentPath: path, historyIndex: newIndex, selectedFiles: [], title })
  }, [historyIndex, history, windowId, tabIndex, updateFmTabState, saveCurrentViewState])

  const handleNavigateNode = useCallback((nodeId: string, path: string) => {
    saveCurrentViewState()
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, tabIndex, {
      activeNodeId: nodeId, currentPath: path, history: [path], historyIndex: 0, selectedFiles: [], title,
    })
  }, [windowId, tabIndex, updateFmTabState, saveCurrentViewState])

  // File loading with path cache integration
  const pendingScrollRef = useRef<number | null>(null)
  const currentPathRef = useRef(currentPath)
  currentPathRef.current = currentPath
  const pathCacheRef = useRef(pathCache)
  pathCacheRef.current = pathCache

  const loadFiles = useCallback(async (path = currentPath) => {
    try {
      if (filesRef.current.length === 0) setLoading(true)
      const rawList = await fsApi.list(activeNodeId, path)
      const fileList = (Array.isArray(rawList) ? rawList : []).map((f: FileInfo) => ({ ...f, nodeId: activeNodeId }))
      setFiles(fileList)
      filesRef.current = fileList
      // Write result to pathCache
      const scrollTop = dropZoneRef.current?.scrollTop ?? 0
      const newCache = setPathCache(pathCacheRef.current, path, { files: fileList, scrollTop })
      updateFmTabState(windowId, tabIndex, { pathCache: newCache })
    } catch (error) {
      console.error("加载文件列表失败:", error)
      setFiles([])
      filesRef.current = []
    } finally {
      setLoading(false)
    }
  }, [currentPath, activeNodeId, windowId, tabIndex, updateFmTabState])

  // Silent refresh: no loading state, with race condition check
  const loadFilesSilent = useCallback(async (path: string) => {
    try {
      const rawList = await fsApi.list(activeNodeId, path)
      const fileList = (Array.isArray(rawList) ? rawList : []).map((f: FileInfo) => ({ ...f, nodeId: activeNodeId }))
      if (path !== currentPathRef.current) return // stale response, discard
      setFiles(fileList)
      filesRef.current = fileList
      const scrollTop = dropZoneRef.current?.scrollTop ?? 0
      const newCache = setPathCache(pathCacheRef.current, path, { files: fileList, scrollTop })
      updateFmTabState(windowId, tabIndex, { pathCache: newCache })
    } catch (error) {
      console.error("静默刷新失败:", error)
    }
  }, [activeNodeId, windowId, tabIndex, updateFmTabState])

  // On path change: restore from cache or load fresh
  useEffect(() => {
    const [cached, touchedCache] = getPathCache(pathCacheRef.current, currentPath)
    if (cached) {
      // Cache hit: render immediately, then silent refresh
      setFiles(cached.files)
      filesRef.current = cached.files
      pendingScrollRef.current = cached.scrollTop
      setLoading(false)
      updateFmTabState(windowId, tabIndex, { pathCache: touchedCache })
      loadFilesSilent(currentPath)
    } else {
      // Cache miss: clear and load with loading state
      setFiles([])
      filesRef.current = []
      pendingScrollRef.current = null
      loadFiles(currentPath)
    }
  }, [currentPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll position after files render
  useEffect(() => {
    if (pendingScrollRef.current !== null && files.length > 0) {
      const scrollVal = pendingScrollRef.current
      pendingScrollRef.current = null
      requestAnimationFrame(() => {
        if (dropZoneRef.current) {
          dropZoneRef.current.scrollTo(0, scrollVal)
        }
      })
    }
  }, [files])

  // Real-time file system watch — sync to pathCache
  useEffect(() => {
    if (!activeNodeId.startsWith('local') || !currentPath) return
    const unwatch = fsService.watch(activeNodeId, currentPath, (updatedFiles: FileInfo[]) => {
      const fileList = updatedFiles.map((f: FileInfo) => ({ ...f, nodeId: activeNodeId }))
      setFiles(fileList)
      filesRef.current = fileList
      // Sync to pathCache, preserving current scrollTop
      const scrollTop = dropZoneRef.current?.scrollTop ?? 0
      const newCache = setPathCache(pathCacheRef.current, currentPath, { files: fileList, scrollTop })
      updateFmTabState(windowId, tabIndex, { pathCache: newCache })
    })
    return () => { unwatch() }
  }, [activeNodeId, currentPath, windowId, tabIndex, updateFmTabState])

  // Auto-refresh on background task completion
  useEffect(() => {
    const unsub = useTaskStore.subscribe((state, prevState) => {
      const fsTypes = new Set(['fs_copy', 'fs_move', 'fs_delete', 'upload', 'offline_download'])
      const justCompleted = state.tasks.some((t) => {
        const prev = prevState.tasks.find(p => p.id === t.id)
        return fsTypes.has(t.type) && (t.status === 'success' || t.status === 'failed') && prev?.status === 'running'
      })
      if (justCompleted) loadFilesSilent(currentPathRef.current)
    })
    return unsub
  }, [loadFilesSilent])

  // onScrollChange callback for FileList
  const handleScrollChange = useCallback((scrollTop: number) => {
    const newCache = setPathCache(pathCacheRef.current, currentPath, { files: filesRef.current, scrollTop })
    updateFmTabState(windowId, tabIndex, { pathCache: newCache })
  }, [currentPath, windowId, tabIndex, updateFmTabState])

  // Clear selection on global tick
  useEffect(() => {
    setSelectedFiles(new Set())
  }, [clearSelectionTick])

  // Report file counts to parent when active
  useEffect(() => {
    if (isActive && onFileCountChange) {
      onFileCountChange(files.length, selectedFiles.size)
    }
  }, [isActive, files.length, selectedFiles.size, onFileCountChange])

  // Sorting
  const { sortField, sortDirection, sortedFiles, handleSortClick } = useFileSort(files)

  // Search filter
  const filteredFiles = searchKeyword
    ? sortedFiles.filter(f => f.name.toLowerCase().includes(searchKeyword.toLowerCase()))
    : sortedFiles

  // File actions
  const actions = useFileActions({
    files, filesRef, selectedFiles, setSelectedFiles, currentPath, activeNodeId,
    clipboard, setClipboard, loadFiles, navigateTo, toast, showConfirm,
    closeGlobalMenu, findOrCreateEditorWindow, fileInputRef,
  })

  // Inline create focus
  useEffect(() => {
    if (actions.inlineCreate && actions.inlineCreateInputRef.current) {
      actions.inlineCreateInputRef.current.focus()
      actions.inlineCreateInputRef.current.select()
    }
  }, [actions.inlineCreate])

  // Inline rename focus
  useEffect(() => {
    if (actions.inlineRenamePath && actions.inlineRenameInputRef.current) {
      actions.inlineRenameInputRef.current.focus()
      actions.inlineRenameInputRef.current.select()
    }
  }, [actions.inlineRenamePath])

  // Keyboard shortcuts (only respond when this tab is active)
  useKeyboardShortcuts({
    windowId, isActive, files, selectedFiles, clipboard, setSelectedFiles, setClipboard,
    goBack, goForward,
    handleFileDoubleClick: actions.handleFileDoubleClick,
    confirmDelete: actions.confirmDelete,
    handleCopy: actions.handleCopy,
    handleCut: actions.handleCut,
    handlePaste: actions.handlePaste,
    startRename: actions.startRename,
  })

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, file?: FileInfo) => {
    e.preventDefault()
    if (file && !selectedFiles.has(file.path)) setSelectedFiles(new Set([file.path]))

    const ctx: ContextMenuContext = {
      targetFile: file || null,
      selectedFiles: file ? (selectedFiles.size > 1 ? files.filter(f => selectedFiles.has(f.path)) : [file]) : [],
      selectedCount: file ? (selectedFiles.size > 1 ? selectedFiles.size : 1) : 0,
      clipboard,
      clipboardCount: clipboard?.files?.length ?? 0,
    }

    const baseConfig = file ? getContextMenu('fileManager', 'file') : getContextMenu('fileManager', 'blank')
    let config: ContextMenuConfig
    if (file && !file.isDir) {
      const items = baseConfig.items.map(item => {
        if ('id' in item && item.id === 'fm-file-open-with') return { ...item, children: buildOpenWithMenuItems(file.extension) }
        return item
      })
      config = { ...baseConfig, items }
    } else {
      config = baseConfig
    }

    openGlobalMenu({
      x: e.clientX, y: e.clientY, config, context: ctx,
      onAction: (action: string) => {
        if (action === 'fm.offlineDownload') { setShowOfflineDownload(true); closeGlobalMenu(); return }
        actions.handleContextMenuAction(action)
      },
    })
  }

  // Drag-drop move handler
  const handleMoveFiles = useCallback((srcNodeId: string, paths: string[], destPath: string) => {
    if (paths.length === 0) return
    fsApi.move(srcNodeId, paths, destPath, activeNodeId)
    setSelectedFiles(new Set())
    toast({ title: "移动中", description: `正在移动 ${paths.length} 个项目` })
  }, [activeNodeId, setSelectedFiles, toast])

  const toggleMultiSelect = useCallback(() => {
    if (multiSelectMode) {
      setSelectedFiles(new Set())
      setClipboard(null)
    }
    setMultiSelectMode(m => !m)
  }, [multiSelectMode, setSelectedFiles, setClipboard])

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.path)))
  }, [filteredFiles, setSelectedFiles])

  const handleMultiSelectDownload = useCallback(() => {
    const sel = files.filter(f => selectedFiles.has(f.path) && !f.isDir)
    if (sel.length === 0) { toast({ title: "提示", description: "没有可下载的文件" }); return }
    sel.forEach(f => actions.handleDownload(f))
    setSelectedFiles(new Set())
  }, [files, selectedFiles, actions, toast, setSelectedFiles])

  const handleMultiSelectCompress = useCallback(() => {
    const sel = files.filter(f => selectedFiles.has(f.path))
    if (sel.length === 0) return
    actions.handleCompress(sel)
    setSelectedFiles(new Set())
  }, [files, selectedFiles, actions, setSelectedFiles])

  const handleMultiSelectDelete = useCallback(() => {
    const sel = files.filter(f => selectedFiles.has(f.path))
    if (sel.length === 0) return
    actions.confirmDelete(sel)
    setSelectedFiles(new Set())
  }, [files, selectedFiles, actions, setSelectedFiles])

  const handleMultiSelectCopy = useCallback(() => {
    actions.handleCopy()
    setSelectedFiles(new Set())
  }, [actions, setSelectedFiles])

  const handleMultiSelectCut = useCallback(() => {
    actions.handleCut()
    setSelectedFiles(new Set())
  }, [actions, setSelectedFiles])

  return (
    <div
      ref={panelRef}
      className="absolute inset-0 flex flex-col min-w-0"
      style={{ display: isActive ? undefined : 'none' }}
      data-file-manager-content="true"
      tabIndex={isActive ? 0 : -1}
    >
      <Toolbar
        canGoBack={historyIndex > 0} canGoForward={historyIndex < history.length - 1}
        currentPath={currentPath} goBack={goBack} goForward={goForward} navigateTo={navigateTo}
        onNewFile={() => { actions.setInlineCreate("file"); actions.setInlineName("") }}
        onNewFolder={() => { actions.setInlineCreate("folder"); actions.setInlineName("") }}
        onUpload={() => fileInputRef.current?.click()}
        onOfflineDownload={() => setShowOfflineDownload(true)}
        onContextMenu={(e) => handleContextMenu(e)}
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortClick={handleSortClick}
        multiSelectMode={multiSelectMode}
        onToggleMultiSelect={toggleMultiSelect}
        selectedCount={selectedFiles.size}
        onSelectAll={handleSelectAll}
        onCopy={handleMultiSelectCopy}
        onCut={handleMultiSelectCut}
        onDelete={handleMultiSelectDelete}
        onDownload={handleMultiSelectDownload}
        onCompress={handleMultiSelectCompress}
        hasClipboard={!!clipboard}
        onPaste={actions.handlePaste}
      />

      <FileList
        files={files} sortedFiles={filteredFiles} loading={loading}
        selectedFiles={selectedFiles} isDraggingFile={isDraggingFile} dropZoneRef={dropZoneRef}
        inlineCreate={actions.inlineCreate} inlineName={actions.inlineName} setInlineName={actions.setInlineName}
        inlineCreateInputRef={actions.inlineCreateInputRef} commitInlineCreate={actions.commitInlineCreate}
        setInlineCreate={actions.setInlineCreate}
        inlineRenamePath={actions.inlineRenamePath} inlineRenameValue={actions.inlineRenameValue}
        setInlineRenameValue={actions.setInlineRenameValue} inlineRenameInputRef={actions.inlineRenameInputRef}
        commitInlineRename={actions.commitInlineRename} setInlineRenamePath={actions.setInlineRenamePath}
        setSelectedFiles={setSelectedFiles} setIsDraggingFile={setIsDraggingFile}
        handleFileClick={actions.handleFileClick} handleFileDoubleClick={actions.handleFileDoubleClick}
        handleUpload={actions.handleUpload} handleContextMenu={handleContextMenu}
        viewMode={viewMode}
        activeNodeId={activeNodeId} currentPath={currentPath} onMoveFiles={handleMoveFiles}
        navigateTo={navigateTo}
        onScrollChange={handleScrollChange}
        sortField={sortField} sortDirection={sortDirection} onSortClick={handleSortClick}
        multiSelectMode={multiSelectMode}
      />

      <PathBar
        currentPath={currentPath} activeNodeId={activeNodeId}
        editPath={editPath} pathInput={pathInput} pathInputRef={pathInputRef}
        setEditPath={setEditPath} setPathInput={setPathInput}
        navigateTo={navigateTo} handleNavigateNode={handleNavigateNode}
      />

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={async (e) => { const f = e.target.files; if (f) for (let i = 0; i < f.length; i++) await actions.handleUpload(f[i]); e.target.value = '' }} />

      <OfflineDownloadDialog
        open={showOfflineDownload} onOpenChange={setShowOfflineDownload}
        activeNodeId={activeNodeId} currentPath={currentPath} toast={toast}
      />
    </div>
  )
}
