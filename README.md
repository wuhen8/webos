# WebOS

一个 macOS 风格的 Web 桌面操作系统，包含 Go 后端和 React 前端。支持窗口管理、代码编辑、终端模拟、Docker 管理、视频/音乐播放、AI 对话与 Skills 扩展等功能。

## 项目结构

```
webos/
├── webos-backend/              # Go 后端服务
│   ├── main.go                        # 主程序入口
│   ├── internal/
│   │   ├── ai/                        # AI 对话与 Skills 系统
│   │   ├── auth/                      # JWT 认证与密码管理
│   │   ├── config/                    # 配置管理（环境变量）
│   │   ├── handler/                   # HTTP/WebSocket 处理器
│   │   ├── service/                   # 业务逻辑（文件操作、定时任务等）
│   │   ├── storage/                   # 存储驱动（本地、S3）
│   │   └── database/                  # SQLite 数据库
│   └── go.mod                         # Go 模块配置
│
├── webos-frontend/             # React 前端应用
│   ├── src/
│   │   ├── App.tsx                    # 主应用组件
│   │   ├── main.tsx                   # 入口文件
│   │   ├── apps/                      # 模块化应用（16 个）
│   │   ├── components/                # 全局组件
│   │   ├── stores/                    # Zustand 状态管理（7 个 Store）
│   │   ├── hooks/                     # 自定义 Hooks
│   │   ├── config/                    # 配置与注册中心
│   │   ├── lib/                       # 工具库（请求、API、编辑器）
│   │   ├── types/                     # TypeScript 类型定义
│   │   └── utils/                     # 工具函数
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── apps/                              # 第三方应用示例
│   ├── monaco-editor/                 # 前端应用 - 代码编辑器
│   ├── office-view/                   # 前端应用 - Office 文档预览
│   └── telegram-ai-bot/              # Wasm 应用 - Telegram AI 机器人
│
└── build.sh                           # 构建脚本
```

> 详细的前端架构分析、全局组件说明和使用方法请参阅 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `WEBOS_DATA_DIR` | 应用数据目录，存放数据库、Skills、配置等 | `~/.webos` |
| `WEBOS_PORT` | 服务监听端口 | `8080` |
| `WEBOS_JWT_SECRET` | JWT 签名密钥。未设置时每次启动随机生成，重启后所有已签发的 Token 失效 | 随机 32 字节 |
| `WEBOS_SANDBOX_CONTAINER` | AI Skills 脚本执行所用的 Docker 沙箱容器名称 | `webos-sandbox` |

示例：

```bash
export WEBOS_DATA_DIR=/data/webos
export WEBOS_PORT=9090
export WEBOS_JWT_SECRET=your-secret-key
export WEBOS_SANDBOX_CONTAINER=my-sandbox
```

## 快速开始

### 1. 后端

```bash
cd webos-backend
go mod download
go run main.go
```

后端将在 http://localhost:8080 启动。

### 2. 前端

```bash
cd webos-frontend
pnpm install
pnpm dev
```

前端将在 http://localhost:3000 启动。

### 3. 构建发布版本

```bash
./build.sh 1.0.0
```

构建产物输出到 `webos-backend/release/`，支持 Windows/Linux/macOS 多平台。

## 功能特性

### 后端
- RESTful API + WebSocket 实时通信
- 文件/文件夹 CRUD 操作
- 分片上传（支持 S3 直传）
- JWT 认证机制
- Docker Compose 管理
- 终端 WebSocket 代理
- 定时任务管理
- AI 对话 + Skills 扩展系统
- 多存储驱动（本地文件系统、S3/MinIO）

### 前端
- macOS 风格桌面体验（窗口拖拽、缩放、吸附、最大化/最小化）
- 16 个模块化应用（文件管理器、代码编辑器、终端、Docker 管理、AI 对话等）
- Monaco Editor 代码编辑（语法高亮、格式化）
- xterm.js 终端模拟器
- ArtPlayer 视频播放器
- 音乐播放器（播放列表、循环、随机）
- Markdown 预览（GFM + 代码高亮）
- Spotlight 搜索（Cmd+K）
- 右键上下文菜单系统
- 全局快捷键
- 主题与偏好设置（壁纸、Dock 大小、编辑器主题等）
- 应用商店（安装/卸载扩展应用）

## Skills 系统

Skills 是 AI 对话功能的扩展机制，允许你为 AI 添加自定义知识（提示词）或可执行工具（脚本）。

Skills 目录位于 `{WEBOS_DATA_DIR}/skills/`（默认 `~/.webos/skills/`），启动时自动创建。

### Skill 类型

#### 1. 提示词 Skill（Prompt Skill）

为 AI 注入额外的上下文知识，支持两种格式：

**社区格式（推荐）** — 子目录 + `SKILL.md`：

```
skills/
└── my-knowledge/
    └── SKILL.md
```

`SKILL.md` 支持 YAML frontmatter：

```markdown
---
name: my-knowledge
description: 自定义知识描述
---

这里是提示词内容，AI 对话时会自动加载。
```

**根级文件（旧格式）** — 直接放置 `.md` 或 `.txt` 文件：

```
skills/
└── my-prompt.md
```

> 单个提示词文件最大 20KB，所有提示词总计最大 200KB。

#### 2. 脚本工具 Skill（Script Tool Skill）

让 AI 能够调用自定义脚本执行操作（如读取 Excel、调用外部 API 等）。脚本在 Docker 沙箱容器中隔离执行。

**子目录格式（推荐）** — `meta.json` + `main.py` / `main.sh`：

```
skills/
└── read_excel/
    ├── meta.json
    └── main.py
```

`meta.json` 定义工具的名称、描述和参数：

```json
{
  "name": "read_excel",
  "description": "读取 Excel 文件内容",
  "parameters": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "文件路径"
      }
    },
    "required": ["file_path"]
  }
}
```

`main.py` 中通过 `ARGS` 获取参数：

```python
# ARGS 是一个 dict，包含 AI 传入的参数
file_path = ARGS["file_path"]
# 你的处理逻辑...
print(result)
```

`main.sh` 中通过 `$ARGS` 环境变量获取 JSON 参数：

```bash
echo "$ARGS" | jq -r '.file_path'
# 你的处理逻辑...
```

**根级文件（旧格式）** — `.py`/`.sh` + 同名 `.json`：

```
skills/
├── read_excel.py
└── read_excel.json
```

### 沙箱配置

脚本工具 Skill 在 Docker 沙箱容器中执行，需要：

1. 预先创建并启动一个 Docker 容器（默认名称 `webos-sandbox`，可通过 `WEBOS_SANDBOX_CONTAINER` 环境变量修改）
2. 将 Skills 目录挂载到容器的 `/skills/` 路径

示例：

```bash
docker run -d --name webos-sandbox \
  -v ~/.webos/skills:/skills:ro \
  python:3.11-slim \
  sleep infinity
```

## 技术栈

### 后端
- Go + Gin Web Framework
- JWT Authentication（golang-jwt）
- WebSocket（gorilla/websocket）
- Docker SDK
- S3/MinIO（minio-go）
- SQLite（modernc.org/sqlite）

### 前端
- React 18 + TypeScript
- Vite 5（构建工具）
- Zustand（状态管理）
- Tailwind CSS 4
- shadcn/ui（Radix UI + Tailwind）
- Monaco Editor（代码编辑）
- xterm.js（终端）
- ArtPlayer（视频播放）
- framer-motion（动画）
- Axios（HTTP 请求）
- lucide-react（图标）

## API 接口

### HTTP 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/login` | 用户登录 |
| GET | `/api/auth/status` | 认证状态检查 |
| POST | `/api/setup-password` | 初始设置密码 |
| GET | `/api/user` | 获取用户信息 |
| PUT | `/api/password` | 修改密码 |
| POST | `/api/fs/:nodeId/upload` | 单文件上传 |
| POST | `/api/fs/:nodeId/upload/init` | 分片上传初始化 |
| POST | `/api/fs/:nodeId/upload/chunk` | 上传分片 |
| POST | `/api/fs/:nodeId/upload/complete` | 完成分片上传 |
| DELETE | `/api/fs/:nodeId/upload/:uploadId` | 取消分片上传 |
| GET | `/api/fs/:nodeId/upload/:uploadId/parts` | 获取已上传分片 |
| POST | `/api/fs/:nodeId/upload/:uploadId/presign` | 获取分片预签名 URL |
| GET | `/api/fs/:nodeId/presign` | 获取预签名 URL |
| GET | `/api/fs/:nodeId/download` | 下载文件 |
| GET | `/share/:token` | 分享链接下载 |

### WebSocket 接口

连接地址：`ws://{host}/api/ws`

首条消息发送 JWT Token 进行认证。所有业务操作均通过 WebSocket 消息通信，主要消息类型：

| 消息类型 | 描述 |
|----------|------|
| `fs_list` / `fs_read` / `fs_write` / `fs_mkdir` / `fs_create` / `fs_delete` / `fs_rename` / `fs_copy` / `fs_move` | 文件操作 |
| `fs_search` / `fs_extract` / `fs_compress` / `fs_offline_download` | 搜索、压缩、离线下载 |
| `fs_watch` / `fs_unwatch` | 文件变更监听 |
| `preferences_get` / `preferences_save` / `preferences_reset` | 偏好设置 |
| `sidebar_get` / `sidebar_save` | 侧边栏配置 |
| `app_overrides_get` / `app_override_save` / `app_override_delete` | 应用自定义配置 |
| `storage_nodes_list` / `storage_node_add` / `storage_node_update` / `storage_node_delete` | 存储节点管理 |
| `terminal_open` / `terminal_input` / `terminal_resize` / `terminal_close` | 终端 |
| `docker_*` | Docker 容器/镜像/Compose 管理 |
| `scheduled_jobs_*` | 定时任务管理 |
| `chat.send` / `chat.history` / `chat.messages` / `chat.delete` / `chat.cleanup` / `chat.status` | AI 对话 |
| `appstore_*` / `webapp_*` | 应用商店 |
| `share_create` / `share_delete` / `share_list` | 文件分享 |
| `subscribe` / `unsubscribe` | 系统监控订阅（overview、processes、disks 等） |

## 部署

### 单体部署（推荐）

构建时前端会嵌入到后端二进制中，只需部署一个可执行文件：

```bash
# 构建
./build.sh 1.0.0

# 运行
WEBOS_DATA_DIR=/data/webos WEBOS_JWT_SECRET=your-secret ./webos-linux-amd64
```

### 前后端分离部署

#### 后端

```bash
cd webos-backend
go build -o webos-server
./webos-server
```

#### 前端

```bash
cd webos-frontend
pnpm build
```

将 `dist` 目录部署到静态服务器，配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/webos-frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 文件下载与分享
    location /download/ {
        proxy_pass http://localhost:8080;
    }

    location /share/ {
        proxy_pass http://localhost:8080;
    }

    # 静态应用
    location /webapps/ {
        proxy_pass http://localhost:8080;
    }
}
```

## 许可证

MIT
