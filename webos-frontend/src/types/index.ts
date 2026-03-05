
// 菜单项配置
export interface MenuItemConfig {
  label: string
  shortcut?: string
  action?: string
  disabled?: boolean
  dividerAfter?: boolean
}

// 菜单配置
export interface MenuConfig {
  label: string
  items: MenuItemConfig[]
}

// 文件关联声明
export interface FileAssociation {
  extensions: string[]       // ['.jpg', '.jpeg', '.png']
  label?: string             // "打开方式"菜单中的显示名，默认用 app name
  icon?: string              // "打开方式"菜单中的图标，默认用 app icon
}

// openFile context — 窗口管理器提供给 app 的系统 API
export interface OpenFileContext {
  // 窗口操作
  createWindow: (options: {
    type: string
    title: string
    appId?: string
    size?: { width: number; height: number }
    position?: { x: number; y: number }
    appData?: Record<string, unknown>
  }) => string  // 返回 windowId
  activateWindow: (id: string) => void
  updateWindowTitle: (id: string, title: string) => void

  // 查询
  findWindow: (predicate: (w: WindowState & { appData?: Record<string, unknown> }) => boolean) => (WindowState & { appData?: Record<string, unknown> }) | undefined
  getAppData: (windowId: string) => Record<string, unknown>

  // 进程操作（用于 singleton/backgroundable app）
  findProcess: (predicate: (p: { pid: string; appId: string; state: Record<string, unknown> }) => boolean) => { pid: string; appId: string; state: Record<string, unknown> } | undefined
  updateAppData: (windowId: string, patch: Record<string, unknown>) => void
  setAppData: (windowId: string, updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  updateProcessState: (pid: string, patch: Record<string, unknown>) => void
  setProcessState: (pid: string, updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  restoreProcessWindow: (appId: string) => void

  // 工具
  resolveMediaUrl: (nodeId: string, filePath: string) => Promise<string>
}

// App 打开文件的 handler
export type AppFileOpener = (
  file: FileInfo,
  ctx: OpenFileContext,
) => Promise<{ ok: boolean; message?: string }>

// 应用配置
export interface AppConfig {
  id: string
  name: string
  icon: string              // lucide 图标名，如 "Folder"
  url?: string              // 有此字段的 app 用 iframe 渲染
  gradient: string
  shadow: string
  defaultSize: { width: number; height: number }
  defaultPosition?: { xOffset: number; yOffset: number }
  singleton: boolean
  autoNumber?: boolean
  backgroundable?: boolean  // 关闭窗口后进程是否保留（后台运行）
  showInDock: boolean
  hidden?: boolean            // 隐藏的工具窗口，不出现在启动台和 Dock 菜单
  dockOrder: number
  menus: MenuConfig[]
  contextMenus?: Record<string, ContextMenuConfig>
  defaultAppData?: (options?: Record<string, unknown>) => Record<string, unknown>
  fileAssociations?: FileAssociation[]
  openFile?: AppFileOpener
  windowType?: string  // 窗口类型，默认用 appId
}

// 存储节点配置
export interface StorageNodeConfig {
  id: string
  name: string
  type: 'local' | 's3'
  config: Record<string, any>
}

// 文件信息类型
export interface FileInfo {
  name: string
  path: string
  isDir: boolean
  size: number
  extension: string
  modifiedTime: string
  nodeId?: string
  itemCount?: number
  isSymlink?: boolean
  symlinkTarget?: string
}

// 窗口类型（使用 string 以支持动态注册新应用）
export type WindowType = string

// 编辑器标签页
export interface EditorTab {
  file: FileInfo
  content: string
  isModified: boolean
  isNew?: boolean  // 是否为新建文件（未保存到磁盘）
}

// 路径级视图状态缓存
export interface PathViewState {
  files: FileInfo[]
  scrollTop: number
  timestamp: number
}

// 文件管理器标签页
export interface FileManagerTab {
  id: string
  currentPath: string
  history: string[]
  historyIndex: number
  files: FileInfo[]
  selectedFiles: string[]
  activeNodeId: string
  title: string
  pathCache?: Record<string, PathViewState>
}

// 终端标签页
export interface TerminalTab {
  id: string
  title: string
  initialCommand?: string
}

// 音乐播放列表曲目
export interface MusicTrack {
  id: string
  title: string
  src: string
  filePath: string
  nodeId: string
}

// 进程状态
export interface Process {
  pid: string
  appId: string
  state: Record<string, unknown>
  windowIds: string[]
  createdAt: number
}

// 窗口状态
export interface WindowState {
  id: string
  type: WindowType
  pid: string               // 关联的进程 ID
  appId?: string            // 注册表中的 app id（webview 窗口用于 Dock 匹配）
  title: string
  isMinimized: boolean
  isMaximized: boolean
  isActive: boolean
  zIndex: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  preMaximize?: { x: number; y: number; width: number; height: number }
  parentId?: string             // 父窗口 ID（子窗口跟随父窗口最小化/关闭）
}

// 剪贴板状态
export interface ClipboardState {
  files: FileInfo[]
  action: 'copy' | 'move'
  sourceNodeId: string
}

// 右键菜单上下文（传给动态函数用于求值）
export interface ContextMenuContext {
  selectedFiles?: FileInfo[]
  selectedCount?: number
  clipboard?: ClipboardState | null
  clipboardCount?: number
  targetFile?: FileInfo | null
  pid?: number
  [key: string]: any
}

// 右键菜单项
export interface ContextMenuItemConfig {
  id: string
  label: string
  icon?: string                    // lucide 图标名
  action: string
  url?: string                     // webview 打开的网址
  variant?: 'default' | 'danger'
  visible?: boolean | string
  dividerAfter?: boolean | string
  children?: ContextMenuEntry[]    // 子菜单
}

// 右键菜单头部（不可点击的信息行）
export interface ContextMenuHeaderConfig {
  id: string
  type: 'header'
  label: string
  visible?: boolean | string
}

// 右键菜单分隔线
export interface ContextMenuDividerConfig {
  id: string
  type: 'divider'
  visible?: boolean | string
}

// 联合类型
export type ContextMenuEntry =
  | (ContextMenuItemConfig & { type?: 'item' })
  | ContextMenuHeaderConfig
  | ContextMenuDividerConfig

// 右键菜单配置
export interface ContextMenuConfig {
  id: string
  items: ContextMenuEntry[]
}

// 全局菜单状态
export interface GlobalMenuState {
  x: number
  y: number
  config: ContextMenuConfig
  context: ContextMenuContext
  onAction: (action: string, item?: ContextMenuItemConfig) => void
}

// 菜单 Action 上下文
export interface MenuActionContext {
  windowId?: string       // 当前活动窗口 ID
  windowType?: string     // 当前活动窗口类型
  pid?: string            // 当前活动窗口的进程 ID
}

// 菜单 Action Handler
export type MenuActionHandler = (ctx: MenuActionContext) => void | Promise<void>

// 全局确认弹窗选项
export interface ConfirmDialogOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  icon?: React.ReactNode
  onConfirm: () => void
}
