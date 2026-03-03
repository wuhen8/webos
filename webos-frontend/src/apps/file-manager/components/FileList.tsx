import { useState, useCallback, useRef } from "react"
import { Upload, Folder, FileText, FolderOpen, Check, Square } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { FileInfo } from "@/types"
import { formatFileSize, formatModifiedTime, getFileIconConfig } from "@/utils"
import { ColumnHeader } from "./ColumnHeader"
import type { SortField, SortDirection } from "./types"
import type { ViewMode } from "./Toolbar"

const getFileIcon = (file: FileInfo, size: "sm" | "lg" = "sm") => {
  const config = getFileIconConfig(file)
  const Icon = config.icon
  const cls = size === "lg" ? "h-10 w-10" : "h-5 w-5"
  const colorCls = config.className.replace(/h-\d+\s+w-\d+/, "").trim()
  return <Icon className={`${cls} ${colorCls} flex-shrink-0`} />
}

/** Data shape serialized into dataTransfer for internal drag-drop moves */
interface DragPayload {
  nodeId: string
  paths: string[]
}

const DRAG_MIME = "application/x-webos-files"

interface FileListProps {
  files: FileInfo[]
  sortedFiles: FileInfo[]
  loading: boolean
  selectedFiles: Set<string>
  isDraggingFile: boolean
  dropZoneRef: React.RefObject<HTMLDivElement>
  // inline create
  inlineCreate: "file" | "folder" | null
  inlineName: string
  setInlineName: (v: string) => void
  inlineCreateInputRef: React.RefObject<HTMLInputElement>
  commitInlineCreate: () => void
  setInlineCreate: (v: "file" | "folder" | null) => void
  // inline rename
  inlineRenamePath: string | null
  inlineRenameValue: string
  setInlineRenameValue: (v: string) => void
  inlineRenameInputRef: React.RefObject<HTMLInputElement>
  commitInlineRename: () => void
  setInlineRenamePath: (v: string | null) => void
  // handlers
  setSelectedFiles: (sel: Set<string>) => void
  setIsDraggingFile: (v: boolean) => void
  handleFileClick: (file: FileInfo, e: React.MouseEvent) => void
  handleFileDoubleClick: (file: FileInfo) => void
  handleUpload: (file: File) => void
  handleContextMenu: (e: React.MouseEvent, file?: FileInfo) => void
  viewMode: ViewMode
  // drag-drop move
  activeNodeId: string
  currentPath: string
  onMoveFiles: (srcNodeId: string, paths: string[], destPath: string) => void
  navigateTo: (path: string) => void
  onScrollChange?: (scrollTop: number) => void
  // Sort props for ColumnHeader
  sortField: SortField
  sortDirection: SortDirection
  onSortClick: (field: SortField) => void
  // Mobile multi-select
  multiSelectMode?: boolean
}

export function FileList({
  files, sortedFiles, loading, selectedFiles, isDraggingFile, dropZoneRef,
  inlineCreate, inlineName, setInlineName, inlineCreateInputRef, commitInlineCreate, setInlineCreate,
  inlineRenamePath, inlineRenameValue, setInlineRenameValue, inlineRenameInputRef, commitInlineRename, setInlineRenamePath,
  setSelectedFiles, setIsDraggingFile, handleFileClick, handleFileDoubleClick, handleUpload, handleContextMenu,
  viewMode, activeNodeId, currentPath, onMoveFiles, navigateTo, onScrollChange,
  sortField, sortDirection, onSortClick,
  multiSelectMode,
}: FileListProps) {
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [isDraggingInternal, setIsDraggingInternal] = useState(false)
  const dragHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleSelect = useCallback((filePath: string) => {
    const next = new Set(selectedFiles)
    if (next.has(filePath)) next.delete(filePath)
    else next.add(filePath)
    setSelectedFiles(next)
  }, [selectedFiles, setSelectedFiles])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!onScrollChange) return
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null
      onScrollChange((e.target as HTMLElement).scrollTop)
    }, 150)
  }, [onScrollChange])

  const clearDragHoverTimer = useCallback(() => {
    if (dragHoverTimerRef.current) { clearTimeout(dragHoverTimerRef.current); dragHoverTimerRef.current = null }
  }, [])

  // Start a timer: if hovering on a folder for 800ms, navigate into it
  const startDragHoverTimer = useCallback((folderPath: string) => {
    clearDragHoverTimer()
    dragHoverTimerRef.current = setTimeout(() => {
      navigateTo(folderPath)
      setDropTargetPath(null)
      dragHoverTimerRef.current = null
    }, 800)
  }, [navigateTo, clearDragHoverTimer])

  // Build drag payload: include all selected files if the dragged file is in selection, otherwise just the dragged file
  const buildDragStart = useCallback((file: FileInfo, e: React.DragEvent) => {
    if (inlineRenamePath === file.path) { e.preventDefault(); return }
    const paths = selectedFiles.has(file.path) && selectedFiles.size > 1
      ? Array.from(selectedFiles)
      : [file.path]
    const payload: DragPayload = { nodeId: activeNodeId, paths }
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'all'
    // Also keep legacy format for backward compat
    e.dataTransfer.setData("application/json", JSON.stringify(file))
  }, [activeNodeId, selectedFiles, inlineRenamePath])

  // Handle drop on a folder item
  const handleFolderDrop = useCallback((targetFolder: FileInfo, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    clearDragHoverTimer()
    setDropTargetPath(null)
    setIsDraggingFile(false)
    setIsDraggingInternal(false)
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    try {
      const payload: DragPayload = JSON.parse(raw)
      if (payload.paths.includes(targetFolder.path)) return
      onMoveFiles(payload.nodeId, payload.paths, targetFolder.path)
    } catch { /* ignore bad data */ }
  }, [onMoveFiles, setIsDraggingFile, clearDragHoverTimer])

  // Handle drop on blank area (move files into current directory)
  const handleBlankDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    setIsDraggingInternal(false)
    setDropTargetPath(null)
    clearDragHoverTimer()
    // Internal file move
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (raw) {
      try {
        const payload: DragPayload = JSON.parse(raw)
        // Only move if source is different from current directory
        const allInCurrent = payload.paths.every(p => {
          const parent = p.substring(0, p.lastIndexOf("/")) || "/"
          return parent === currentPath
        })
        if (!allInCurrent) onMoveFiles(payload.nodeId, payload.paths, currentPath)
      } catch { /* ignore */ }
      return
    }
    // External file upload (from OS)
    const droppedFiles = Array.from(e.dataTransfer?.files || [])
    if (droppedFiles.length > 0) for (const file of droppedFiles) await handleUpload(file)
  }, [currentPath, onMoveFiles, setIsDraggingFile, handleUpload])

  const handleZoneDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_MIME) ? 'move' : 'copy'
    }
  }, [])

  const handleZoneDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      // Internal file drag (possibly cross-window) — show border highlight, no overlay
      e.preventDefault()
      setIsDraggingInternal(true)
    } else if (e.dataTransfer.types.includes('Files')) {
      // External OS file drop — show upload overlay
      e.preventDefault()
      setIsDraggingFile(true)
    }
  }, [setIsDraggingFile])

  return (
    <div ref={dropZoneRef} className={`flex-1 overflow-auto px-3 pb-3 transition-all duration-200 relative ${isDraggingFile ? 'bg-white/10' : ''} ${isDraggingInternal && !dropTargetPath ? 'ring-2 ring-blue-400/60 ring-inset rounded-xl' : ''}`}
      onContextMenu={(e) => handleContextMenu(e)}
      onClick={(e) => { if (e.target === e.currentTarget) setSelectedFiles(new Set()) }}
      onScroll={handleScroll}
      onDragEnter={handleZoneDragEnter}
      onDragOver={handleZoneDragOver}
      onDragLeave={(e) => { e.preventDefault(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); const x = e.clientX; const y = e.clientY; if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) { setIsDraggingFile(false); setIsDraggingInternal(false); setDropTargetPath(null); clearDragHoverTimer() } }}
      onDrop={handleBlankDrop}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/10 backdrop-blur-sm border-2 border-dashed border-white/40 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-700">释放文件以上传</p>
          </div>
        </div>
      )}
      {viewMode === 'list' && !loading && files && files.length > 0 && (
        <ColumnHeader sortField={sortField} sortDirection={sortDirection} onSortClick={onSortClick} />
      )}
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-3 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : !files || files.length === 0 ? (
        inlineCreate ? (
          <div className="flex items-center justify-start px-4 py-3">
            <InlineCreateRow inlineCreate={inlineCreate} inlineName={inlineName} setInlineName={setInlineName} inputRef={inlineCreateInputRef} onCommit={commitInlineCreate} onCancel={() => { setInlineCreate(null); setInlineName("") }} viewMode={viewMode} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-100/80">
            {isDraggingFile
              ? (<><Upload className="h-16 w-16 mb-4 opacity-80 text-white" /><p>拖放文件到此处上传</p></>)
              : (<><FolderOpen className="h-16 w-16 mb-4 opacity-80 text-white" /><p>文件夹为空</p></>)}
          </div>
        )
      ) : (
        <div className={viewMode === 'grid'
          ? "grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2 select-none"
          : "grid grid-cols-1 gap-1 select-none min-w-[36rem]"
        }>
          {inlineCreate && (
            <div className={viewMode === 'grid'
              ? "flex flex-col items-center gap-1 p-2 rounded-xl bg-white/10 border border-white/20"
              : "flex items-center justify-between px-3 py-2 rounded-md bg-white/10 border border-white/20"
            }>
              <InlineCreateRow inlineCreate={inlineCreate} inlineName={inlineName} setInlineName={setInlineName} inputRef={inlineCreateInputRef} onCommit={commitInlineCreate} onCancel={() => { setInlineCreate(null); setInlineName("") }} viewMode={viewMode} />
            </div>
          )}
          {sortedFiles?.map((file) => {
            const isSelected = selectedFiles.has(file.path)
            const isDropTarget = file.isDir && dropTargetPath === file.path
            return viewMode === 'grid' ? (
              <div key={file.path}
                onClick={(e) => multiSelectMode ? toggleSelect(file.path) : handleFileClick(file, e)}
                onDoubleClick={() => (!multiSelectMode || file.isDir) && handleFileDoubleClick(file)}
                onContextMenu={(e) => { if (!multiSelectMode) { e.stopPropagation(); handleContextMenu(e, file) } }}
                draggable={!multiSelectMode && inlineRenamePath !== file.path}
                onDragStart={(e) => buildDragStart(file, e)}
                onDragOver={(e) => { if (file.isDir && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDropTargetPath(file.path) } }}
                onDragEnter={(e) => { if (file.isDir && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDropTargetPath(file.path); startDragHoverTimer(file.path) } }}
                onDragLeave={(e) => { if (file.isDir) { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) { setDropTargetPath(prev => prev === file.path ? null : prev); clearDragHoverTimer() } } }}
                onDrop={(e) => { if (file.isDir) handleFolderDrop(file, e) }}
                className={`flex flex-col items-center gap-1 p-3 cursor-pointer transition-colors rounded-xl relative ${isDropTarget ? 'bg-blue-500/30 ring-2 ring-blue-400/60' : isSelected ? 'bg-blue-500/25' : 'hover:bg-black/5'}`}>
                {multiSelectMode && (
                  <div className="absolute top-1.5 left-1.5">
                    {isSelected
                      ? <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center"><Check className="h-3.5 w-3.5 text-white" /></div>
                      : <div className="w-5 h-5 rounded border-2 border-slate-400/60 bg-white/40" />}
                  </div>
                )}
                {getFileIcon(file, "lg")}
                {inlineRenamePath === file.path ? (
                  <Input ref={inlineRenameInputRef} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} value={inlineRenameValue} onChange={(e) => setInlineRenameValue(e.target.value)} onBlur={commitInlineRename} onKeyDown={(e) => { if (e.key === "Enter") commitInlineRename(); if (e.key === "Escape") { setInlineRenamePath(null) } }} className="h-7 w-full text-xs text-center bg-white/20 backdrop-blur-sm border-white/30 rounded-md" />
                ) : (
                  <span className={`text-xs text-center w-full truncate ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>{file.name}</span>
                )}
              </div>
            ) : (
              <div key={file.path}
                onClick={(e) => multiSelectMode ? toggleSelect(file.path) : handleFileClick(file, e)}
                onDoubleClick={() => (!multiSelectMode || file.isDir) && handleFileDoubleClick(file)}
                onContextMenu={(e) => { if (!multiSelectMode) { e.stopPropagation(); handleContextMenu(e, file) } }}
                draggable={!multiSelectMode && inlineRenamePath !== file.path}
                onDragStart={(e) => buildDragStart(file, e)}
                onDragOver={(e) => { if (file.isDir && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDropTargetPath(file.path) } }}
                onDragEnter={(e) => { if (file.isDir && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDropTargetPath(file.path); startDragHoverTimer(file.path) } }}
                onDragLeave={(e) => { if (file.isDir) { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) { setDropTargetPath(prev => prev === file.path ? null : prev); clearDragHoverTimer() } } }}
                onDrop={(e) => { if (file.isDir) handleFolderDrop(file, e) }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors rounded-lg ${isDropTarget ? 'bg-blue-500/30 ring-2 ring-blue-400/60' : isSelected ? 'bg-blue-500/25' : 'hover:bg-black/5'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {multiSelectMode && (
                    <div className="flex-shrink-0">
                      {isSelected
                        ? <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center"><Check className="h-3.5 w-3.5 text-white" /></div>
                        : <div className="w-5 h-5 rounded border-2 border-slate-400/60 bg-white/40" />}
                    </div>
                  )}
                  {getFileIcon(file)}
                  {inlineRenamePath === file.path ? (
                    <Input ref={inlineRenameInputRef} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} value={inlineRenameValue} onChange={(e) => setInlineRenameValue(e.target.value)} onBlur={commitInlineRename} onKeyDown={(e) => { if (e.key === "Enter") commitInlineRename(); if (e.key === "Escape") { setInlineRenamePath(null) } }} className="h-8 w-60 bg-white/20 backdrop-blur-sm border-white/30 rounded-md" />
                  ) : (
                    <span className={`font-medium truncate ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>{file.name}</span>
                  )}
                </div>
                <div className={`flex items-center gap-6 text-sm flex-shrink-0 whitespace-nowrap ${isSelected ? 'text-slate-800' : 'text-slate-700'}`}>
                  <span className="w-24 text-right truncate">{file.isSymlink ? '符号链接' : file.isDir ? '文件夹' : (file.extension ? file.extension.toUpperCase().replace('.', '') + ' 文件' : '文件')}</span>
                  <span className="w-16 text-right">{file.isDir ? '-' : formatFileSize(file.size)}</span>
                  <span className="w-40 text-right">{formatModifiedTime(file.modifiedTime)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InlineCreateRow({ inlineCreate, inlineName, setInlineName, inputRef, onCommit, onCancel, viewMode }: {
  inlineCreate: "file" | "folder"
  inlineName: string
  setInlineName: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  onCommit: () => void
  onCancel: () => void
  viewMode: ViewMode
}) {
  if (viewMode === 'grid') {
    return (
      <>
        {inlineCreate === "folder" ? <Folder className="h-10 w-10 text-blue-500" /> : <FileText className="h-10 w-10 text-slate-800" />}
        <Input ref={inputRef} value={inlineName} onChange={(e) => setInlineName(e.target.value)} onBlur={onCommit} onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel() }} className="h-7 w-full text-xs text-center bg-white/20 backdrop-blur-sm border-white/30 rounded-md" placeholder={inlineCreate === "folder" ? "新建文件夹" : "新建文件"} />
      </>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 border border-white/30 px-3 py-2">
      {inlineCreate === "folder" ? <Folder className="h-5 w-5 text-blue-500" /> : <FileText className="h-5 w-5 text-slate-800" />}
      <Input ref={inputRef} value={inlineName} onChange={(e) => setInlineName(e.target.value)} onBlur={onCommit} onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel() }} className="h-8 w-60 bg-white/20 backdrop-blur-sm border-white/30 rounded-md" placeholder={inlineCreate === "folder" ? "新建文件夹" : "新建文件"} />
    </div>
  )
}
