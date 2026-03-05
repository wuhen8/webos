import { useState, useRef, useCallback, useEffect } from "react"
import FmEdit from "@/components/FmEdit"
import type { FmEditApi } from "@/components/FmEdit"
import {
  Save,
  X,
  FileCode,
  Edit3,
  FilePlus,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { WindowState, EditorTab, FileInfo } from "@/types"
import { useProcessStore, useSettingsStore, wrapStateRef, dragTabRef } from "@/stores"
import { useWindowStore } from "@/stores/windowStore"
import { useCurrentProcess } from "@/hooks/useCurrentProcess"
import { useEditorStore } from "./store"
import { getFileType } from "@/lib/utils"

interface EditorContentProps {
  win: WindowState
}

function EditorContent({ win }: EditorContentProps) {
  const { toast } = useToast()
  const fontSize = useSettingsStore((s) => s.fontSize)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const setEditorTheme = useSettingsStore((s) => s.setEditorTheme)

  // Read editor state from process state
  const { procState: d } = useCurrentProcess(win.id)
  const tabs = (d.tabs || []) as EditorTab[]
  const activeTabIndex = (d.activeTabIndex as number) || 0
  const file = d.file as FileInfo | undefined
  const content = (d.content as string) || ""
  const isModified = (d.isModified as boolean) || false

  const [isEditingPath, setIsEditingPath] = useState(false)
  const [editFullPath, setEditFullPath] = useState("")
  const pathInputRef = useRef<HTMLInputElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fmEditApiRef = useRef<FmEditApi | null>(null)

  // Get current tab state
  const currentTab = tabs[activeTabIndex]
  const isNewFile = currentTab?.isNew === true

  // Start editing path
  const startEditPath = useCallback(() => {
    const currentWin = useWindowStore.getState().windows.find(w => w.id === win.id)
    if (!currentWin) return
    const proc = useProcessStore.getState().getProcess(currentWin.pid)
    setEditFullPath((proc?.state as any)?.file?.path || "/Users/未命名.txt")
    setIsEditingPath(true)
    setTimeout(() => {
      pathInputRef.current?.focus()
      pathInputRef.current?.select()
    }, 50)
  }, [win.id])

  const cancelPathEdit = () => {
    setIsEditingPath(false)
  }

  // Handle save
  const handleSave = useCallback(async () => {
    const currentWin = useWindowStore.getState().windows.find(w => w.id === win.id)
    if (!currentWin) return
    const proc = useProcessStore.getState().getProcess(currentWin.pid)
    if (!proc) return
    const wd = proc.state as Record<string, any>
    const tab = (wd.tabs as EditorTab[])?.[wd.activeTabIndex || 0]
    const isNew = tab?.isNew === true

    if (isNew) {
      startEditPath()
    } else {
      const ok = await useEditorStore.getState().saveEditorContent(currentWin.id)
      if (ok) toast({ title: "成功", description: "保存成功" })
      else toast({ title: "错误", description: "保存失败，请检查路径权限", variant: "destructive" })
    }
  }, [win.id, startEditPath, toast])

  // Save with path
  const handleSaveWithPath = async () => {
    if (editFullPath.trim()) {
      useEditorStore.getState().updateFilePath(win.id, activeTabIndex, editFullPath.trim())
      const success = await useEditorStore.getState().saveEditorContent(win.id, editFullPath.trim())
      if (success) {
        setIsEditingPath(false)
        toast({ title: "成功", description: "保存成功" })
      } else {
        toast({ title: "错误", description: "保存失败，请检查路径权限", variant: "destructive" })
      }
    }
  }

  // Path blur auto-save
  const handlePathBlur = async () => {
    if (editFullPath.trim() && editFullPath.trim() !== file?.path) {
      useEditorStore.getState().updateFilePath(win.id, activeTabIndex, editFullPath.trim())
      const success = await useEditorStore.getState().saveEditorContent(win.id, editFullPath.trim())
      if (success) {
        setIsEditingPath(false)
        toast({ title: "成功", description: "保存成功" })
      } else {
        toast({ title: "错误", description: "保存失败，请检查路径权限", variant: "destructive" })
      }
    } else if (editFullPath.trim() === file?.path) {
      setIsEditingPath(false)
    }
  }

  const handleToggleWrap = () => {
    const result = useEditorStore.getState().toggleWordWrap(win.id)
    if (result.ok) toast({ title: "切换换行", description: result.message })
    else toast({ title: "提示", description: result.message, variant: "destructive" })
  }

  // Handle application-level keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // Cmd/Ctrl+S - Save
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }

      // Shift+Alt+F - Format
      if (e.shiftKey && e.altKey && e.key === 'f') {
        e.preventDefault()
        const result = await useEditorStore.getState().formatEditor(win.id)
        if (result.ok) {
          toast({ title: "格式化", description: result.message })
        } else {
          toast({ title: "格式化失败", description: result.message, variant: "destructive" })
        }
        return
      }

      // Cmd/Ctrl+N - New tab
      if (cmdOrCtrl && e.key === 'n') {
        e.preventDefault()
        useEditorStore.getState().addNewEditorTab(win.id)
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [win.id, handleSave, toast])

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50/50 to-white/30">
      {/* 标签页栏 */}
      {tabs.length > 0 && (
        <div className="flex items-center h-11 px-2 bg-white/40 backdrop-blur-2xl border-b border-slate-200/60 overflow-x-auto gap-1">
          {tabs.map((tab, index) => (
            <div
              key={tab.file.path + index}
              draggable
              onDragStart={(e) => {
                dragTabRef.current = { windowId: win.id, fromIndex: index }
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", String(index))
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
              }}
              onDrop={(e) => {
                e.preventDefault()
                const dragging = dragTabRef.current
                dragTabRef.current = null
                if (!dragging) return
                if (dragging.windowId !== win.id) return
                if (dragging.fromIndex === index) return
                useEditorStore.getState().reorderEditorTabs(win.id, dragging.fromIndex, index)
              }}
              onDragEnd={() => {
                dragTabRef.current = null
              }}
              onClick={() => useEditorStore.getState().switchEditorTab(win.id, index)}
              className={`group flex items-center gap-2 px-3 py-1.5 min-w-[6.25rem] max-w-[11.25rem] cursor-pointer rounded-lg transition-all duration-200 ${
                index === activeTabIndex
                  ? "bg-white shadow-sm text-slate-800 border border-slate-200/80"
                  : "bg-transparent text-slate-600 hover:bg-white/60 border border-transparent"
              }`}
            >
              <FileCode className={`h-3.5 w-3.5 flex-shrink-0 ${index === activeTabIndex ? "text-purple-500" : "text-slate-400"}`} />
              <span className="text-xs font-medium truncate flex-1">{tab.file.name}</span>
              {tab.isNew && (
                <span className="px-1.5 py-0.5 text-[0.625rem] bg-blue-100 text-blue-600 rounded font-medium">新</span>
              )}
              {tab.isModified && !tab.isNew && (
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 shadow-sm" />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); useEditorStore.getState().closeEditorTab(win.id, index) }}
                className="opacity-0 group-hover:opacity-100 hover:bg-slate-200/80 rounded p-0.5 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => useEditorStore.getState().addNewEditorTab(win.id)}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all"
            title="新建文件"
          >
            <FilePlus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 路径栏 */}
      <div className="flex items-center h-12 px-4 bg-white/60 backdrop-blur-xl border-b border-slate-200/60 gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 flex-shrink-0">
          <FileCode className="h-4 w-4 text-purple-600" />
        </div>

        {isEditingPath ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Input
              ref={pathInputRef}
              value={editFullPath}
              onChange={(e) => setEditFullPath(e.target.value)}
              className="h-8 text-sm bg-white border-slate-200 flex-1 font-mono"
              placeholder="输入完整路径，如 /Users/xxx/Documents/index.js"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveWithPath()
                if (e.key === "Escape") cancelPathEdit()
              }}
              onBlur={handlePathBlur}
            />
            <Button
              size="sm"
              onClick={handleSaveWithPath}
              className="h-8 px-3 bg-purple-500 hover:bg-purple-600 text-white"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
              onClick={cancelPathEdit}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div
              className="flex-1 min-w-0 cursor-pointer group"
              onClick={startEditPath}
              title="点击编辑路径"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800 truncate">
                  {file?.path || "未保存"}
                </span>
                <Edit3 className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                onClick={handleSave}
                className={`h-8 px-3 rounded-lg transition-all ${
                  isModified || isNewFile
                    ? "bg-purple-500 hover:bg-purple-600 text-white shadow-sm"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-slate-100"
                onClick={handleToggleWrap}
                title="切换自动换行"
              >
                <Type className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-slate-100"
                onClick={() => setEditorTheme(editorTheme === "vs" ? "vs-dark" : "vs")}
                title={`切换到${editorTheme === "vs" ? "深色" : "浅色"}主题`}
              >
                {editorTheme === "vs" ? (
                  <div className="h-4 w-4 bg-black rounded-sm" />
                ) : (
                  <div className="h-4 w-4 bg-white border border-gray-300 rounded-sm" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 编辑器主体 */}
      <div className="flex-1 relative overflow-hidden">
        <FmEdit
          value={content}
          onChange={(value) => useEditorStore.getState().updateEditorContent(win.id, value)}
          language={file ? getFileType(file.name) : "plaintext"}
          theme={editorTheme as 'vs' | 'vs-dark'}
          fontSize={fontSize}
          wordWrap={wrapStateRef[win.id] ?? true}
          onSave={() => handleSave()}
          onBlur={() => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = setTimeout(() => {
              const currentWin = useWindowStore.getState().windows.find(w => w.id === win.id)
              if (!currentWin) return
              const proc = useProcessStore.getState().getProcess(currentWin.pid)
              if (!proc) return
              const wd = proc.state as Record<string, any>
              const tab = (wd.tabs as EditorTab[])?.[wd.activeTabIndex || 0]
              if (tab && !tab.isNew && wd.isModified) {
                useEditorStore.getState().saveEditorContent(currentWin.id)
              }
            }, 500)
          }}
          onMount={(api) => {
            fmEditApiRef.current = api
            wrapStateRef[win.id] = true
          }}
        />
      </div>

      {/* 状态栏 */}
      <div className="h-7 px-4 bg-slate-100/80 backdrop-blur-xl border-t border-slate-200/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            {isNewFile ? (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-600 font-medium">新文件</span>
              </>
            ) : isModified ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-600">未保存</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-emerald-600">已保存</span>
              </>
            )}
          </div>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">
            {tabs.length} 个文件
          </span>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <span className="px-2 py-0.5 bg-slate-200/60 rounded text-[0.6875rem] font-medium">
            {file ? getFileType(file.name).toUpperCase() : "TXT"}
          </span>
          <span>UTF-8</span>
          <span>字号 {fontSize}</span>
        </div>
      </div>
    </div>
  )
}

export default EditorContent
