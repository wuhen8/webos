# JSON-RPC 2.0 统一协议

## 概述

WebOS 采用 JSON-RPC 2.0 作为统一的通信协议，三端（WebSocket、HTTP、WASM）共享同一套规范。

## 协议格式

### 请求

```json
{
  "jsonrpc": "2.0",
  "method": "fs.read",
  "params": { "nodeId": "local", "path": "/data/config.json" },
  "id": "req_123"
}
```

- `jsonrpc`: 必须是 `"2.0"`
- `method`: 方法名，点分隔的命名空间（如 `fs.read`、`chat.send`）
- `params`: 参数对象（可选）
- `id`: 请求标识（字符串或数字）。无 id 表示通知（不需要响应）

### 成功响应

```json
{
  "jsonrpc": "2.0",
  "result": { "content": "..." },
  "id": "req_123"
}
```

### 错误响应

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "path not found",
    "data": { "path": "/data/config.json" }
  },
  "id": "req_123"
}
```

### 通知（服务端推送，无 id）

```json
{
  "jsonrpc": "2.0",
  "method": "task.update",
  "params": { "id": "task_1", "progress": 0.5 }
}
```

---

## 标准错误码

| 代码 | 名称 | 说明 |
|------|------|------|
| -32700 | Parse error | JSON 解析失败 |
| -32600 | Invalid Request | 请求格式无效 |
| -32601 | Method not found | 方法不存在 |
| -32602 | Invalid params | 参数无效 |
| -32603 | Internal error | 内部错误 |
| -32000 | Server error | 服务器错误（通用） |
| -32001 | Unauthorized | 未授权 |
| -32002 | Permission denied | 权限不足 |
| 4010 | Password required | 需要密码（解压加密文件） |
| 4011 | Password incorrect | 密码错误 |

---

## 传输通道

### WebSocket

连接地址：`ws://{host}/api/ws`

首条消息必须认证：

```json
{ "jsonrpc": "2.0", "method": "auth", "params": { "token": "JWT_TOKEN" } }
```

认证成功后可发送任意请求，服务端可主动推送通知。

### HTTP

部分操作通过 HTTP 接口（文件上传/下载、代理等），详见 README.md 的 HTTP 接口列表。

### WASM

WASM 模块通过 `request` 宿主函数调用系统 API：

```go
result := request("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path":   "/data/config.json",
})
```

宿主通过 `on_event` 导出函数推送事件：

```go
//go:wasmexport on_event
func on_event(ptr uint32, size uint32) uint32 {
    // data 是 JSON-RPC 2.0 notification
    return 0
}
```

---

## 主要方法列表

### 文件系统 (fs.*)

| 方法 | 说明 |
|------|------|
| `fs.list` | 列出目录内容 |
| `fs.read` | 读取文件内容 |
| `fs.write` | 写入文件内容 |
| `fs.mkdir` | 创建目录 |
| `fs.create` | 创建文件 |
| `fs.delete` | 删除（移到回收站） |
| `fs.rename` | 重命名 |
| `fs.copy` | 复制 |
| `fs.move` | 移动 |
| `fs.extract` | 解压 |
| `fs.compress` | 压缩 |
| `fs.search` | 搜索文件 |
| `fs.watch` | 监听目录变更 |
| `fs.unwatch` | 取消监听 |
| `fs.stat` | 获取文件信息 |
| `fs.trash_list` | 列出回收站 |
| `fs.trash_restore` | 恢复文件 |
| `fs.trash_delete` | 永久删除 |

### 终端 (terminal.*)

| 方法 | 说明 |
|------|------|
| `terminal.open` | 打开终端会话 |
| `terminal.input` | 发送输入 |
| `terminal.resize` | 调整尺寸 |
| `terminal.close` | 关闭会话 |

### Docker (docker.*)

| 方法 | 说明 |
|------|------|
| `docker.containers` | 容器列表 |
| `docker.container_action` | 容器操作（start/stop/restart/remove） |
| `docker.container_logs` | 容器日志 |
| `docker.images` | 镜像列表 |
| `docker.compose_ps` | Compose 项目状态 |
| `docker.compose_create` | 创建 Compose 项目 |
| `docker.compose_action` | Compose 操作（up/down/restart） |

### AI 对话 (chat.*)

| 方法 | 说明 |
|------|------|
| `chat.send` | 发送消息 |
| `chat.history` | 对话列表 |
| `chat.messages` | 对话消息 |
| `chat.delete` | 删除对话 |
| `chat.stop` | 停止当前会话生成并清理该会话未开始的排队消息 |
| `chat.switch_conv` | 切换对话 |

`chat.stop` 请求示例：

```json
{
  "jsonrpc": "2.0",
  "method": "chat.stop",
  "params": {
    "conversationId": "conv_123"
  },
  "id": "req_stop_1"
}
```

`chat.stop` 成功响应示例：

```json
{
  "jsonrpc": "2.0",
  "result": {
    "conversationId": "conv_123",
    "stoppedActive": true,
    "clearedPending": 2
  },
  "id": "req_stop_1"
}
```

### 定时任务 (scheduled_job.*)

| 方法 | 说明 |
|------|------|
| `scheduled_job.list` | 任务列表 |
| `scheduled_job.create` | 创建任务 |
| `scheduled_job.update` | 更新任务 |
| `scheduled_job.delete` | 删除任务 |
| `scheduled_job.run` | 立即执行 |
| `scheduled_job.enable` | 启用任务 |
| `scheduled_job.disable` | 禁用任务 |

### 后台任务 (task.*)

| 方法 | 说明 |
|------|------|
| `task.list` | 任务列表 |
| `task.cancel` | 取消任务 |
| `task.retry` | 重试任务 |

### 订阅 (sub.*)

| 方法 | 说明 |
|------|------|
| `sub.subscribe` | 订阅频道 |
| `sub.unsubscribe` | 取消订阅 |

可用频道：`sub.overview`（系统概览）、`sub.processes`（进程列表）、`sub.disks`（磁盘信息）等。

### WASM 进程 (wasm.*)

| 方法 | 说明 |
|------|------|
| `wasm.start` | 启动进程 |
| `wasm.stop` | 停止进程 |
| `wasm.restart` | 重启进程 |
| `wasm.list` | 进程列表 |

### 应用商店 (appstore.*)

| 方法 | 说明 |
|------|------|
| `appstore.catalog` | 获取目录 |
| `appstore.install` | 安装应用 |
| `appstore.uninstall` | 卸载应用 |
| `appstore.installed` | 已安装列表 |

---

## 示例

### 列出目录

```json
// 请求
{
  "jsonrpc": "2.0",
  "method": "fs.list",
  "params": { "nodeId": "local_1", "path": "/" },
  "id": "r_1"
}

// 响应
{
  "jsonrpc": "2.0",
  "result": [
    { "name": "Documents", "isDir": true, "size": 0, "modifiedTime": "2024-01-01T00:00:00Z" },
    { "name": "config.json", "isDir": false, "size": 1024, "modifiedTime": "2024-01-01T00:00:00Z" }
  ],
  "id": "r_1"
}
```

### 订阅系统监控

```json
// 请求
{
  "jsonrpc": "2.0",
  "method": "sub.subscribe",
  "params": { "channel": "sub.overview", "interval": 2000 },
  "id": "r_2"
}

// 响应
{ "jsonrpc": "2.0", "result": { "subscribed": true }, "id": "r_2" }

// 后续推送
{
  "jsonrpc": "2.0",
  "method": "sub.overview",
  "params": { "cpu": 45.2, "memory": 68.1, "disk": 55.3 }
}
```

### WASM 中调用

```go
// 读取文件
result := request("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path":   "/data/config.json",
})

// HTTP 请求
result := request("http.request", map[string]interface{}{
    "method": "POST",
    "url":    "https://api.example.com/webhook",
    "body":   map[string]string{"text": "hello"},
    "headers": map[string]string{"Content-Type": "application/json"},
})
```
