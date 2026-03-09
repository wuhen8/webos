# WASM 统一 Host Call API

## 概述

WASM 应用通过统一的 JSON-RPC 2.0 接口访问宿主机的所有能力。三端（WebSocket、HTTP、WASM）共享同一套协议规范。

## 架构

```
WASM App → request(method, params) → Host Router → JSON-RPC 2.0 Response
                                                  → 异步结果通过 on_event 推送
```

## 协议格式

### 同步调用（request 函数）

```go
// 调用
result := request("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path":   "/data/config.json",
})
// request() 自动解包 JSON-RPC 2.0 response，直接返回 result 内容
// 成功: {"content":"..."}
// 失败: {"error":"path not found"}
```

底层传输格式：
```json
// 宿主返回的原始格式（request 函数自动解包）
{ "jsonrpc": "2.0", "result": { "content": "..." }, "id": null }
{ "jsonrpc": "2.0", "error": { "code": -32000, "message": "path not found" }, "id": null }
```

### 异步调用（带回调）

```go
hostCallAsync("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path":   "/data/config.json",
}, func(success bool, data interface{}, err string) {
    if !success {
        logMsg("Error: " + err)
        return
    }
    // 处理返回的数据
})
```

### 异步事件推送（on_event）

宿主通过 `on_event` 推送 JSON-RPC 2.0 notification：

```json
// 异步请求结果
{ "jsonrpc": "2.0", "method": "host.response", "params": { "method": "http.request", "requestId": "req_1", "success": true, "data": {...} } }

// WebSocket 事件
{ "jsonrpc": "2.0", "method": "host.event", "params": { "method": "ws.message", "data": {...} } }

// AI 流式回复
{ "jsonrpc": "2.0", "method": "chat.delta", "params": { "conversationId": "c1", "content": "Hello" } }

// 定时器
{ "jsonrpc": "2.0", "method": "tick" }
```

## 可用能力

### 文件系统 (fs.*)

- `fs.read` - 读取文件
- `fs.write` - 写入文件
- `fs.list` - 列出目录
- `fs.delete` - 删除文件/目录
- `fs.mkdir` - 创建目录

### HTTP 请求 (http.*)

- `http.request` - 发起 HTTP 请求（异步，结果通过 `host.response` 推送）

### WebSocket (ws.*)

- `ws.connect` - 建立 WebSocket 连接
- `ws.send` - 发送消息
- `ws.close` - 关闭连接

### 进程管理 (process.*)

- `process.exec` - 执行 shell 命令

### 系统信息 (system.*)

- `system.info` - 获取系统信息
- `system.env` - 获取环境变量
- `system.log` - 输出日志

### 配置 (config.*)

- `config.get` - 读取应用配置
- `config.set` - 写入应用配置

### KV 存储 (kv.*)

- `kv.get` - 读取 KV
- `kv.set` - 写入 KV
- `kv.delete` - 删除 KV

### AI 对话 (chat.*)

- `chat.send` - 发送消息给 AI
- `chat.list` - 列出对话
- `chat.messages` - 获取对话消息

### 客户端上下文 (client_context.*)

- `client_context.register` - 注册客户端上下文（平台、能力声明）

## 示例

参考 `apps/feishu-ai-bot/host_call_example.go` 查看完整示例。

## 权限控制

当前版本默认允许所有能力访问。后续可通过修改 `capabilities.go` 中的 `CheckPermission` 函数实现细粒度权限控制。
