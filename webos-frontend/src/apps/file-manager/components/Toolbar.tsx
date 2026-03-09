import { useState, useRef } from "react"
import { ArrowLeft, ArrowRight, ArrowUp, FilePlus, FolderPlus, Upload, Download, Search, X, MoreHorizontal, List, LayoutGrid, ArrowDownAZ, Check, CheckSquare, Copy, Scissors, Trash2, Archive, XCircle, CheckCheck, ClipboardPaste } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { isTouchDevice } from "@/lib/env"
import type { SortField, SortDirection } from "./types"

/** Compute parent path, handling both Unix "/" and Windows "C:/" roots. */
function getParentPath(p: string): string {
  // Already at Unix root
  if (p === "/") return "/"
  // Already at Windows drive root like "C:/"
  if (/^[A-Za-z]:\/$/.test(p)) return p
  const parent = p.substring(0, p.lastIndexOf("/"))
  // If parent is empty → Unix root
  if (!parent) return "/"
  // If parent is just a drive letter like "C:" → return "C:/"
  if (/^[A-Za-z]:$/.test(parent)) return parent + "/"
  return parent
}

/** Check if path is already at its root (/ or C:/) */
function isRootPath(p: string): boolean {
  return p === "/" || /^[A-Za-z]:\/$/.test(p)
}

export type ViewMode = "list" | "grid"

interface ToolbarProps {
  canGoBack: boolean
  canGoForward: boolean
  currentPath: string
  goBack: () => void
  goForward: () => void
  navigateTo: (path: string) => void
  onNewFile: () => void
  onNewFolder: () => void
  onUpload: () => void
  onOfflineDownload: () => void
  onContextMenu: (e: React.MouseEvent) => void
  searchKeyword: string
  onSearchChange: (keyword: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  sortField: SortField
  sortDirection: SortDirection
  onSortClick: (field: SortField) => void
  // Mobile multi-select
  multiSelectMode?: boolean
  onToggleMultiSelect?: () => void
  selectedCount?: number
  onSelectAll?: () => void
  onCopy?: () => void
  onCut?: () => void
  onDelete?: () => void
  onDownload?: () => void
  onCompress?: () => void
  hasClipboard?: boolean
  onPaste?: () => void
}

export function Toolbar({
  canGoBack, canGoForward, currentPath,
  goBack, goForward, navigateTo,
  onNewFile, onNewFolder, onUpload, onOfflineDownload, onContextMenu,
  searchKeyword, onSearchChange, viewMode, onViewModeChange,
  sortField, sortDirection, onSortClick,
  multiSelectMode, onToggleMultiSelect, selectedCount = 0,
  onSelectAll, onCopy, onCut, onDelete, onDownload, onCompress,
  hasClipboard, onPaste,
}: ToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isTouch = isTouchDevice()

  // Mobile multi-select mode: show dedicated toolbar
  if (isTouch && multiSelectMode) {
    return (
      <div className="flex items-center justify-between h-12 px-4 bg-white/10 backdrop-blur-xl border-b border-white/20">
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={goBack} disabled={!canGoBack} className="h-9 w-9 rounded-xl hover:bg-white/20">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={goForward} disabled={!canGoForward} className="h-9 w-9 rounded-xl hover:bg-white/20">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigateTo(getParentPath(currentPath))} disabled={isRootPath(currentPath)} className="h-9 w-9 rounded-xl hover:bg-white/20">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-700 font-medium ml-1">已选 {selectedCount} 项</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onSelectAll} className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0" title="全选">
            <CheckCheck className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0" disabled={selectedCount === 0 && !hasClipboard}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCopy} disabled={selectedCount === 0}>
                <Copy className="h-4 w-4" /><span className="ml-2">复制</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCut} disabled={selectedCount === 0}>
                <Scissors className="h-4 w-4" /><span className="ml-2">剪切</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownload} disabled={selectedCount === 0}>
                <Download className="h-4 w-4" /><span className="ml-2">下载</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCompress} disabled={selectedCount === 0}>
                <Archive className="h-4 w-4" /><span className="ml-2">压缩</span>
              </DropdownMenuItem>
              {hasClipboard && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onPaste}>
                    <ClipboardPaste className="h-4 w-4" /><span className="ml-2">粘贴</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} disabled={selectedCount === 0} className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4" /><span className="ml-2">移到回收站</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={onToggleMultiSelect} className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0" title="取消多选">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between h-12 px-4 bg-white/10 backdrop-blur-xl border-b border-white/20" onContextMenu={onContextMenu}>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack} disabled={!canGoBack} className="h-9 w-9 rounded-xl hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={goForward} disabled={!canGoForward} className="h-9 w-9 rounded-xl hover:bg-white/20">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => navigateTo(getParentPath(currentPath))} disabled={isRootPath(currentPath)} className="h-9 w-9 rounded-xl hover:bg-white/20">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0">
              <ArrowDownAZ className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {([["name", "名称"], ["size", "大小"], ["modifiedTime", "修改时间"], ["extension", "类型"]] as const).map(([field, label]) => (
              <DropdownMenuItem key={field} onClick={() => onSortClick(field)}>
                <span className="flex-1">{label}</span>
                {sortField === field && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSortClick(sortField)}>
              {sortDirection === "asc" ? "升序 ↑" : "降序 ↓"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={() => onViewModeChange(viewMode === 'list' ? 'grid' : 'list')} className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0">
          {viewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onNewFile}>
              <FilePlus className="h-4 w-4" /><span className="ml-2">新建文件</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewFolder}>
              <FolderPlus className="h-4 w-4" /><span className="ml-2">新建文件夹</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onUpload}>
              <Upload className="h-4 w-4" /><span className="ml-2">上传</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOfflineDownload}>
              <Download className="h-4 w-4" /><span className="ml-2">离线下载</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isTouch && (
          <Button variant="ghost" size="icon" onClick={onToggleMultiSelect} className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0" title="多选">
            <CheckSquare className="h-4 w-4" />
          </Button>
        )}
        {searchOpen ? (
          <div className="relative flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchKeyword}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { onSearchChange(""); setSearchOpen(false) } }}
              onBlur={() => { if (!searchKeyword) setSearchOpen(false) }}
              placeholder="搜索当前目录..."
              className="h-9 w-48 px-3 pr-8 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-white/40 transition-all"
            />
            {searchKeyword && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSearchChange(""); searchInputRef.current?.focus() }}
                className="absolute right-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50) }} className="h-9 w-9 rounded-xl hover:bg-white/20 shrink-0">
            <Search className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
