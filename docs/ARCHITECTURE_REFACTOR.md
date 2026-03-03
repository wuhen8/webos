# 架构重构方案

## 一、后端：引入 SQLite（modernc.org/sqlite）

### 1. 文件结构变更

```
~/.config/webos/
├── config.json          # 保留：端口、密码哈希、存储节点
└── webos.db      # 新增：SQLite 数据库
```

删除：`settings.json`、`app-registry.json`

### 2. SQLite 表设计

```sql
-- schema 版本管理
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

-- 用户偏好 KV 表（替代 settings.json 中的 UI 部分）
CREATE TABLE IF NOT EXISTS preferences (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 侧边栏收藏（从 settings.json 拆出）
CREATE TABLE IF NOT EXISTS sidebar_items (
    id         TEXT PRIMARY KEY,
    parent_id  TEXT,
    name       TEXT NOT NULL,
    icon       TEXT,
    path       TEXT,
    node_id    TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- 应用个性化覆盖（默认定义在前端代码中）
CREATE TABLE IF NOT EXISTS app_overrides (
    app_id    TEXT PRIMARY KEY,
    overrides TEXT NOT NULL  -- JSON: {"dockOrder":3,"showInDock":false}
);

-- 文件元数据索引（搜索功能核心）
CREATE TABLE IF NOT EXISTS file_index (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id       TEXT NOT NULL,
    path          TEXT NOT NULL,
    name          TEXT NOT NULL,
    is_dir        BOOLEAN,
    size          INTEGER,
    extension     TEXT,
    modified_time DATETIME,
    indexed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node_id, path)
);
CREATE INDEX IF NOT EXISTS idx_file_name ON file_index(name);
CREATE INDEX IF NOT EXISTS idx_file_ext  ON file_index(extension);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
    name, path,
    content='file_index',
    content_rowid='id'
);
```

### 3. 首次启动默认值

preferences 表默认数据：
- dockSize: 56
- fontSize: 14
- wallpaperUrl: null
- editorTheme: "vs-dark"

sidebar_items 表默认数据：
- home（个人收藏，顶级）
  - desktop（桌面，~/Desktop）
  - documents（文档，~/Documents）
  - downloads（下载，~/Downloads）

app_overrides 表：初始为空（用户未自定义时不写入）

### 4. 后端新增模块

```
webos-backend/internal/
├── database/
│   ├── db.go              # SQLite 连接管理、初始化、schema 升级
│   └── migrations.go      # 版本化迁移脚本
├── handler/
│   ├── settings.go        # 改造：读写 SQLite preferences + sidebar_items
│   ├── app_overrides.go   # 新增：WebSocket app_overrides_get / app_override_save
│   └── search.go          # 新增：WebSocket fs_search
```

### 5. 后端删除内容

- 删除 `handler/app_registry.go`（整个文件）
- 删除 `settings.go` 中读写 settings.json 的逻辑
- 删除 `settings.go` 中读写 app-registry.json 的逻辑
- 删除启动时生成 settings.json / app-registry.json 的代码

### 6. API 变更

| 旧接口 | 新接口 | 说明 |
|--------|--------|------|
| GET /app-registry | 删除 | 前端不再从后端加载应用定义 |
| PUT /app-registry | 删除 | 同上 |
| GET /settings | WebSocket `preferences_get` | 返回所有偏好 KV |
| PUT /settings | WebSocket `preferences_save` | 部分更新偏好 |
| - | WebSocket `sidebar_get` | 返回侧边栏树 |
| - | WebSocket `sidebar_save` | 更新侧边栏 |
| - | WebSocket `app_overrides_get` | 返回用户自定义的应用配置 |
| - | WebSocket `app_override_save` | 更新某应用的个性化配置 |
| - | WebSocket `fs_search` | 全文搜索文件 |

---

## 二、前端：应用模块化

### 1. 目录结构

```
src/
├── apps/                              # 每个应用一个目录
│   ├── file-manager/
│   │   ├── index.tsx                  # FileManagerContent 组件
│   │   └── manifest.ts               # 应用定义
│   ├── editor/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── terminal/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── settings/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── docker/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── task-manager/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── about/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── video/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   ├── image/
│   │   ├── index.tsx
│   │   └── manifest.ts
│   └── music-player/
│       ├── index.tsx
│       └── manifest.ts
│
├── components/                        # 仅保留全局共享组件
│   ├── ui/
│   ├── Window.tsx
│   ├── Dock.tsx
│   ├── Sidebar.tsx
│   ├── TopMenuBar.tsx
│   ├── ContextMenuRenderer.tsx
│   └── LoginScreen.tsx
│
├── config/
│   └── appRegistry.ts                 # 自动收集 manifest，不再手写
```

### 2. manifest.ts 示例

```typescript
// src/apps/terminal/manifest.ts
import type { AppDefinition } from '@/types'

export const manifest: AppDefinition = {
  id: 'terminal',
  name: '终端',
  icon: 'TerminalSquare',
  gradient: 'from-gray-700 to-gray-900',
  shadow: 'shadow-gray-800/30',
  defaultSize: { width: 720, height: 450 },
  defaultPosition: { xOffset: 100, yOffset: 100 },
  singleton: false,
  autoNumber: true,
  showInDock: true,
  dockOrder: 4,
  menus: [
    {
      label: 'Shell',
      items: [
        { label: '新建窗口', shortcut: '⌘N', action: 'newTerminal' },
        { label: '新建标签页', shortcut: '⌘T', action: 'newTerminalTab' },
      ],
    },
  ],
}
```

### 3. appRegistry.ts 自动收集

```typescript
// src/config/appRegistry.ts
import type { AppDefinition } from '@/types'

// Vite import.meta.glob 自动扫描所有 manifest
const manifestModules = import.meta.glob('../apps/*/manifest.ts', { eager: true })

const defaultRegistry: Record<string, AppDefinition> = {}

for (const [, mod] of Object.entries(manifestModules)) {
  const { manifest } = mod as { manifest: AppDefinition }
  defaultRegistry[manifest.id] = manifest
}

// 应用组件也自动收集
const appModules = import.meta.glob('../apps/*/index.tsx', { eager: true })

const componentMap: Record<string, React.ComponentType<any>> = {}
for (const [path, mod] of Object.entries(appModules)) {
  const dirName = path.split('/').at(-2)!
  componentMap[dirName] = (mod as any).default
}

export { defaultRegistry, componentMap }
```

### 4. 前端缓存优化

localStorage 变更：
- `fm_settings` → `fm_preferences_v1`（带版本号）
- 删除 `userInfo`（从 JWT 解码获取）
- `fm_token` 保留不变

---

## 三、实施步骤

### 第一步：后端 SQLite 基础设施
- [ ] 引入 modernc.org/sqlite 依赖
- [ ] 新建 internal/database/db.go — 连接管理、建表、schema 版本
- [ ] 新建 internal/database/migrations.go — 迁移脚本
- [ ] main.go 中初始化数据库

### 第二步：后端 preferences + sidebar 接口
- [ ] 改造 settings handler — 读写 SQLite preferences 表
- [ ] 新增 sidebar handler — 读写 SQLite sidebar_items 表
- [ ] 删除 settings.json 相关代码
- [ ] 更新路由注册

### 第三步：后端 app_overrides 接口
- [ ] 新增 app_overrides handler — GET/PUT
- [ ] 删除 app_registry.go 及相关代码
- [ ] 删除 app-registry.json 相关代码
- [ ] 更新路由注册

### 第四步：前端应用模块化
- [ ] 创建 src/apps/ 目录结构
- [ ] 将各 *Content.tsx 移入对应 apps/*/index.tsx
- [ ] 为每个应用创建 manifest.ts
- [ ] 改造 appRegistry.ts 为自动收集
- [ ] 改造 Window.tsx 使用 componentMap
- [ ] 删除旧的 appRegistry.ts 中的硬编码定义

### 第五步：前端对接新 API
- [x] settingsStore 对接 WebSocket preferences 接口
- [x] Sidebar 组件对接 WebSocket sidebar 接口
- [x] Dock 组件对接 WebSocket app-overrides 接口
- [ ] localStorage 缓存策略更新

### 第六步：文件索引 + 搜索（后续）
- [ ] 后端文件索引 goroutine
- [ ] 增量更新逻辑（文件操作时同步更新索引）
- [ ] GET /search 接口
- [ ] 前端搜索 UI


---

## 四、协议层与业务层解耦

### 背景

当前 handler 层（`internal/handler/`）同时承担协议适配和业务逻辑，导致：
- WASM app 调用需要绕假 WSConn，删掉 WebSocket 整个系统就炸
- 新增协议（HTTP API、gRPC）需要重复写业务逻辑
- 命令拦截、数据查询等逻辑散落在各协议层

### 目标架构

```
Service 层（业务逻辑，协议无关）
  ├── ai/ChatService        ✅ 已完成
  ├── service/FsBatchService
  ├── service/AppLifecycleService
  ├── service/DockerOpsService
  ├── service/ScheduledJobService
  ├── service/TerminalService
  └── service/ShareService

协议适配层（并列，互不依赖，只做格式转换）
  ├── handler/handle_*.go    — WebSocket 适配
  ├── handler/wasm_bridge.go — WASM sync handler 适配
  └── handler/api_*.go       — HTTP API 适配
```

### 已完成：Chat/AI 模块

- [x] 创建 `ai/ChatService` 统一入口
- [x] WebSocket handler (`handle_chat.go`) 只做 WS 格式转换
- [x] WASM bridge 所有 chat 操作注册为 sync handler，直接调 ChatService
- [x] HTTP API (`api_ai.go`) 只做 HTTP 状态码映射
- [x] 命令拦截下沉到 `AIExecutor.Enqueue`，独立协程执行，不入队
- [x] 命令结果通过 `BroadcastSink` 广播，所有协议层统一接收

### P1：文件系统批量操作

handler 现状：`handle_fs.go` 中批量删除、复制、移动、压缩/解压都在 handler 里写循环 + 进度回调。

计划：
- [ ] 创建 `service/fs_batch.go` — `FsBatchService`
- [ ] `DeleteBatch(paths) → progress callback`
- [ ] `CopyBatch(src, dst) → progress callback`
- [ ] `MoveBatch(src, dst) → progress callback`
- [ ] `CompressArchive(paths, format) → task`
- [ ] `ExtractArchive(path, dst) → task`
- [ ] `DownloadFromURL(url, dst) → task`
- [ ] `CalculateDirSize(path) → size, context 可取消`
- [ ] handler 只做 WS 消息解析 + 进度事件推送

### P2：应用生命周期

handler 现状：`handle_appstore.go` 中安装/卸载/启停/更新逻辑混在 handler 里，包含配置合并、任务提交。

计划：
- [ ] 创建 `service/app_lifecycle.go` — `AppLifecycleService`
- [ ] `InstallApp(id, config) → task`
- [ ] `UninstallApp(id) → task`
- [ ] `StartApp(id) / StopApp(id)`
- [ ] `UpdateApp(id) → task`
- [ ] `GetAppStatus(id) → status`
- [ ] `UpdateAppConfig(id, config)`
- [ ] `InstallSkill(name) / UninstallSkill(name)`

### P3：Docker 操作

handler 现状：`handle_docker.go` 中 compose 创建、镜像拉取、日志流订阅都在 handler 里。

计划：
- [ ] 创建 `service/docker_ops.go` — `DockerOpsService`
- [ ] `CreateCompose(yaml, path) → task`
- [ ] `PullImage(image) → progress callback`
- [ ] `StreamLogs(container, follow) → reader`
- [ ] `ManageNetworks / ManageVolumes`

### P4：定时任务管理

handler 现状：`handle_scheduled_jobs.go` 中 cron 验证、任务创建/更新逻辑在 handler 里。

计划：
- [ ] 创建 `service/scheduled_job_mgmt.go` — `ScheduledJobMgmtService`
- [ ] `CreateJob(config) → job`（含 cron 验证）
- [ ] `UpdateJob(id, config) → job`
- [ ] `DeleteJob(id) / RunJobNow(id)`
- [ ] `ListJobs() → []job`

### P5：终端管理

handler 现状：`handle_terminal.go` 中 PTY 创建、会话管理全在 handler 里。

计划：
- [ ] 创建 `service/terminal.go` — `TerminalService`
- [ ] `OpenTerminal(shell, cwd, env) → session`
- [ ] `SendInput(sessionID, data)`
- [ ] `ResizeTerminal(sessionID, cols, rows)`
- [ ] `CloseTerminal(sessionID)`

### P6：系统操作 + 分享

handler 现状：`handle_system.go` 命令执行、`handle_share.go` 分享链接管理。

计划：
- [ ] `SystemOpsService.DoUpdate() → task`
- [ ] `SystemOpsService.ExecuteCommand(cmd) → result`
- [ ] `ShareService.CreateLink / DeleteLink / ListLinks`

### 每个模块的改造模式

统一按以下步骤：
1. 在 `service/` 或对应包下创建 `XxxService` struct
2. 把 handler 中的业务逻辑提取到 service 方法
3. handler 变成薄适配器：解析请求 → 调 service → 格式化响应
4. wasm_bridge 注册对应的 sync handler，调同一个 service
5. 需要时 HTTP API 也调同一个 service
