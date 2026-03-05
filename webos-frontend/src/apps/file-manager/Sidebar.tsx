import { useState, useRef, useEffect } from "react"
import {
  Home,
  Monitor,
  File,
  Download,
  Star,
  Trash2,
  HardDrive,
  Cloud,
  Users,
  Folder,
  ChevronRight,
  ChevronDown,
  Edit3,
  Disc,
  CircleX,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FileInfo, GlobalMenuState, StorageNodeConfig } from "@/types"
import { useToast } from "@/hooks/use-toast"
import { useSidebarConfig } from "@/hooks/useSidebarConfig"
import { getContextMenu } from "@/config/appRegistry"
import { getStorageNodes } from "@/lib/storageApi"
import { request as wsRequest } from "@/stores/webSocketStore"
import { fsService } from "@/lib/services"
import { useWindowStore } from "@/stores/windowStore"

export interface MountedIso {
  name: string
  mountPoint: string
  device: string
}

function useMountedIsos() {
  const [isos, setIsos] = useState<MountedIso[]>([])
  useEffect(() => {
    const unsub = fsService.watchMounts((mounts: any[]) => {
      setIsos((mounts || []).map((m: any) => ({
        name: m.name || m.device,
        mountPoint: m.mountPoint,
        device: m.device,
      })))
    })
    return unsub
  }, [])
  return isos
}

interface SidebarItem {
  id: string
  name: string
  icon: string // 图标名称
  path?: string
  nodeId?: string // 所属存储节点
  isDirectory?: boolean
  children?: SidebarItem[]
  isExpanded?: boolean
}

export interface SidebarProps {
  onNavigate: (path: string) => void
  currentPath: string
  onAddToFavorites?: (file: any) => void
  openGlobalMenu?: (menu: GlobalMenuState) => void
  closeGlobalMenu?: () => void
  activeNodeId?: string
  onSwitchNode?: (nodeId: string) => void
  onNavigateNode?: (nodeId: string, path: string) => void
  totalCount?: number
  selectedCount?: number
  collapsed?: boolean
  onToggleCollapse?: () => void
  showTrash?: boolean
}

export function Sidebar({ onNavigate, currentPath, onAddToFavorites, openGlobalMenu, closeGlobalMenu, activeNodeId, onSwitchNode, onNavigateNode, totalCount = 0, selectedCount = 0, collapsed = false, onToggleCollapse, showTrash = false }: SidebarProps) {
  const {
    sidebarConfig,
    isLoading,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    renameItem,
    toggleExpand
  } = useSidebarConfig()

  const { toast } = useToast()
  const mountedIsos = useMountedIsos()

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState("")
  const [draggedItem, setDraggedItem] = useState<any | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [favDragOver, setFavDragOver] = useState(false)
  const favDragCount = useRef(0)
  const [reorderFrom, setReorderFrom] = useState<number | null>(null)
  const [reorderTo, setReorderTo] = useState<number | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [storageNodes, setStorageNodes] = useState<StorageNodeConfig[]>([])

  // Load storage nodes
  useEffect(() => {
    getStorageNodes().then(setStorageNodes).catch(() => {})
  }, [])

  // 监听添加收藏夹事件
  useEffect(() => {
    const handleAddFavorite = (event: CustomEvent) => {
      const file = event.detail;
      addFavorite({
        name: file.name,
        path: file.path,
        isDir: file.isDir,
        nodeId: file.nodeId
      }).catch(error => {
        console.error("Failed to add favorite:", error)
      })
    }
    
    window.addEventListener('sidebar:addFavorite', handleAddFavorite as EventListener)
    return () => {
      window.removeEventListener('sidebar:addFavorite', handleAddFavorite as EventListener)
    }
  }, [addFavorite])

  // 处理编辑开始
  const startEditing = (itemId: string, itemName: string) => {
    setEditingItemId(itemId)
    setEditingItemName(itemName)
  }

  // 保存编辑
  const saveEditing = async (itemId: string) => {
    if (editingItemName.trim()) {
      try {
        await renameItem(itemId, editingItemName.trim())
      } catch (error) {
        console.error("Failed to rename item:", error)
      }
    }
    setEditingItemId(null)
    setEditingItemName("")
  }

  // 取消编辑
  const cancelEditing = () => {
    setEditingItemId(null)
    setEditingItemName("")
  }

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, item: any) => {
    setDraggedItem(item)
    e.dataTransfer.effectAllowed = "move"
  }

  // 拖拽进入目标
  const handleDragEnter = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    setDropTarget(itemId)
  }

  // 拖拽离开目标
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
  }

  // 拖拽放置
  const handleDrop = (e: React.DragEvent, targetItem: any) => {
    e.preventDefault()
    setDropTarget(null)
    
    // 从dataTransfer获取拖拽的数据
    let droppedItem = null;
    try {
      const data = e.dataTransfer.getData("application/json");
      if (data) {
        droppedItem = JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to parse dropped data:", error);
    }
    
    // 如果没有从dataTransfer获取到数据，使用直接拖拽的项目
    if (!droppedItem && draggedItem) {
      droppedItem = draggedItem;
    }
    
    if (!droppedItem || (droppedItem.id && droppedItem.id === targetItem.id)) {
      setDraggedItem(null)
      return
    }
    
    // 如果目标是"个人收藏"项，则添加到收藏夹
    if (targetItem.id === "home" && onAddToFavorites) {
      // 添加到收藏夹
      addFavorite({
        name: droppedItem.name,
        path: droppedItem.path,
        isDir: droppedItem.isDir,
        nodeId: droppedItem.nodeId
      }).catch(error => {
        console.error("Failed to add favorite:", error)
      })
    }
    
    setDraggedItem(null)
  }

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null)
    setDropTarget(null)
  }

  const handleItemClick = (item: any) => {
    if (item.isDirectory && item.children && item.children.length > 0) {
      toggleExpand(item.id).catch(error => {
        console.error("Failed to toggle expand:", error)
      })
    } else if (item.path) {
      const targetNodeId = item.nodeId || "local_1"
      if (onNavigateNode && targetNodeId !== activeNodeId) {
        onNavigateNode(targetNodeId, item.path)
      } else {
        onNavigate(item.path)
      }
    }
  }

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();

    // 只有收藏夹中的项目才显示右键菜单
    if (!item.id.startsWith('fav-') || !openGlobalMenu) return;

    openGlobalMenu({
      x: e.clientX,
      y: e.clientY,
      config: getContextMenu('fileManager', 'sidebar-favorite'),
      context: { targetItem: item },
      onAction: (action: string) => {
        if (closeGlobalMenu) closeGlobalMenu();
        if (action === 'sidebar.removeFavorite') {
          removeFavorite(item.id).catch(error => {
            console.error("Failed to remove favorite:", error);
          });
        }
      },
    });
  }

  // 根据图标名称获取图标组件
  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'star': return <Star className="h-4 w-4" />
      case 'monitor': return <Monitor className="h-4 w-4" />
      case 'file': return <File className="h-4 w-4" />
      case 'download': return <Download className="h-4 w-4" />
      case 'trash2': return <Trash2 className="h-4 w-4" />
      case 'folder': return <Folder className="h-4 w-4" />
      default: return <File className="h-4 w-4" />
    }
  }

  const renderSidebarItem = (item: any, level = 0, skipDrag = false) => {
    const isExpanded = sidebarConfig.expandedItems.includes(item.id)
    const hasChildren = item.children && item.children.length > 0
    const isActive = item.path === currentPath
    const isEditing = editingItemId === item.id
    const isDropTarget = dropTarget === item.id

    return (
      <div key={item.id}>
        <div
          draggable={!skipDrag && item.id !== "home"}
          onDragStart={!skipDrag ? (e) => handleDragStart(e, item) : undefined}
          onDragEnter={!skipDrag ? (e) => handleDragEnter(e, item.id) : undefined}
          onDragLeave={!skipDrag ? handleDragLeave : undefined}
          onDragOver={!skipDrag ? (e) => e.preventDefault() : undefined}
          onDrop={!skipDrag ? (e) => handleDrop(e, item) : undefined}
          onDragEnd={!skipDrag ? handleDragEnd : undefined}
          onContextMenu={(e) => handleContextMenu(e, item)}
        >
          <Button
            variant="ghost"
            className={`w-full justify-start px-2 py-1.5 h-auto rounded-md text-left relative group ${
              isActive ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30" : "hover:bg-white/20 text-slate-700"
            } ${isDropTarget && item.id === "home" ? "bg-blue-500/30" : ""}`}
            onClick={() => handleItemClick(item)}
            onDoubleClick={() => startEditing(item.id, item.name)}
          >
            <div className="flex items-center w-full">
              {hasChildren && (
                <span className="mr-1">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </span>
              )}
              {!hasChildren && level > 0 && (
                <span className="mr-1 w-3" />
              )}
              <span className="mr-2">
                {getIconComponent(item.icon)}
              </span>
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingItemName}
                  onChange={(e) => setEditingItemName(e.target.value)}
                  onBlur={() => saveEditing(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditing(item.id)
                    if (e.key === "Escape") cancelEditing()
                  }}
                  className="flex-1 bg-white/20 rounded px-1 text-sm"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm flex-1 truncate">{item.name}</span>
              )}
              {!isEditing && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    startEditing(item.id, item.name)
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded p-1 cursor-pointer"
                >
                  <Edit3 className="h-3 w-3" />
                </span>
              )}
            </div>
          </Button>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children?.map((child: any) => renderSidebarItem(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`flex flex-col h-full ${collapsed ? 'w-10' : 'w-56'} bg-white/10 backdrop-blur-xl border-r border-white/20 transition-all duration-200`}>
        <div className="px-4 py-3 border-b border-white/20 flex items-center justify-between">
          {!collapsed && <h2 className="text-sm font-semibold text-slate-800">文件管理</h2>}
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="p-0.5 rounded hover:bg-white/20 text-slate-600 transition-colors">
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${collapsed ? 'w-10' : 'w-56'} bg-white/10 backdrop-blur-xl border-r border-white/20 transition-all duration-200 shrink-0`}>
      {/* 侧边栏标题 */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} py-3 border-b border-white/20 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <h2 className="text-sm font-semibold text-slate-800">文件管理</h2>}
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="p-0.5 rounded hover:bg-white/20 text-slate-600 transition-colors" title={collapsed ? '展开侧栏' : '折叠侧栏'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>
      
      {/* 侧边栏内容 */}
      {!collapsed && (
      <div className="flex-1 overflow-y-auto py-2">
        {/* 个人收藏 */}
        <div
          className={`px-2 mb-2 transition-colors ${favDragOver ? "bg-blue-500/10 rounded-lg" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault()
            favDragCount.current++
            setFavDragOver(true)
          }}
          onDragLeave={() => {
            favDragCount.current--
            if (favDragCount.current <= 0) {
              favDragCount.current = 0
              setFavDragOver(false)
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            favDragCount.current = 0
            setFavDragOver(false)
            handleDrop(e, { id: "home" })
          }}
        >
          <div
            className="flex items-center justify-between px-2 py-1 cursor-pointer"
            onClick={() => {
              const homeItem = sidebarConfig.items.find(item => item.id === "home")
              if (homeItem) toggleExpand(homeItem.id)
            }}
          >
            <div className="flex items-center gap-1">
              {sidebarConfig.expandedItems.includes("home") ? (
                <ChevronDown className="h-3 w-3 text-slate-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-slate-500" />
              )}
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide">个人收藏</h3>
            </div>
            <Star className="h-3 w-3 text-slate-400" />
          </div>
          {sidebarConfig.expandedItems.includes("home") && (
            <div className="space-y-0 mt-1">
              {sidebarConfig.items.find(item => item.id === "home")?.children?.map((child, index) => (
                <div
                  key={child.id}
                  draggable
                  onDragStart={(e) => {
                    setReorderFrom(index)
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", JSON.stringify(child))
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (reorderFrom !== null) {
                      e.stopPropagation()
                      if (reorderFrom !== index) {
                        setReorderTo(index)
                      }
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (reorderFrom !== null) {
                      e.stopPropagation()
                      if (reorderFrom !== index) {
                        reorderFavorites(reorderFrom, index)
                      }
                      setReorderFrom(null)
                      setReorderTo(null)
                    }
                  }}
                  onDragEnd={() => {
                    setReorderFrom(null)
                    setReorderTo(null)
                    favDragCount.current = 0
                    setFavDragOver(false)
                  }}
                  className={`relative ${reorderFrom === index ? "opacity-40" : ""}`}
                >
                  {reorderTo === index && reorderFrom !== null && reorderFrom !== index && (
                    <div className={`absolute left-2 right-2 h-0.5 bg-blue-500 rounded-full ${reorderFrom > index ? "top-0" : "bottom-0"}`} />
                  )}
                  {renderSidebarItem(child, 1, true)}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 快捷访问 */}
        <div className="space-y-1 px-2">
          {sidebarConfig.items.filter(item => item.id !== "home").map(item => renderSidebarItem(item))}
        </div>
        
        {/* 分隔线 */}
        <div className="mx-4 my-3 border-t border-white/20" />
        
        {/* 位置标签 */}
        <div className="px-2">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 px-2">位置</h3>
          <div className="space-y-1">
            {storageNodes.map(node => (
              <Button
                key={node.id}
                variant="ghost"
                className={`w-full justify-start px-2 py-1.5 h-auto rounded-md text-left group ${
                  activeNodeId === node.id ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30" : "hover:bg-white/20 text-slate-700"
                }`}
                onClick={() => onSwitchNode?.(node.id)}
              >
                {node.type === 's3' ? (
                  <Cloud className="h-4 w-4 mr-2" />
                ) : (
                  <HardDrive className="h-4 w-4 mr-2" />
                )}
                <span className="text-sm flex-1">{node.name}</span>
              </Button>
            ))}
            {storageNodes.length === 0 && (
              <Button
                variant="ghost"
                className={`w-full justify-start px-2 py-1.5 h-auto rounded-md text-left hover:bg-white/20 text-slate-700 group ${
                  activeNodeId === 'local_1' ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30" : ""
                }`}
                onClick={() => onSwitchNode?.("local_1")}
              >
                <HardDrive className="h-4 w-4 mr-2" />
                <span className="text-sm flex-1">本地磁盘</span>
              </Button>
            )}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="mx-4 my-3 border-t border-white/20" />

        {/* 回收站 */}
        <div className="px-2">
          <Button
            variant="ghost"
            className={`w-full justify-start px-2 py-1.5 h-auto rounded-md text-left ${
              showTrash ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30" : "hover:bg-white/20 text-slate-700"
            }`}
            onClick={() => useWindowStore.getState().openWindow('fileManager', { forceNew: true, appDataOptions: { showTrash: true } })}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            <span className="text-sm flex-1">回收站</span>
          </Button>
        </div>

        {/* 已挂载的磁盘映像 */}
        {mountedIsos.length > 0 && (
          <>
            <div className="mx-4 my-3 border-t border-white/20" />
            <div className="px-2">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 px-2">磁盘映像</h3>
              <div className="space-y-1">
                {mountedIsos.map(iso => (
                  <Button
                    key={iso.mountPoint}
                    variant="ghost"
                    className={`w-full justify-start px-2 py-1.5 h-auto rounded-md text-left group ${
                      currentPath.startsWith(iso.mountPoint) ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30" : "hover:bg-white/20 text-slate-700"
                    }`}
                    onClick={() => onNavigate(iso.mountPoint)}
                  >
                    <Disc className="h-4 w-4 mr-2 text-amber-500" />
                    <span className="text-sm flex-1 truncate">{iso.name}</span>
                    <span
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          const resp = await wsRequest('exec', { command: `umount "${iso.mountPoint}" && rmdir "${iso.mountPoint}"` })
                          if (resp.exitCode !== 0) {
                            toast({ title: "卸载失败", description: resp.stderr || "无法卸载", variant: "destructive" })
                            return
                          }
                          toast({ title: "已推出", description: `${iso.name} 已卸载` })
                        } catch {
                          toast({ title: "错误", description: "卸载失败", variant: "destructive" })
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded p-1 cursor-pointer"
                    >
                      <CircleX className="h-3.5 w-3.5" />
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* 底部标签 */}
      {!collapsed && (
      <div className="px-4 py-3 border-t border-white/20">
        <div className="flex items-center text-xs text-slate-500">
          <span>{totalCount} 个项目{selectedCount > 0 ? `，已选择 ${selectedCount} 个` : ''}</span>
        </div>
      </div>
      )}
    </div>
  )
}