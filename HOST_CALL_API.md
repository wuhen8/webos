# WASM 统一 Host Call API

## 概述

WASM 应用现在可以通过统一的 JSON 接口访问宿主机的所有能力，类似 WebSocket 的通信模式。

## 架构

```
WASM App → hostCall(method, params) → Host Router → 异步响应 → WASM Callback
```

## 使用方法

### 1. 同步调用（立即返回 requestId）

```go
result := hostCall("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path": "/data/config.json",
})
// 返回: {"requestId":"hc_123456"}
```

### 2. 异步调用（带回调）

```go
hostCallAsync("fs.read", map[string]interface{}{
    "nodeId": "local",
    "path": "/data/config.json",
}, func(success bool, data interface{}, err string) {
    if !success {
        logMsg("Error: " + err)
        return
    }
    // 处理返回的数据
})
```

## 可用能力

### 文件系统 (fs.*)

- `fs.read` - 读取文件
- `fs.write` - 写入文件
- `fs.list` - 列出目录
- `fs.delete` - 删除文件/目录
- `fs.mkdir` - 创建目录

### 进程管理 (process.*)

- `process.exec` - 执行 shell 命令

### 系统信息 (system.*)

- `system.info` - 获取系统信息
- `system.env` - 获取环境变量

## 示例

参考 `host_call_example.go` 查看完整示例。

## 权限控制

当前版本默认允许所有能力访问。后续可通过修改 `capabilities.go` 中的 `CheckPermission` 函数实现细粒度权限控制。
