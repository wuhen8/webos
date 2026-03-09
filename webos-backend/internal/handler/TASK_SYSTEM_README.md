# 全局后台任务系统

## 概述

后台任务系统用于处理耗时操作（如 `docker compose up`、文件解压/压缩等）。任务提交后立即响应前端，执行结果通过 WebSocket 推送全局通知。

## 后端用法

### 核心 API

```go
// 获取单例
tm := GetTaskManager()

// 提交任务（立即返回任务 ID）
taskID := tm.Submit(taskType, title, func() (string, error) {
    // 执行耗时操作
    return "成功信息", nil  // 或 return "", err
})

// 获取所有任务（重连同步用）
tasks := tm.GetAll()

// 订阅任务更新（WS 连接时自动调用）
unsub := tm.Subscribe(connID, func(task BackgroundTask) {
    // 推送给客户端
})
defer unsub()
```

### 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `taskType` | 任务类型标识 | `"docker_compose_up"`, `"fs_extract"` |
| `title` | 用户可见的任务描述 | `"解压 archive.tar.gz"` |
| `fn` | 实际执行的函数，签名 `func() (string, error)` | 返回成功信息或错误 |

### 在 system_ws.go 中使用

三步：

```go
case "your_operation":
    // 1. 捕获闭包变量（避免 msg 被下一次循环覆盖）
    param1, param2 := msg.Param1, msg.Param2

    // 2. 提交后台任务
    GetTaskManager().Submit("your_operation", "描述文字", func() (string, error) {
        return someService.DoWork(param1, param2)
    })

    // 3. 立即响应前端（JSON-RPC 2.0）
    c.Reply("your_operation", reqID, map[string]string{
        "status": "submitted",
    })
```

### 示例：解压文件

```go
case "fs_extract":
    dest := msg.Dest
    if dest == "" {
        dest = filepath.Dir(msg.Path)
    }
    nodeID, path := msg.NodeID, msg.Path
    GetTaskManager().Submit("fs_extract", "解压 "+filepath.Base(path), func() (string, error) {
        if err := fileSvc.Extract(nodeID, path, dest); err != nil {
            return "", err
        }
        return dest, nil
    })
    c.Reply("fs_extract", reqID, map[string]string{"path": dest})
```

### 示例：压缩文件

```go
case "fs_compress":
    paths, output, nodeID := msg.Paths, msg.Output, msg.NodeID
    GetTaskManager().Submit("fs_compress", "压缩 "+filepath.Base(output), func() (string, error) {
        if err := fileSvc.Compress(nodeID, paths, output); err != nil {
            return "", err
        }
        return output, nil
    })
    c.Reply("fs_compress", reqID, map[string]string{"path": output})
```

## 前端

前端无需额外代码。`webSocketStore` 自动处理 `task.update` 推送（JSON-RPC 2.0 notification），`TaskIndicator` 组件自动显示在顶部菜单栏。

### 数据流

```
Submit() → goroutine 执行 → broadcast(running) → 前端 TaskIndicator 显示旋转图标
                           → broadcast(success/failed) → 前端弹出 toast + 更新图标
```

推送格式：
```json
{ "jsonrpc": "2.0", "method": "task.update", "params": { "id": "task_1", "status": "running", ... } }
```

### 手动读取任务状态（如需要）

```typescript
import { useTaskStore } from '@/stores/taskStore'

// 在组件中
const tasks = useTaskStore((s) => s.tasks)
const runningTasks = tasks.filter(t => t.status === 'running')

// 在组件外
const tasks = useTaskStore.getState().tasks
```

## 文件清单

| 文件 | 说明 |
|------|------|
| `backend/internal/handler/task_manager.go` | TaskManager 单例，内存保留最近 50 个任务 |
| `backend/internal/handler/system_ws.go` | WS 连接时订阅任务更新，处理 `task_list` 请求 |
| `frontend/src/stores/taskStore.ts` | Zustand store，管理任务列表状态 |
| `frontend/src/stores/webSocketStore.ts` | 处理 `task.update` 推送和重连同步 |
| `frontend/src/components/TaskIndicator.tsx` | 顶部菜单栏任务指示器 |
| `frontend/src/components/TopMenuBar.tsx` | 挂载 TaskIndicator |
