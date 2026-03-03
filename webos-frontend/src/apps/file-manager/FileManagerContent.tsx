import { useState, useEffect, useRef, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import type { FileInfo } from "@/types"
import { Sidebar } from "./Sidebar"
import { useWindowStore, useUIStore } from "@/stores"
import { useCurrentProcess } from "@/hooks/useCurrentProcess"
import { useFileManagerStore } from "./store"
import { TabBar, TabPanel, TrashView } from "./components"

export function FileManagerContent({ windowId }: { windowId: string }) {
  const addFmTab = useFileManagerStore((s) => s.addFmTab)
  const closeFmTab = useFileManagerStore((s) => s.closeFmTab)
  const switchFmTab = useFileManagerStore((s) => s.switchFmTab)
  const reorderFmTabs = useFileManagerStore((s) => s.reorderFmTabs)
  const updateFmTabState = useFileManagerStore((s) => s.updateFmTabState)
  const { procState } = useCurrentProcess(windowId)
  const fmTabs = (procState.fmTabs || []) as any[]
  const activeFmTabIndex = (procState.activeFmTabIndex as number) ?? 0
  const openGlobalMenu = useUIStore((s) => s.openGlobalMenu)
  const closeGlobalMenu = useUIStore((s) => s.closeGlobalMenu)
  const { toast } = useToast()

  const fileManagerRef = useRef<HTMLDivElement>(null)
  const clipboard = useFileManagerStore((s) => s.clipboard)
  const setClipboard = useFileManagerStore((s) => s.setClipboard)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 640)
  const [showTrash, setShowTrash] = useState(() => !!(procState.showTrash))
  const [fileCounts, setFileCounts] = useState({ total: 0, selected: 0 })

  // Set window title to 回收站 if opened in trash mode
  useEffect(() => {
    if (showTrash) {
      useWindowStore.getState().updateWindowTitle(windowId, '回收站')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive active tab info for sidebar
  const activeTab = fmTabs[activeFmTabIndex]
  const currentPath = activeTab?.currentPath ?? "/"
  const activeNodeId = activeTab?.activeNodeId ?? "local_1"

  // Sidebar navigation helpers (operate on active tab)
  const navigateTo = useCallback((path: string) => {
    const newHistory = (activeTab?.history ?? ["/"]).slice(0, (activeTab?.historyIndex ?? 0) + 1)
    newHistory.push(path)
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, activeFmTabIndex, {
      currentPath: path, history: newHistory, historyIndex: newHistory.length - 1, title,
    })
  }, [activeTab, windowId, activeFmTabIndex, updateFmTabState])

  const handleSwitchNode = (nodeId: string) => {
    updateFmTabState(windowId, activeFmTabIndex, {
      activeNodeId: nodeId, currentPath: "/", history: ["/"], historyIndex: 0, selectedFiles: [], title: "/",
    })
  }

  const handleNavigateNode = useCallback((nodeId: string, path: string) => {
    const title = path.split('/').filter(Boolean).pop() || '/'
    updateFmTabState(windowId, activeFmTabIndex, {
      activeNodeId: nodeId, currentPath: path, history: [path], historyIndex: 0, selectedFiles: [], title,
    })
  }, [windowId, activeFmTabIndex, updateFmTabState])

  const addFavorite = (file: FileInfo) => {
    toast({ title: "已添加", description: `已将 "${file.name}" 添加到个人收藏` })
    window.dispatchEvent(new CustomEvent('sidebar:addFavorite', { detail: file }))
  }

  const handleFileCountChange = useCallback((total: number, selected: number) => {
    setFileCounts({ total, selected })
  }, [])

  return (
    <div
      ref={fileManagerRef}
      className="flex h-full relative"
      data-file-manager-content="true"
      tabIndex={0}
      onClick={() => fileManagerRef.current?.focus()}
    >
      <Sidebar
        onNavigate={(path) => { setShowTrash(false); navigateTo(path) }} currentPath={currentPath}
        onAddToFavorites={addFavorite} openGlobalMenu={openGlobalMenu} closeGlobalMenu={closeGlobalMenu}
        activeNodeId={activeNodeId} onSwitchNode={(nodeId) => { setShowTrash(false); handleSwitchNode(nodeId) }}
        onNavigateNode={(nodeId, path) => { setShowTrash(false); handleNavigateNode(nodeId, path) }}
        totalCount={fileCounts.total} selectedCount={fileCounts.selected}
        collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        showTrash={showTrash}
      />

      {showTrash ? (
        <TrashView activeNodeId={activeNodeId} toast={toast} />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <TabBar
            fmTabs={fmTabs} activeFmTabIndex={activeFmTabIndex} windowId={windowId}
            addFmTab={addFmTab} closeFmTab={closeFmTab} switchFmTab={switchFmTab} reorderFmTabs={reorderFmTabs}
          />
          <div className="flex-1 relative min-h-0">
            {fmTabs.map((tab, index) => (
              <TabPanel
                key={tab.id}
                windowId={windowId}
                tabIndex={index}
                tab={tab}
                isActive={index === activeFmTabIndex}
                onFileCountChange={handleFileCountChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default FileManagerContent
