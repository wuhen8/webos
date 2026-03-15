# WebOS Backend

Go 后端服务，提供 JSON-RPC 2.0 API（WebSocket + HTTP）和 WASM 运行时。

## 架构

采用 **Handler-Service 分层** 架构：

```
┌─────────────────────────────────────────────────────────┐
│              协议适配层 (Handler - 薄层)                 │
│  WebSocket Handler │ HTTP Handler │ WASM Bridge         │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│              Service 层 (业务逻辑 - 核心)                │
│  FileService │ DockerService │ SystemService │ ...      │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│              基础设施层                                  │
│  Storage Driver (Local/S3) │ Database │ WASM Runtime    │
└─────────────────────────────────────────────────────────┘
```

**优势**：
- 业务逻辑独立于协议，可跨端复用
- Service 层可被 WebSocket、HTTP、WASM 任意调用
- 易于测试（纯业务逻辑）

## 功能

- **文件管理**：CRUD、分片上传、回收站、FTS5 全文搜索
- **多存储驱动**：本地文件系统、S3/MinIO
- **Docker 管理**：容器/镜像/Compose 管理
- **终端代理**：WebSocket 终端会话
- **定时任务**：Cron 调度器
- **AI 对话**：多供应商支持、工具调用、Skills 扩展
- **WASM 运行时**：Reactor 模式后台应用（wazero）
- **防火墙管理**：iptables 规则管理
- **IP 访问控制**：白名单审批机制
- **系统监控**：CPU、内存、磁盘、进程

## 目录结构

```
webos-backend/
├── main.go                          # 入口文件
├── internal/
│   ├── ai/                          # AI 对话与 Skills
│   │   ├── service.go               # AI 服务主逻辑
│   │   ├── executor.go              # AI 执行器
│   │   ├── tools.go                 # 工具注册表
│   │   ├── history.go               # 对话历史
│   │   ├── sandbox.go               # 沙箱容器
│   │   └── skills.go                # Skills 上下文
│   │
│   ├── auth/                        # JWT 认证
│   │
│   ├── config/                      # 配置管理
│   │
│   ├── database/                    # SQLite 数据库
│   │
│   ├── firewall/                    # 防火墙服务
│   │
│   ├── handler/                     # JSON-RPC Handler（薄层）
│   │   ├── ws.go                    # WebSocket 入口
│   │   ├── context.go               # 连接上下文
│   │   ├── handle_fs.go             # 文件系统 Handler
│   │   ├── handle_docker.go         # Docker Handler
│   │   ├── handle_chat.go           # AI 对话 Handler
│   │   ├── handle_terminal_*.go     # 终端 Handler
│   │   ├── handle_wasmproc.go       # WASM 进程 Handler
│   │   ├── handle_scheduled_jobs.go # 定时任务 Handler
│   │   └── ...
│   │
│   ├── jsonrpc/                     # JSON-RPC 2.0 协议
│   │   ├── protocol.go              # 协议类型定义
│   │   ├── adapter.go               # 适配器
│   │   ├── ws_conn.go               # WebSocket 连接
│   │   ├── http_conn.go             # HTTP 连接
│   │   └── wasm_conn.go             # WASM 连接
│   │
│   ├── pubsub/                      # 发布订阅系统
│   │
│   ├── service/                     # Service 层（业务逻辑）
│   │   ├── fs.go                    # 文件系统 Service
│   │   ├── docker.go                # Docker Service
│   │   ├── system.go                # 系统监控 Service
│   │   ├── firewall_service.go      # 防火墙 Service
│   │   ├── scheduler.go             # 调度器
│   │   ├── task_manager.go          # 后台任务管理
│   │   └── ...
│   │
│   ├── storage/                     # 存储驱动
│   │   ├── driver.go                # Driver 接口
│   │   ├── local.go                 # 本地存储
│   │   ├── s3.go                    # S3 存储
│   │   └── registry.go              # Driver 注册表
│   │
│   └── wasm/                        # WASM 运行时
│       ├── runtime.go               # wazero 运行时
│       ├── host_module.go           # 宿主模块
│       └── ...
│
├── sdk/
│   └── webos-sdk.js                 # 前端 SDK（embed）
│
└── dist/                            # 前端静态资源（embed）
```

## 运行

```bash
go mod download
go run main.go
```

默认端口 8080，可通过 `WEBOS_PORT` 环境变量修改。

## 构建

```bash
# 本地构建
go build -o webos-server

# 跨平台构建（使用 build.sh）
./build.sh 1.0.0
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `WEBOS_DATA_DIR` | 数据目录 | `~/.webos` |
| `WEBOS_PORT` | 监听端口 | `8080` |
| `WEBOS_JWT_SECRET` | JWT 密钥 | 随机生成 |

## API

详见项目根目录 README.md 的 API 协议部分。

### HTTP 接口

- `/api/login` — 登录
- `/api/auth/status` — 认证状态
- `/api/fs/:nodeId/upload` — 文件上传
- `/api/fs/:nodeId/download` — 文件下载
- `/api/ai/send` — 外部 AI 请求
- `/api/notify` — 系统通知广播

### WebSocket

所有业务操作通过 JSON-RPC 2.0 协议：`fs.*`、`terminal.*`、`docker.*`、`chat.*`、`wasm.*` 等。
