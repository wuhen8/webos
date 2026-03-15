# 前端架构文档

## 目录

- [项目概览](#项目概览)
- [目录结构](#目录结构)
- [应用系统（Apps）](#应用系统apps)
- [全局组件](#全局组件)
- [状态管理（Stores）](#状态管理stores)
- [配置与注册中心](#配置与注册中心)
- [服务层（lib/services）](#服务层libservices)
- [JSON-RPC 2.0 协议](#json-rpc-20-协议)
- [快捷键](#快捷键)
- [认证流程](#认证流程)

---

## 项目概览

前端采用 **React 18 + TypeScript + Vite 5** 构建，模拟 macOS 桌面体验。核心设计理念：

- **窗口式导航**：没有传统路由，所有功能以窗口形式呈现
- **进程-窗口分离**：`processStore` 管理进程生命周期和 App 内部状态，`windowStore` 只管窗口表现，支持后台运行
- **模块化应用**：每个功能是独立的 App，通过 manifest 声明配置
- **自动发现**：使用 `import.meta.glob()` 自动收集所有 App
- **Store 驱动**：组件直接从 Zustand Store 读取状态

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript 5.7 |
| 构建 | Vite 5 |
| 状态管理 | Zustand 5 |
| UI 组件 | shadcn/ui（Radix UI + Tailwind） |
| 样式 | Tailwind CSS 4 |
| 代码编辑 | Monaco Editor |
| 终端 | xterm.js |
| 视频播放 | ArtPlayer |
| 动画 | framer-motion |
| HTTP | Axios |
| 图标 | lucide-react |

---

## 目录结构

```
webos-frontend/src/
├── App.tsx                              # 主应用：编排窗口、Dock、菜单栏、快捷键
├── main.tsx                             # React 入口
├── index.css                            # 全局样式
│
├── apps/                                # 内置应用目录
│   ├── file-manager/                    # 文件管理器
│   ├── editor/                          # 代码编辑器
│   ├── terminal/                        # 终端
│   ├── docker/                          # Docker 管理
│   ├── ai-chat/                         # AI 对话
│   ├── settings/                        # 系统设置
│   ├── disk-manager/                    # 磁盘管理
│   ├── music-player/                    # 音乐播放器（支持后台）
│   ├── video/                           # 视频播放器
│   ├── image/                           # 图片查看器
│   ├── markdown/                        # Markdown 预览
│   ├── webview/                         # 通用 iframe 容器
│   ├── task-manager/                    # 任务管理器
│   ├── app-store/                       # 应用商店
│   ├── static-app/                      # 静态应用容器
│   └── about/                           # 关于对话框
│
├── components/                          # 全局 UI 组件
│   ├── Window.tsx                       # 窗口容器
│   ├── TopMenuBar.tsx                   # 顶部菜单栏
│   ├── Dock.tsx                         # 底部 Dock
│   ├── LoginScreen.tsx                  # 登录界面
│   ├── SpotlightSearch.tsx              # 搜索面板
│   ├── Launchpad.tsx                    # 启动台
│   ├── ContextMenuRenderer.tsx          # 右键菜单渲染器
│   ├── TaskIndicator.tsx                # 后台任务指示器
│   ├── ProgressDialog.tsx               # 进度对话框
│   └── ui/                              # shadcn/ui 基础组件
│
├── stores/                              # Zustand 状态管理
│   ├── windowStore.ts                   # 窗口 UI 管理
│   ├── processStore.ts                  # 进程生命周期管理
│   ├── authStore.ts                     # 认证状态
│   ├── uiStore.ts                       # 全局 UI 状态
│   ├── settingsStore.ts                 # 用户偏好设置
│   ├── webSocketStore.ts                # WebSocket 连接管理
│   ├── taskStore.ts                     # 后台任务追踪
│   └── progressDialogStore.ts           # 进度对话框状态
│
├── hooks/                               # 自定义 Hooks
│   ├── useHotkeys.ts                    # 全局快捷键
│   ├── useKeyboardDispatcher.ts         # 键盘事件分发
│   └── use-toast.ts                     # Toast 通知
│
├── config/                              # 配置与注册中心
│   ├── appRegistry.ts                   # App manifest 收集
│   ├── componentRegistry.tsx            # App renderer 映射
│   ├── actionRegistry.ts                # 菜单 action 处理器
│   ├── contextMenus.ts                  # 右键菜单定义
│   └── fileAssociationRegistry.ts       # 文件类型 → App 映射
│
├── lib/                                 # 工具库
│   ├── request.ts                       # Axios 封装
│   ├── storageApi.ts                    # 文件系统 API
│   ├── utils.ts                         # 通用工具函数
│   └── services/                        # WebSocket 业务服务
│       ├── index.ts                     # 统一导出
│       ├── fsService.ts                 # 文件系统操作
│       ├── terminalService.ts           # 终端操作
│       ├── dockerService.ts             # Docker 操作
│       └── taskService.ts               # 后台任务
│
└── types/
    └── index.ts                         # 类型定义
```

---

## 应用系统（Apps）

### 架构设计

每个 App 是 `src/apps/{appName}/` 下的独立目录，至少包含：

| 文件 | 作用 |
|------|------|
| `manifest.ts` | 声明应用配置（ID、名称、图标、窗口大小等） |
| `renderer.tsx` | 导出 `renderer` 函数，返回 React 组件 |
| `store.ts` | 可选，App 级状态管理 |

系统通过 `import.meta.glob()` 自动发现所有 App。

### App Manifest 结构

```typescript
interface AppConfig {
  id: string                    // 唯一标识符
  name: string                  // 显示名称
  icon: string                  // lucide-react 图标名
  gradient: string              // Dock 图标背景渐变
  shadow: string                // 阴影类名
  defaultSize: { width, height }
  singleton: boolean            // 是否单例
  backgroundable?: boolean      // 关闭窗口后进程是否保留
  autoNumber?: boolean          // 是否自动编号
  showInDock: boolean
  dockOrder: number
  menus: MenuConfig[]
  fileAssociations?: []
  defaultAppData?: () => {}     // 初始状态工厂函数
}
```

### 已注册应用列表

| App ID | 名称 | 单例 | 后台 | Dock |
|--------|------|:----:|:----:|:----:|
| fileManager | 文件管理器 | 否 | 否 | 是 |
| editor | 代码编辑器 | 否 | 否 | 是 |
| terminal | 终端 | 否 | 否 | 是 |
| docker | Docker 管理 | 是 | 否 | 是 |
| aiChat | AI 对话 | 否 | 否 | 是 |
| settings | 设置 | 是 | 否 | 是 |
| diskManager | 磁盘管理 | 是 | 否 | 是 |
| musicPlayer | 音乐播放器 | 否 | 是 | 是 |
| video | 视频播放器 | 否 | 否 | 否 |
| image | 图片查看器 | 否 | 否 | 否 |
| markdown | Markdown | 否 | 否 | 否 |
| webview | Webview | 否 | 否 | 否 |
| taskManager | 任务管理器 | 是 | 否 | 是 |
| appStore | 应用商店 | 是 | 否 | 是 |
| staticApp | 静态应用 | 否 | 否 | 否 |
| about | 关于 | 是 | 否 | 否 |

---

## 全局组件

### Window（窗口容器）

桌面级窗口容器，所有 App 内容都渲染在 Window 内部。

**功能特性**：
- macOS 风格标题栏（红/黄/绿按钮）
- 拖拽移动、八方向缩放
- 边缘吸附、窗口间磁性对齐
- 最小化/最大化动画（framer-motion）
- Z-index 层级管理
- 支持子窗口（parentId）

### TopMenuBar（顶部菜单栏）

macOS 风格的全局顶部菜单栏，显示当前活动窗口的菜单项。

### Dock（底部 Dock 栏）

显示已配置的 App 图标，点击打开/激活对应窗口，右键菜单支持新窗口、退出等。

### LoginScreen（登录界面）

认证锁屏界面，未登录时覆盖整个桌面。

### SpotlightSearch（搜索面板）

`Cmd+K` 快捷键触发，快速搜索和打开应用。

### Launchpad（启动台）

类似 macOS Launchpad，显示所有应用图标网格。

### ContextMenuRenderer（右键菜单渲染器）

全局右键菜单渲染组件，支持递归子菜单、条件可见性、模板变量插值。

### TaskIndicator（任务指示器）

显示后台任务进度（上传、压缩、解压等）。

---

## 状态管理（Stores）

使用 Zustand 5 进行状态管理，采用**进程-窗口分离**架构。

### windowStore — 窗口管理器

纯窗口管理器，只负责窗口的 UI 表现。

```typescript
// 窗口生命周期
openWindow('fileManager')
openWindow('terminal', { forceNew: true })
closeWindow(windowId)
activateWindow(windowId)
minimizeWindow(windowId)
maximizeWindow(windowId)

// Webview 窗口
openWebviewWindow('https://github.com', 'GitHub')

// 桥接方法
updateAppData(windowId, patch)
updateWindowTitle(windowId, title)
```

### processStore — 进程管理器

进程抽象层，将"进程"和"窗口"解耦。一个进程可以关联零个或多个窗口。

```typescript
interface Process {
  pid: string                    // 进程 ID
  appId: string                  // 所属应用 ID
  state: Record<string, unknown> // App 内部状态
  windowIds: string[]            // 关联的窗口 ID 列表
  createdAt: number
}

// 进程生命周期
const pid = spawnProcess('editor', initialState)
killProcess(pid)

// 状态读写
getProcess(pid)
updateProcessState(pid, { activeTabIndex: 2 })
setProcessState(pid, (prev) => ({ ...prev, ... }))
```

**后台运行机制**：App manifest 中声明 `backgroundable: true` 的应用（如音乐播放器），关闭窗口后进程不会被终止。`GlobalMusicPlayer` 组件挂载在 App 顶层，实现窗口关闭后继续播放。

### authStore — 认证状态

```typescript
const { authPhase, login, logout, checkAuth } = useAuthStore()

// authPhase: 'unauthenticated' | 'checking' | 'authenticated'
```

JWT token 存储在 `localStorage`（key: `fm_token`）。

### uiStore — 全局 UI 状态

```typescript
const {
  globalMenu,        // 当前右键菜单
  openGlobalMenu,    // 打开右键菜单
  closeGlobalMenu,   // 关闭右键菜单
  confirmDialog,     // 确认对话框
  showConfirm,       // 显示确认对话框
  spotlightOpen,     // Spotlight 是否打开
  launchpadOpen,     // 启动台是否打开
} = useUIStore()
```

### settingsStore — 用户偏好设置

```typescript
const {
  dockSize,          // Dock 图标大小
  wallpaperUrl,      // 壁纸 URL
  fontSize,          // 编辑器字体大小
  editorTheme,       // 编辑器主题
  loadSettings,      // 从后端加载
  saveSettings,      // 保存到后端
} = useSettingsStore()
```

### webSocketStore — WebSocket 传输层

纯传输层，只负责连接管理和消息路由。业务逻辑在 `lib/services/` 下。

```typescript
const ws = useWebSocketStore()

ws.connect()
ws.disconnect()
ws.send({ method: 'fs.list', params: { nodeId: 'local_1', path: '/' }, id: 'req_1' })
```

### taskStore — 后台任务追踪

```typescript
const { tasks, upsertTask, clearCompleted } = useTaskStore()

upsertTask({
  id: 'task-1',
  type: 'upload',
  name: 'bigfile.zip',
  status: 'running',
  progress: 0.75,
})
```

---

## 配置与注册中心

### appRegistry.ts — App 注册表

自动收集所有 App manifest，提供合并用户覆盖配置的能力。

```typescript
import { getAppConfig, getDockItems, getAllApps } from '@/config/appRegistry'

getAppConfig('fileManager')
getDockItems()
getAllApps()
```

### componentRegistry.tsx — 渲染器映射

自动收集所有 App 渲染器。

```typescript
import { renderAppContent } from '@/config/componentRegistry'

const content = renderAppContent({ win })
```

### fileAssociationRegistry.ts — 文件关联

从所有 App manifest 的 `fileAssociations` 字段汇总文件关联映射。

```typescript
import { getDefaultAppForExtension, getAppsForExtension } from '@/config/fileAssociationRegistry'

getDefaultAppForExtension('mp4')  // → 'video'
getAppsForExtension('png')        // → ['image', 'editor']
```

### contextMenus.ts — 右键菜单定义

定义了多套右键菜单配置：文件、空白区域、侧边栏、桌面、窗口标题栏、Dock 图标等。

---

## 服务层（lib/services）

WebSocket 业务操作已从 webSocketStore 拆分为独立的 TypeScript 模块：

```typescript
import { fsService, terminalService, dockerService, taskService } from '@/lib/services'

// 文件操作
await fsService.list(nodeId, '/path')
await fsService.read(nodeId, '/path/file.txt')
await fsService.write(nodeId, '/path/file.txt', content)

// 终端操作
terminalService.open((sid) => { /* ... */ })
terminalService.input(sid, 'ls -la\n')
terminalService.close(sid)

// Docker 操作
await dockerService.composePs(configFile)

// 任务管理
taskService.cancel(taskId)
```

---

## JSON-RPC 2.0 协议

### 连接

连接地址：`ws://{host}/api/ws`

首条消息发送 JWT Token 认证：

```json
{ "jsonrpc": "2.0", "method": "auth", "params": { "token": "JWT_TOKEN" } }
```

认证成功响应：

```json
{ "jsonrpc": "2.0", "method": "auth", "params": { "status": "ok", "data": { "username": "admin", "connId": "..." } } }
```

### 请求-响应模式

```json
// 请求
{ "jsonrpc": "2.0", "method": "fs.list", "params": { "nodeId": "local_1", "path": "/" }, "id": "r_1" }

// 成功响应
{ "jsonrpc": "2.0", "result": [...], "id": "r_1" }

// 错误响应
{ "jsonrpc": "2.0", "error": { "code": -32000, "message": "path not found" }, "id": "r_1" }
```

### 服务端通知（无 id）

```json
{ "jsonrpc": "2.0", "method": "task.update", "params": { "id": "task_1", "progress": 0.5 } }
```

### 主要消息类型

| 类型 | 说明 |
|------|------|
| `fs.list/read/write/mkdir/delete/rename/copy/move/extract/compress/search/watch` | 文件操作 |
| `terminal.open/input/resize/close` | 终端 |
| `docker.compose.*` | Docker Compose 管理 |
| `chat.send/history/messages` | AI 对话 |
| `task.cancel/retry/list` | 后台任务 |
| `scheduled_job.*` | 定时任务 |
| `sub.subscribe/unsubscribe` | 系统监控订阅 |

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+K` | 打开/关闭 Spotlight 搜索 |
| `Cmd+,` | 打开设置 |
| `Cmd+N` | 新建窗口 |
| `Cmd+W` | 关闭当前窗口 |
| `Cmd+M` | 最小化窗口 |
| `Cmd+S` | 保存（编辑器） |
| `Shift+Alt+F` | 格式化代码 |
| `` Cmd+` `` | 切换窗口 |
| `F4` | 启动台 |
| `Escape` | 关闭菜单 |

---

## 认证流程

```
1. App 启动 → authStore.checkAuth()
2. 检查 localStorage 中的 fm_token
   ├── 无 token → authPhase = 'unauthenticated' → 显示 LoginScreen
   └── 有 token → GET /api/user 验证
       ├── 有效 → authPhase = 'authenticated' → 连接 WebSocket
       └── 无效(401) → 清除 token → 显示 LoginScreen

3. 用户登录 → POST /api/login { password }
   ├── 成功 → 存储 token，authPhase = 'authenticated'
   └── 失败 → 显示错误提示

4. WebSocket 连接后发送认证消息
```
