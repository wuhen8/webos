# 前端架构文档

## 目录

- [项目概览](#项目概览)
- [目录结构](#目录结构)
- [应用系统（Apps）](#应用系统apps)
- [全局组件](#全局组件)
- [shadcn/ui 基础组件](#shadcnui-基础组件)
- [状态管理（Stores）](#状态管理stores)
- [自定义 Hooks](#自定义-hooks)
- [配置与注册中心](#配置与注册中心)
- [工具库（lib）](#工具库lib)
- [快捷键](#快捷键)
- [右键菜单系统](#右键菜单系统)
- [认证流程](#认证流程)
- [WebSocket 通信协议](#websocket-通信协议)
- [文件上传机制](#文件上传机制)
- [架构待改进项](#架构待改进项)

---

## 项目概览

前端采用 **React 18 + TypeScript + Vite 5** 构建，模拟 macOS 桌面体验。核心设计理念：

- **窗口式导航**：没有传统路由，所有功能以窗口形式呈现，通过 `windowStore` 管理窗口 UI
- **进程-窗口分离**：`processStore` 管理进程生命周期和 App 内部状态，`windowStore` 只管窗口表现，支持后台运行
- **模块化应用**：每个功能是独立的 App，通过 manifest 声明配置，通过 renderer 提供 UI，通过 `store.ts` 管理业务状态
- **自动发现**：使用 `import.meta.glob()` 自动收集所有 App 的 manifest 和 renderer，无需手动注册
- **Store 驱动**：组件直接从 Zustand Store 读取状态，不依赖 props 层层传递

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript 5.7 |
| 构建 | Vite 5 |
| 状态管理 | Zustand 5 |
| UI 组件 | shadcn/ui（Radix UI + Tailwind） |
| 样式 | Tailwind CSS 4 |
| 代码编辑 | Monaco Editor 0.55 |
| 终端 | xterm.js 5.5 |
| 视频播放 | ArtPlayer 5.3 |
| 动画 | framer-motion 12 |
| HTTP | Axios 1.6 |
| 图标 | lucide-react |
| Markdown | react-markdown + remark-gfm + rehype-highlight |

---

## 目录结构

```
webos-frontend/src/
├── App.tsx                              # 主应用：编排窗口、Dock、菜单栏、快捷键
├── main.tsx                             # React 入口：挂载 App + Toaster
├── index.css                            # 全局样式
│
├── apps/                                # 模块化应用目录
│   ├── file-manager/                    # 文件管理器
│   │   ├── manifest.ts                  # 应用配置声明
│   │   ├── renderer.tsx                 # 渲染组件
│   │   ├── store.ts                     # 文件管理器标签页状态
│   │   └── ...                          # 其他应用内部文件
│   ├── editor/                          # 代码编辑器（含 store.ts 管理编辑器标签页）
│   ├── terminal/                        # 终端模拟器（含 store.ts 管理终端标签页）
│   ├── docker/                          # Docker 管理
│   ├── settings/                        # 系统设置
│   ├── about/                           # 关于对话框
│   ├── disk-manager/                    # 磁盘管理
│   ├── music-player/                    # 音乐播放器（含 store.ts、GlobalMusicPlayer.tsx）
│   ├── video/                           # 视频播放器
│   ├── image/                           # 图片查看器
│   ├── markdown/                        # Markdown 预览
│   ├── webview/                         # 通用 iframe 容器
│   └── task-manager/                    # 后台任务监控
│
├── components/                          # 全局 UI 组件
│   ├── Window.tsx                       # 窗口容器
│   ├── TopMenuBar.tsx                   # 顶部菜单栏
│   ├── Dock.tsx                         # 底部 Dock
│   ├── LoginScreen.tsx                  # 登录界面
│   ├── SpotlightSearch.tsx              # 搜索面板
│   ├── ContextMenuRenderer.tsx          # 右键菜单渲染器
│   ├── TaskIndicator.tsx                # 后台任务指示器
│   └── ui/                              # shadcn/ui 基础组件
│       ├── button.tsx
│       ├── input.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       └── toaster.tsx
│
├── stores/                              # Zustand 状态管理
│   ├── index.ts                         # 统一导出
│   ├── windowStore.ts                   # 窗口 UI 管理（位置、大小、层级、焦点）
│   ├── processStore.ts                  # 进程生命周期管理（App 内部状态容器）
│   ├── authStore.ts                     # 认证状态
│   ├── uiStore.ts                       # 全局 UI 状态
│   ├── settingsStore.ts                 # 用户偏好设置
│   ├── webSocketStore.ts                # WebSocket 连接与操作
│   ├── taskStore.ts                     # 后台任务追踪
│   └── editorRefs.ts                    # Monaco 编辑器实例引用
│
├── hooks/                               # 自定义 Hooks
│   ├── useHotkeys.ts                    # 全局快捷键
│   ├── useSidebarConfig.ts              # 侧边栏配置
│   ├── useSystemWebSocket.ts            # WebSocket 生命周期
│   └── use-toast.ts                     # Toast 通知
│
├── config/                              # 配置与注册中心
│   ├── appRegistry.ts                   # App manifest 收集与合并
│   ├── componentRegistry.tsx            # App renderer 映射
│   ├── actionRegistry.ts               # 菜单 action 处理器
│   ├── contextMenus.ts                  # 右键菜单定义
│   ├── fileAssociationRegistry.ts       # 文件类型 → App 映射
│   └── lazyLoad.tsx                     # 代码分割工具
│
├── lib/                                 # 工具库
│   ├── request.ts                       # Axios 封装（JWT 拦截器）
│   ├── storageApi.ts                    # 统一文件系统 API
│   ├── createAppStateHook.ts            # App 级状态 Hook 工厂
│   ├── monaco.ts                        # Monaco 编辑器配置
│   ├── utils.ts                         # 通用工具函数
│   └── services/                        # WebSocket 业务层服务
│       ├── index.ts                     # 统一导出 barrel
│       ├── fsService.ts                 # 文件系统操作
│       ├── terminalService.ts           # 终端操作
│       ├── dockerService.ts             # Docker 操作
│       ├── taskService.ts              # 后台任务 & 定时任务
│       └── execService.ts              # 通用命令执行
│
└── types/
    └── index.ts                         # 所有共享类型定义
```

---

## 应用系统（Apps）

### 架构设计

每个 App 是 `src/apps/{appName}/` 下的独立目录，至少包含两个文件：

| 文件 | 作用 |
|------|------|
| `manifest.ts` | 声明应用配置（ID、名称、图标、窗口大小、菜单、文件关联等） |
| `renderer.tsx` | 导出 `renderer` 函数，接收 `AppRenderContext` 返回 React 组件 |

系统通过 `import.meta.glob()` 自动发现所有 App，无需手动注册。

### App Manifest 结构

```typescript
interface AppConfig {
  id: string                    // 唯一标识符，如 "fileManager"
  name: string                  // 显示名称，如 "文件管理器"
  icon: string                  // lucide-react 图标名，如 "Folder"
  gradient: string              // Tailwind 渐变类名（Dock 图标背景）
  shadow: string                // Tailwind 阴影类名
  defaultSize: {                // 默认窗口尺寸
    width: number
    height: number
  }
  defaultPosition?: {           // 默认位置偏移
    xOffset: number
    yOffset: number
  }
  singleton: boolean            // 是否单例（如 settings 只允许一个窗口）
  backgroundable?: boolean      // 关闭窗口后进程是否保留（后台运行，如音乐播放器）
  autoNumber?: boolean          // 是否自动编号（如 "终端", "终端 2"）
  showInDock: boolean           // 是否显示在 Dock 栏
  dockOrder: number             // Dock 中的排序位置
  menus: MenuConfig[]           // 顶部菜单项配置
  contextMenuItems?: []         // 右键菜单项
  defaultAppData?: (opts?) => {}  // 初始应用状态工厂函数
  fileAssociations?: []         // 文件类型关联
  openFile?: AppFileOpener      // 文件打开处理器
}
```

### App Renderer 结构

```typescript
// renderer.tsx
import type { AppRenderContext } from '@/config/componentRegistry'

export const renderer = (ctx: AppRenderContext) => {
  // ctx.win 包含当前窗口的完整状态
  return <MyAppComponent win={ctx.win} />
}
```

`AppRenderContext` 只包含 `win: WindowState`，组件内部直接从 Zustand Store 读取其他状态。

### 已注册应用列表

| App ID | 名称 | 说明 | 单例 | Dock |
|--------|------|------|:----:|:----:|
| `fileManager` | 文件管理器 | 文件浏览、上传下载、复制移动 | 否 | 是 |
| `editor` | 代码编辑器 | Monaco Editor，多标签页 | 否 | 是 |
| `terminal` | 终端 | xterm.js，多标签页 | 否 | 是 |
| `docker` | Docker | Docker Compose 管理、日志查看 | 是 | 是 |
| `settings` | 设置 | 外观、Dock、编辑器偏好 | 是 | 是 |
| `about` | 关于 | 系统信息 | 是 | 否 |
| `diskManager` | 磁盘管理 | 存储节点管理 | 是 | 是 |
| `musicPlayer` | 音乐播放器 | 播放列表、循环、随机 | 否 | 是 |
| `video` | 视频播放器 | ArtPlayer 集成 | 否 | 否 |
| `image` | 图片查看器 | 图片预览 | 否 | 否 |
| `markdown` | Markdown | GFM 预览 + 代码高亮 | 否 | 否 |
| `webview` | Webview | 通用 iframe 容器 | 否 | 否 |
| `taskManager` | 任务管理器 | 后台任务监控 | 是 | 是 |

### 如何新增一个 App

1. 在 `src/apps/` 下创建目录，如 `src/apps/my-app/`
2. 创建 `manifest.ts`：

```typescript
import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'myApp',
  name: '我的应用',
  icon: 'Monitor',           // lucide-react 图标名
  gradient: 'from-blue-500 to-cyan-500',
  shadow: 'shadow-blue-500/25',
  defaultSize: { width: 800, height: 600 },
  singleton: true,
  showInDock: true,
  dockOrder: 20,
  menus: [],
}
```

3. 创建 `renderer.tsx`：

```typescript
import type { AppRenderContext } from '@/config/componentRegistry'

function MyApp({ win }: { win: WindowState }) {
  return <div className="h-full p-4">Hello from My App</div>
}

export const renderer = (ctx: AppRenderContext) => <MyApp win={ctx.win} />
```

4. 完成。系统会自动发现并注册，无需修改任何配置文件。

---

## 全局组件

位于 `src/components/`，是构成桌面环境的核心 UI 组件。

### Window（窗口容器）

**文件**：`components/Window.tsx`

桌面级窗口容器，所有 App 内容都渲染在 Window 内部。

**功能特性**：
- macOS 风格标题栏（红/黄/绿三色按钮）
- 拖拽移动（标题栏拖拽）
- 八方向缩放（四边 + 四角）
- 边缘吸附（拖到屏幕左/右/上边缘自动半屏/全屏）
- 窗口间磁性对齐（自动吸附到相邻窗口边缘，显示蓝色辅助线）
- 最小化/最大化动画（framer-motion）
- Z-index 层级管理
- 右键标题栏弹出上下文菜单

**使用方式**：

```tsx
import { Window } from '@/components/Window'

// 在 App.tsx 中自动使用，不需要手动调用
// 每个打开的窗口会自动包裹在 Window 中：
<Window window={win}>
  {renderAppContent({ win })}
</Window>
```

**Props**：

| Prop | 类型 | 说明 |
|------|------|------|
| `window` | `WindowState` | 窗口状态对象（位置、大小、标题、层级等） |
| `children` | `ReactNode` | 窗口内容（App 渲染结果） |

---

### TopMenuBar（顶部菜单栏）

**文件**：`components/TopMenuBar.tsx`

macOS 风格的全局顶部菜单栏，显示当前活动窗口的菜单项。

**功能特性**：
- 显示当前活动 App 的名称和菜单
- 动态渲染菜单项（根据 App manifest 中的 `menus` 配置）
- 点击菜单项触发 action 分发
- 右侧显示系统时间

**使用方式**：

```tsx
// 在 App.tsx 中直接使用
<TopMenuBar />
```

组件内部自动从 `windowStore` 读取活动窗口，从 `appRegistry` 获取菜单配置。

---

### Dock（底部 Dock 栏）

**文件**：`components/Dock.tsx`

macOS 风格的底部应用启动栏。

**功能特性**：
- 显示已配置的 App 图标（根据 `showInDock` 和 `dockOrder`）
- 点击图标打开/激活对应 App 窗口
- 右键菜单（新窗口、从 Dock 移除、退出）
- 运行中的 App 显示底部指示点
- Dock 大小可在设置中调整

**使用方式**：

```tsx
// 在 App.tsx 中直接使用
<Dock />
```

---

### LoginScreen（登录界面）

**文件**：`components/LoginScreen.tsx`

认证锁屏界面，未登录时覆盖整个桌面。

**使用方式**：

```tsx
// 在 App.tsx 中根据认证状态条件渲染
const { locked } = useAuthStore()
{locked && <LoginScreen />}
```

---

### SpotlightSearch（搜索面板）

**文件**：`components/SpotlightSearch.tsx`

类似 macOS Spotlight 的全局搜索面板。

**功能特性**：
- `Cmd+K` 快捷键触发
- 搜索已注册的 App
- 快速打开应用

**使用方式**：

```tsx
// 在 App.tsx 中直接使用
<SpotlightSearch />

// 通过 uiStore 控制显示/隐藏
const { spotlightOpen, setSpotlightOpen } = useUIStore()
```

---

### ContextMenuRenderer（右键菜单渲染器）

**文件**：`components/ContextMenuRenderer.tsx`

全局右键菜单渲染组件，根据 `uiStore.globalMenu` 状态渲染菜单。

**功能特性**：
- 递归渲染子菜单
- 条件可见性（`visible` 函数）
- 模板变量插值（如 `{{selectedCount}}`）
- 点击菜单项触发 action 回调

**使用方式**：

```tsx
// 在 App.tsx 中直接使用
<ContextMenuRenderer />

// 在任意组件中触发右键菜单
const { openGlobalMenu, closeGlobalMenu } = useUIStore()

onContextMenu={(e) => {
  e.preventDefault()
  openGlobalMenu({
    x: e.clientX,
    y: e.clientY,
    config: myMenuConfig,       // 菜单配置（来自 contextMenus.ts）
    context: { ... },           // 上下文数据
    onAction: (action) => {     // action 处理回调
      if (action === 'doSomething') { ... }
      closeGlobalMenu()
    },
  })
}
```

---

### TaskIndicator（任务指示器）

**文件**：`components/TaskIndicator.tsx`

显示后台任务进度（上传、压缩、解压等）。

**使用方式**：

```tsx
// 在 App.tsx 中直接使用
<TaskIndicator />

// 通过 taskStore 管理任务
const { upsertTask, clearCompleted } = useTaskStore()
upsertTask({
  id: 'upload-xxx',
  type: 'upload',
  name: 'file.zip',
  status: 'running',
  progress: 0.5,
})
```

---

## shadcn/ui 基础组件

位于 `src/components/ui/`，基于 Radix UI 原语 + Tailwind CSS 封装。

| 组件 | 文件 | 说明 | 使用示例 |
|------|------|------|----------|
| Button | `ui/button.tsx` | 按钮，支持多种 variant | `<Button variant="outline" size="sm">` |
| Input | `ui/input.tsx` | 输入框 | `<Input placeholder="搜索..." />` |
| Dialog | `ui/dialog.tsx` | 模态对话框 | `<Dialog><DialogTrigger>...</DialogTrigger><DialogContent>...</DialogContent></Dialog>` |
| DropdownMenu | `ui/dropdown-menu.tsx` | 下拉菜单 | `<DropdownMenu><DropdownMenuTrigger>...</DropdownMenuTrigger><DropdownMenuContent>...</DropdownMenuContent></DropdownMenu>` |
| Toaster | `ui/toaster.tsx` | Toast 通知容器 | 在 `main.tsx` 中全局挂载 `<Toaster />` |

使用 Toast 通知：

```tsx
import { useToast } from '@/hooks/use-toast'

const { toast } = useToast()
toast({ title: '成功', description: '文件已保存' })
```

---

## 状态管理（Stores）

使用 Zustand 5 进行状态管理，采用**进程-窗口分离**架构。Store 分为三层：

| 层级 | Store | 职责 |
|------|-------|------|
| 窗口层 | `windowStore` | 窗口 UI 表现（位置、大小、层级、焦点） |
| 进程层 | `processStore` | 进程生命周期、App 内部状态容器 |
| App 层 | 各 `apps/*/store.ts` | App 特定的业务操作（标签页管理、播放控制等） |

### windowStore — 窗口管理器

**文件**：`stores/windowStore.ts`

纯窗口管理器，类比操作系统的 Window Manager，只负责窗口的 UI 表现，不管 App 内部状态。

```typescript
import { useWindowStore } from '@/stores'

// 窗口生命周期
openWindow('fileManager')                          // 打开应用（自动创建进程 + 窗口）
openWindow('terminal', { forceNew: true })         // 强制新建窗口
closeWindow(windowId)                              // 关闭窗口（非 backgroundable 的进程会一并终止）
activateWindow(windowId)                           // 激活窗口（置顶）
minimizeWindow(windowId)                           // 最小化
maximizeWindow(windowId)                           // 最大化/还原

// 窗口位置与大小
moveWindow(windowId, x, y)
resizeWindow(windowId, width, height)

// Webview 窗口
openWebviewWindow('https://github.com', 'GitHub')
reloadWebview(windowId)

// 桥接方法（转发到 processStore）
updateAppData(windowId, patch)                     // 通过 windowId 更新进程状态
updateWindowTitle(windowId, title)                 // 更新窗口标题
```

关闭窗口时的进程处理逻辑：

```
closeWindow(id)
  → 从 windowStore 移除窗口
  → processStore.removeWindowFromProcess(pid, id)
  → 如果进程没有剩余窗口：
      ├── backgroundable = true  → 进程保留（如音乐播放器后台播放）
      └── backgroundable = false → processStore.killProcess(pid)
```

### processStore — 进程管理器

**文件**：`stores/processStore.ts`

进程抽象层，将"进程"和"窗口"解耦。一个进程可以关联零个或多个窗口，支持后台运行。

```typescript
import { useProcessStore } from '@/stores'

interface Process {
  pid: string                    // 进程 ID，如 "proc-editor-1707123456"
  appId: string                  // 所属应用 ID
  state: Record<string, unknown> // App 内部状态（标签页、播放列表等）
  windowIds: string[]            // 关联的窗口 ID 列表（可以为空 = 后台运行）
  createdAt: number              // 创建时间戳
}

// 进程生命周期
const pid = spawnProcess('editor', initialState)   // 创建进程
killProcess(pid)                                    // 终止进程

// 进程状态读写（App Store 内部使用）
getProcess(pid)                                     // 获取进程
getProcessesByApp('musicPlayer')                    // 获取某 App 的所有进程
updateProcessState(pid, { activeFmTabIndex: 2 })    // 合并更新状态
setProcessState(pid, (prev) => ({ ...prev, ... }))  // 函数式更新状态

// 窗口关联
addWindowToProcess(pid, windowId)
removeWindowFromProcess(pid, windowId)
```

**后台运行机制**：App manifest 中声明 `backgroundable: true` 的应用（如音乐播放器），关闭窗口后进程不会被终止，再次点击 Dock 图标会为已有进程创建新窗口。`GlobalMusicPlayer` 组件挂载在 App 顶层，监听音乐进程状态驱动 `<audio>` 元素，实现窗口关闭后继续播放。

### App 级 Store — 业务操作层

各 App 将自己的业务操作（标签页增删切换、播放控制等）封装在 `apps/*/store.ts` 中，内部通过 `processStore` 读写进程状态。这样 windowStore 只管窗口 UI，processStore 只管状态容器，App Store 负责具体业务逻辑。

| App Store | 文件 | 主要操作 |
|-----------|------|----------|
| `useEditorStore` | `apps/editor/store.ts` | `addNewEditorTab` `switchEditorTab` `closeEditorTab` `saveEditorContent` `findOrCreateEditorWindow` `formatEditor` `toggleWordWrap` |
| `useFileManagerStore` | `apps/file-manager/store.ts` | `addFmTab` `switchFmTab` `closeFmTab` `reorderFmTabs` `updateFmTabState` |
| `useTerminalStore` | `apps/terminal/store.ts` | `addTerminalTab` `switchTerminalTab` `closeTerminalTab` `reorderTerminalTabs` |
| `useMusicPlayerStore` | `apps/music-player/store.ts` | `switchMusicTrack` `removeMusicTrack` `playNextTrack` `playPreviousTrack` `setShuffleMode` `setRepeatMode` |

使用示例：

```typescript
import { useEditorStore } from '@/apps/editor/store'
import { useFileManagerStore } from '@/apps/file-manager/store'
import { useTerminalStore } from '@/apps/terminal/store'
import { useMusicPlayerStore } from '@/apps/music-player/store'

// 编辑器标签页
useEditorStore.getState().addNewEditorTab(windowId)
useEditorStore.getState().closeEditorTab(windowId, tabIndex)
await useEditorStore.getState().saveEditorContent(windowId)
await useEditorStore.getState().findOrCreateEditorWindow(fileInfo)

// 文件管理器标签页
useFileManagerStore.getState().addFmTab(windowId)
useFileManagerStore.getState().switchFmTab(windowId, tabIndex)
useFileManagerStore.getState().updateFmTabState(windowId, tabIndex, { currentPath: '/new/path' })

// 终端标签页
useTerminalStore.getState().addTerminalTab(windowId)
useTerminalStore.getState().switchTerminalTab(windowId, tabIndex)

// 音乐播放器
useMusicPlayerStore.getState().playNextTrack(windowId)
useMusicPlayerStore.getState().setRepeatMode(windowId, 'all')   // 'none' | 'all' | 'one'
useMusicPlayerStore.getState().setShuffleMode(windowId, true)
```

**数据流向**：组件 → App Store 方法 → processStore.setProcessState(pid, updater) → 进程状态更新 → 组件重渲染

### authStore — 认证状态

**文件**：`stores/authStore.ts`

```typescript
import { useAuthStore } from '@/stores'

const { locked, login, logout, getUserInfo, checkAuth } = useAuthStore()

await login('password')        // 登录，返回 boolean
logout()                       // 登出，清除 token
const user = getUserInfo()     // 获取缓存的用户信息
await checkAuth()              // 检查 token 有效性
```

- JWT token 存储在 `localStorage`（key: `fm_token`）
- 401 响应自动触发登出

### uiStore — 全局 UI 状态

**文件**：`stores/uiStore.ts`

```typescript
import { useUIStore } from '@/stores'

const {
  openGlobalMenu,    // 打开右键菜单
  closeGlobalMenu,   // 关闭右键菜单
  showConfirm,       // 显示确认对话框
  closeConfirm,      // 关闭确认对话框
  spotlightOpen,     // Spotlight 是否打开
  setSpotlightOpen,  // 控制 Spotlight
} = useUIStore()

// 确认对话框
showConfirm({
  title: '确认删除',
  message: '确定要删除这些文件吗？',
  onConfirm: () => { /* 执行删除 */ },
})
```

### settingsStore — 用户偏好设置

**文件**：`stores/settingsStore.ts`

```typescript
import { useSettingsStore } from '@/stores'

const {
  dockSize,          // Dock 图标大小
  wallpaperUrl,      // 壁纸 URL
  fontSize,          // 编辑器字体大小
  editorTheme,       // 编辑器主题 'vs' | 'vs-dark'
  composeBaseDir,    // Docker Compose 基础目录
  setDockSize,
  setWallpaperUrl,
  setFontSize,
  setEditorTheme,
  loadSettings,      // 从后端加载
  saveSettings,      // 保存到后端
  resetSettings,     // 重置为默认值
} = useSettingsStore()
```

- 本地持久化到 `localStorage`（key: `fm_preferences_v1`）
- 通过 WebSocket 同步到后端（`preferences_get` / `preferences_save` / `preferences_reset`）
- 修改后 300ms 防抖自动保存

### webSocketStore — WebSocket 传输层

**文件**：`stores/webSocketStore.ts`

纯传输层 Store，只负责连接管理和消息路由。业务逻辑已拆分到 `lib/services/` 下的独立模块。

```typescript
import { useWebSocketStore } from '@/stores'

const ws = useWebSocketStore()

// 连接管理
ws.connect()
ws.disconnect()

// 发送消息
ws.send({ type: 'custom', data: {} })

// 订阅实时数据
ws.subscribe('system.stats', 2000, (data) => { /* 系统状态 */ })
```

传输层还导出以下 API 供 service 模块使用：

```typescript
import { sendMsg, request, registerMessageHandler, registerReconnectHook, registerDisconnectHook } from '@/stores/webSocketStore'
```

### 业务服务层（lib/services/）

WebSocket 业务操作已从 webSocketStore 拆分为独立的纯 TypeScript 模块：

```typescript
import { fsService, terminalService, dockerService, taskService, exec } from '@/lib/services'

// 文件操作
await fsService.list(nodeId, '/path')
await fsService.read(nodeId, '/path/file.txt')
await fsService.write(nodeId, '/path/file.txt', content)
fsService.watch(nodeId, '/path', (files) => { /* 变更通知 */ })

// 终端操作
terminalService.open((sid) => { /* 获得 session id */ })
terminalService.input(sid, 'ls -la\n')
terminalService.close(sid)

// Docker 操作
await dockerService.composePs(configFile)
await dockerService.composeCreate(projectDir, yaml, true)
dockerService.logsSubscribe(containerId, undefined, '200', (logs) => {})

// 任务管理
taskService.cancel(taskId)
await taskService.scheduledJobsList()

// 通用命令执行
await exec('ls -la')
```

### taskStore — 后台任务追踪

**文件**：`stores/taskStore.ts`

```typescript
import { useTaskStore } from '@/stores'

const { tasks, upsertTask, clearCompleted } = useTaskStore()

upsertTask({
  id: 'task-1',
  type: 'upload',           // 'upload' | 'download' | 'compress' | 'extract' | ...
  name: 'bigfile.zip',
  status: 'running',        // 'running' | 'completed' | 'failed'
  progress: 0.75,           // 0 ~ 1
})
```

### editorRefs — 编辑器实例引用

**文件**：`stores/editorRefs.ts`

```typescript
import { editorRefs, wrapStateRef } from '@/stores/editorRefs'

// 直接访问 Monaco 编辑器实例（用于格式化、word wrap 等）
const editor = editorRefs[windowId]
editor?.getAction('editor.action.formatDocument')?.run()
```

---

## 自定义 Hooks

### useHotkeys — 全局快捷键

**文件**：`hooks/useHotkeys.ts`

在 `App.tsx` 中调用，注册全局键盘快捷键。自动跳过可编辑元素（input、textarea）、Monaco 编辑器和 xterm 终端内的按键。

```tsx
// App.tsx 中
useHotkeys()
```

### useSystemWebSocket — WebSocket 生命周期

**文件**：`hooks/useSystemWebSocket.ts`

根据认证状态自动连接/断开 WebSocket。

```tsx
// App.tsx 中
useSystemWebSocket()
```

### useSidebarConfig — 侧边栏配置

**文件**：`hooks/useSidebarConfig.ts`

为文件管理器提供侧边栏数据（收藏夹、存储节点列表）。

### useToast — Toast 通知

**文件**：`hooks/use-toast.ts`

```tsx
import { useToast } from '@/hooks/use-toast'

const { toast } = useToast()
toast({ title: '操作成功', description: '文件已上传' })
toast({ title: '错误', description: '网络异常', variant: 'destructive' })
```

---

## 配置与注册中心

位于 `src/config/`，负责 App 发现、渲染映射、菜单 action 分发、文件关联等。

### appRegistry.ts — App 注册表

通过 `import.meta.glob('../apps/*/manifest.ts')` 自动收集所有 App manifest，并提供合并用户覆盖配置的能力。

```typescript
import { getAppConfig, getDockItems, getAllApps } from '@/config/appRegistry'

getAppConfig('fileManager')   // 获取单个 App 配置（已合并用户覆盖）
getDockItems()                // 获取 Dock 中显示的 App 列表（按 dockOrder 排序）
getAllApps()                   // 获取所有 App 列表
```

**App Overrides（用户覆盖）**：用户可以自定义 App 的 `showInDock`、`dockOrder` 等属性，覆盖值存储在后端 `/app-overrides` 接口。

### componentRegistry.tsx — 渲染器映射

通过 `import.meta.glob('../apps/*/renderer.tsx')` 自动收集所有 App 渲染器。

```typescript
import { renderAppContent } from '@/config/componentRegistry'

// 根据窗口类型渲染对应 App 内容
const content = renderAppContent({ win })
```

### actionRegistry.ts — 菜单 Action 处理器

集中管理顶部菜单和右键菜单的 action 处理逻辑。

### fileAssociationRegistry.ts — 文件关联

自动从所有 App manifest 的 `fileAssociations` 字段汇总文件关联映射，无需维护独立的映射文件。新增 App 只需在 manifest 中声明 `fileAssociations` 即可自动生效。

```typescript
import { getDefaultAppForExtension, getAppsForExtension, buildOpenWithMenuItems } from '@/config/fileAssociationRegistry'

getDefaultAppForExtension('mp4')   // → 'video'（取 isDefault: true 的 App）
getDefaultAppForExtension('ts')    // → 'editor'（无匹配时 fallback 到 editor）
getAppsForExtension('png')         // → ['image', 'editor']（所有能打开的 App）
buildOpenWithMenuItems()           // → 生成"打开方式"右键子菜单项
```

App manifest 中的声明方式：

```typescript
// apps/editor/manifest.ts
fileAssociations: [
  { extensions: ['.txt', '.js', '.ts', '.json', ...], isDefault: true }
]

// apps/music-player/manifest.ts
fileAssociations: [
  { extensions: ['.mp3', '.wav', '.ogg', '.flac', ...], isDefault: true, label: '音乐播放器', icon: 'Music' }
]
```

### contextMenus.ts — 右键菜单定义

定义了 8 套右键菜单配置：

| 菜单 | 触发位置 | 主要操作 |
|------|----------|----------|
| `fileManagerFileContextMenu` | 文件/文件夹上右键 | 打开、下载、复制链接、解压、压缩、复制、剪切、重命名、删除 |
| `fileManagerBlankContextMenu` | 文件列表空白区域右键 | 新建文件、新建文件夹、上传、离线下载、刷新、粘贴 |
| `sidebarFavoriteContextMenu` | 侧边栏收藏项右键 | 从收藏中移除 |
| `desktopContextMenu` | 桌面空白区域右键 | 打开文件管理器、打开编辑器、打开 GitHub、登出 |
| `windowTitleBarContextMenu` | 窗口标题栏右键 | 最小化、最大化 |
| `dockItemContextMenu` | Dock 图标右键 | 新窗口、从 Dock 移除、退出 |
| `processContextMenu` | 进程管理右键 | 发送信号（SIGTERM、SIGKILL 等） |
| `webviewTitleBarContextMenu` | Webview 标题栏右键 | 最小化、最大化、刷新 |

---

## 工具库（lib）

### request.ts — Axios 封装

```typescript
import request from '@/lib/request'

// 自动附加 JWT token（Authorization: Bearer xxx）
// 自动处理业务错误码（code !== 0 视为错误）
// 401 响应自动触发登出

const resp = await request.get('/user')
const resp = await request.post('/login', { password: 'xxx' })
```

### storageApi.ts — 统一文件系统 API

封装了 WebSocket 和 HTTP 两种通道的文件操作。

```typescript
import { fsApi } from '@/lib/storageApi'

// WebSocket 通道（实时操作）
await fsApi.list(nodeId, '/path')
await fsApi.read(nodeId, '/path/file.txt')
await fsApi.write(nodeId, '/path/file.txt', content)
await fsApi.mkdir(nodeId, '/path', 'newFolder')
await fsApi.createFile(nodeId, '/path', 'newFile.txt')
await fsApi.delete(nodeId, ['/path/file.txt'])
await fsApi.rename(nodeId, '/path', 'old.txt', 'new.txt')
await fsApi.copy(srcNodeId, paths, destPath)
await fsApi.move(srcNodeId, paths, destPath)
await fsApi.extract(nodeId, '/path/archive.zip')
await fsApi.compress(nodeId, paths, 'output.zip')
await fsApi.offlineDownload(nodeId, '/path', ['https://...'])
fsApi.fsWatch(nodeId, '/path', (event) => { /* 文件变更 */ })

// HTTP 通道（二进制流）
await fsApi.upload(nodeId, '/path', file)
await fsApi.uploadChunked(nodeId, '/path', file, chunkSize)
const url = fsApi.downloadUrl(nodeId, '/path/file.txt')
const presignedUrl = await fsApi.presign(nodeId, '/path', 'GET')
```

### createAppStateHook.ts — App 级状态 Hook 工厂

为每个 App 实例创建隔离的 Zustand Store。

```typescript
import { createAppStateHook } from '@/lib/createAppStateHook'

const useMyAppState = createAppStateHook<MyState>(initialState)

// 在组件中使用
const [state, setState] = useMyAppState(windowId)
```

### monaco.ts — Monaco 编辑器配置

提供语言检测、主题配置、编辑器选项等。

---

## 快捷键

全局快捷键由 `useHotkeys` Hook 注册，在可编辑元素、Monaco 编辑器、xterm 终端内自动跳过。

| 快捷键 | 功能 |
|--------|------|
| `Cmd+K` | 打开/关闭 Spotlight 搜索 |
| `Cmd+,` | 打开设置 |
| `Cmd+N` | 新建窗口（根据当前活动 App 类型） |
| `Cmd+W` | 关闭当前活动窗口 |
| `Cmd+M` | 最小化当前窗口 |
| `Cmd+S` | 保存（编辑器） |
| `Shift+Alt+F` | 格式化代码（编辑器） |
| `Cmd+`` ` | 在窗口间循环切换 |
| `Ctrl+Cmd+Q` (Mac) / `Shift+Cmd+Q` | 登出 |
| `Escape` | 关闭右键菜单 |

---

## 认证流程

```
1. App 启动 → authStore.checkAuth()
2. 检查 localStorage 中的 fm_token
   ├── 无 token → 显示 LoginScreen
   └── 有 token → GET /api/user 验证
       ├── 有效 → 解锁桌面，连接 WebSocket，加载 App Overrides
       └── 无效(401) → 清除 token，显示 LoginScreen

3. 用户登录 → POST /api/login { password }
   ├── 成功 → 存储 token，解锁桌面
   └── 失败 → 显示错误提示

4. 运行中 401 响应 → 自动登出，显示 LoginScreen
```

---

## WebSocket 通信协议

连接地址：`ws://{host}/api/ws?token={JWT}`

### 请求-响应模式

```json
// 请求
{ "type": "fs.list", "reqId": "uuid", "data": { "nodeId": "1", "path": "/" } }

// 响应
{ "type": "fs.list", "reqId": "uuid", "data": { "files": [...] } }
```

每个请求携带唯一 `reqId`，响应通过 `reqId` 匹配。

### 推送订阅模式

```json
// 订阅
{ "type": "subscribe", "data": { "channel": "system.stats", "interval": 2000 } }

// 推送
{ "type": "system.stats", "data": { "cpu": 45.2, "memory": 68.1 } }
```

### 主要 WebSocket 操作类型

| 类型 | 说明 |
|------|------|
| `fs.list` | 列出目录内容 |
| `fs.read` | 读取文件内容 |
| `fs.write` | 写入文件内容 |
| `fs.mkdir` | 创建目录 |
| `fs.delete` | 删除文件/目录 |
| `fs.rename` | 重命名 |
| `fs.copy` | 复制 |
| `fs.move` | 移动 |
| `fs.extract` | 解压 |
| `fs.compress` | 压缩 |
| `fs.search` | 搜索文件 |
| `fs.watch` | 监听目录变更 |
| `terminal.open` | 打开终端会话 |
| `terminal.input` | 终端输入 |
| `terminal.close` | 关闭终端会话 |
| `docker.compose.ps` | Docker Compose 状态 |
| `docker.container.logs` | 容器日志 |
| `docker.compose.create` | 创建/更新 Compose 项目 |

---

## 文件上传机制

### 小文件上传（< 10MB）

直接通过 HTTP POST 上传：

```
POST /api/fs/{nodeId}/upload
Content-Type: multipart/form-data
Body: { path, file }
```

### 大文件分片上传（>= 10MB）

支持断点续传，流程如下：

```
1. 初始化  POST /api/fs/{nodeId}/upload/init
   → 返回 uploadId

2. 上传分片（并发 3 个，每片 5MB，失败重试 3 次）
   POST /api/fs/{nodeId}/upload/chunk
   Body: { uploadId, partNumber, chunk }

   或 S3 直传模式：
   POST /api/fs/{nodeId}/upload/{uploadId}/presign → 获取预签名 URL
   PUT {presignedUrl} → 直传到 S3

3. 完成  POST /api/fs/{nodeId}/upload/complete
   Body: { uploadId, parts: [...] }
```

**参数配置**：

| 参数 | 值 |
|------|-----|
| 分片阈值 | 10MB |
| 分片大小 | 5MB |
| 并发数 | 3 |
| 最大重试 | 3 次 |

---

## 架构待改进项

### 缺少权限/能力系统（优先级：低）

**现状**：所有 App 都能调用所有 API（文件操作、终端、Docker 等），没有权限隔离。

**问题**：单用户场景下问题不大，但如果后续支持多用户或第三方 App，缺少权限控制会有安全风险。

**建议**：在 App manifest 中声明所需能力：

```typescript
// manifest.ts
export const manifest: AppConfig = {
  id: 'myApp',
  capabilities: ['fs.read', 'fs.write', 'terminal'],  // 声明所需权限
  // ...
}
```

由系统在调用 API 前检查当前 App 是否具备对应能力。
