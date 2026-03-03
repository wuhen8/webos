# WebOS Backend

Go 后端服务，提供文件管理 API 和 WebSocket 实时通信。

## 功能

- 文件/文件夹 CRUD 操作
- 文件上传/下载（HTTP）
- 多存储节点管理
- 偏好设置、侧边栏、应用配置
- Docker 容器/镜像/Compose 管理
- 终端模拟
- 定时任务
- 系统监控（CPU、内存、磁盘、进程）

## 安装

```bash
go mod download
```

## 运行

```bash
go run main.go
```

默认端口通过配置文件指定。

## API 接口

### HTTP

- `POST /api/login` — 登录
- `GET /api/auth/status` — 认证状态
- `POST /api/setup-password` — 初始设置密码
- `GET /api/user` — 用户信息
- `PUT /api/password` — 修改密码
- `POST /api/fs/:nodeId/upload` — 单文件上传
- `POST /api/fs/:nodeId/upload/init` — 分片上传初始化
- `POST /api/fs/:nodeId/upload/chunk` — 上传分片
- `POST /api/fs/:nodeId/upload/complete` — 完成分片上传
- `GET /api/fs/:nodeId/download` — 下载文件

### WebSocket

连接地址：`/api/ws?token=JWT`

其余所有业务操作（文件管理、偏好设置、侧边栏、应用配置、存储节点、Docker、终端、定时任务等）均通过 WebSocket 消息通信。

## 文件存储

通过存储节点配置管理，支持本地和 S3 兼容存储。
