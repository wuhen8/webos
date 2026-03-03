# 后台任务进度系统 — 设计与实施计划

## 背景

文件管理器部署在远程虚拟机上，用户通过浏览器访问。所有文件操作（复制/移动/删除/上传）都经过网络，大文件容易超时且无进度反馈。

### 已完成的工作

copy/move/delete 已从同步 WebSocket request-response 改为后台任务（`TaskManager.Submit()`），立即返回，任务在 goroutine 中执行，完成后通过 `task_update` 推送通知。

涉及的文件改动：
- `webos-backend/internal/service/fs.go` — 新增 `CopyAcross`、`MoveAcross`、`BatchDelete`
- `webos-backend/internal/handler/system_ws.go` — `fs_copy`/`fs_move`/`fs_delete` 改为 `TaskManager.Submit()`，支持批量 `paths[]` 和跨存储 `dstNodeId`
- `webos-frontend/src/types/index.ts` — `ClipboardState` 加 `sourceNodeId`
- `webos-frontend/src/stores/webSocketStore.ts` — `fsDelete`/`fsCopy`/`fsMove` 改为批量+跨存储签名
- `webos-frontend/src/lib/storageApi.ts` — 适配新签名
- `webos-frontend/src/apps/file-manager/FileManagerContent.tsx` — paste/delete 改为 fire-and-forget，任务完成后自动刷新
- `webos-frontend/src/config/lazyWithRetry.tsx` — 从 `componentRegistry.tsx` 拆出，修复循环依赖

### 当前问题

`BackgroundTask` 只有 running/success/failed 三态，没有进度信息。用户看不到：
- 批量操作进行到第几个文件
- 大文件传输了多少字节
- 传输速率

---

## 架构设计决策

### 决策 1：进度上报放在 Driver 层（方案 1）

**不在 FileService 层统一走 ReadStream/WriteStream**，而是让每个 Driver 自己实现进度上报。

理由：
- 不同存储的最优复制策略完全不同（本地 io.Copy、S3 server-side copy、网盘各自 API）
- 统一走流式会浪费 S3 同 bucket 零流量 copy 等优化
- 加新存储类型时只需实现接口

### 决策 2：Driver 接口加 `ProgressFunc` 回调

```go
type ProgressFunc func(written, total int64)
```

改动的接口方法：
```go
Copy(src, dst string, onProgress ProgressFunc) error
WriteStream(path string, reader io.Reader, size int64, onProgress ProgressFunc) error
```

不需要进度的调用方传 `nil`，driver 内部判空跳过。

### 决策 3：分块续传用可选接口（Go interface assertion）

```go
// 基础接口 — 所有 driver 必须实现
type Driver interface {
    List(path string) ([]FileInfo, error)
    Read(path string) ([]byte, error)
    Write(path string, content []byte) error
    CreateDir(path string) error
    Delete(path string) error
    Rename(oldPath, newPath string) error
    Copy(src, dst string, onProgress ProgressFunc) error
    Move(src, dst string) error
    Stat(path string) (*FileInfo, error)
    ReadStream(path string) (io.ReadCloser, *FileInfo, error)
    WriteStream(path string, reader io.Reader, size int64, onProgress ProgressFunc) error
    PresignGetURL(path string, expires time.Duration) (string, error)
    PresignPutURL(path string, expires time.Duration) (string, error)
}

// 可选接口 — 支持分块上传的 driver 额外实现
type ChunkedUploader interface {
    InitUpload(path string, size int64) (uploadID string, err error)
    UploadChunk(uploadID string, partNum int, reader io.Reader, size int64) error
    CompleteUpload(uploadID string) error
    AbortUpload(uploadID string) error
    ListUploadedParts(uploadID string) ([]UploadedPart, error)
}
```

FileService 层用类型断言：
```go
if cu, ok := driver.(ChunkedUploader); ok {
    // 分块上传，支持断点续传
} else {
    // 降级走 WriteStream
}
```

所有 driver（包括 local）都应实现 `ChunkedUploader`，因为这是远程桌面场景，浏览器到服务端始终经过网络。

### 决策 4：进度数据模型

后端 `BackgroundTask` 扩展：
```go
type BackgroundTask struct {
    ID           string     `json:"id"`
    Type         string     `json:"type"`
    Title        string     `json:"title"`
    Status       TaskStatus `json:"status"`
    Message      string     `json:"message"`
    CreatedAt    int64      `json:"createdAt"`
    DoneAt       int64      `json:"doneAt,omitempty"`
    // 新增进度字段
    Progress     *float64   `json:"progress,omitempty"`     // 0-1 总进度，nil 表示不确定
    ItemCurrent  int64      `json:"itemCurrent,omitempty"`  // 当前第几个
    ItemTotal    int64      `json:"itemTotal,omitempty"`    // 总共几个
    BytesCurrent int64      `json:"bytesCurrent,omitempty"` // 已传输字节
    BytesTotal   int64      `json:"bytesTotal,omitempty"`   // 总字节数
}
```

- `progress` 由后端计算，前端直接用
- 混合场景计算示例：5个文件，第3个传了60% → `progress = (2 + 0.6) / 5 = 0.52`
- 速率由前端根据 `bytesCurrent` 时间差自行计算（不增加 broadcast 负担）
- broadcast 节流：最多每 200ms 一次

### 决策 5：前端展示策略

| 条件 | 展示 |
|------|------|
| `progress != null` + `bytesTotal > 0` | 百分比进度条 + 速率 (MB/s) + 已传/总量 |
| `progress != null` + 无 bytes | 百分比进度条 + "3/10 个文件" |
| `progress == null`（如 docker compose） | indeterminate 条纹动画 + message 文字 |

---

## 实施计划

### 阶段一：ProgressFunc + 任务进度上报 ✅ 已完成

#### Step 1: 改 Driver 接口 ✅
**文件**: `webos-backend/internal/storage/driver.go`
- 定义 `type ProgressFunc func(written, total int64)`
- `Copy` 签名加 `onProgress ProgressFunc`
- `WriteStream` 签名加 `onProgress ProgressFunc`
- 新增 `countingReader` 和 `NewCountingReader` 工具，包装 io.Reader 自动调用 onProgress

#### Step 2: 改 LocalDriver 实现 ✅
**文件**: `webos-backend/internal/storage/local.go`
- `Copy`: 改为流式复制 + `NewCountingReader`，支持文件和目录递归复制时的进度上报
- `WriteStream`: 用 `NewCountingReader` 包装 reader
- `copyFile`: 从 `ReadFile/WriteFile` 改为流式 `io.Copy` + counting，支持字节级进度
- `Move` 内部 fallback 的 `copyPath` 调用传 `nil`（rename 失败时的 copy 不需要进度）

#### Step 3: 改 S3Driver 实现 ✅
**文件**: `webos-backend/internal/storage/s3.go`
- `Copy`: server-side copy 成功后调一次 `onProgress(size, size)`；目录复制暂无逐文件进度
- `WriteStream`: 用 `NewCountingReader` 包装 reader 传给 `PutObject`
- `Rename`/`Move` 内部调用 `Copy` 传 `nil`

#### Step 4: 改 TaskManager 支持进度更新 ✅
**文件**: `webos-backend/internal/handler/task_manager.go`
- `BackgroundTask` 新增 `Progress *float64`、`ItemCurrent`、`ItemTotal`、`BytesCurrent`、`BytesTotal` 字段
- `Submit` 签名改为 `fn func(r *ProgressReporter) (string, error)`
- `ProgressReporter.Report()` 更新任务进度并节流 broadcast（200ms 间隔）
- `ProgressReporter.Flush()` 强制 broadcast（用于完成前最后一次更新）
- 任务完成时自动设置 `Progress = 1.0`

#### Step 5: 改 FileService 传递 progress ✅
**文件**: `webos-backend/internal/service/fs.go`
- `Copy` 加 `onProgress storage.ProgressFunc` 参数
- `Upload` 加 `onProgress storage.ProgressFunc` 参数
- `CopyAcross` 加 `onProgress storage.ProgressFunc` 参数，传给 `dstDriver.WriteStream`
- `MoveAcross` 加 `onProgress storage.ProgressFunc` 参数，透传给 `CopyAcross`
- HTTP handler (`fs.go`) 中的 `Copy`/`Upload` 调用传 `nil`

#### Step 6: 改 WebSocket handler 传递 reporter ✅
**文件**: `webos-backend/internal/handler/system_ws.go`
- `fs_delete`: 逐个删除，每完成一个调用 `r.Report()` 上报 items 进度
- `fs_copy`: 为每个文件构造 `ProgressFunc` 闭包，计算综合进度 `(itemIndex + itemProgress) / total`，上报 items + bytes
- `fs_move`: 同 `fs_copy` 模式，跨存储时有字节进度，同存储走 `Move` 无字节进度
- `fs_extract`/`fs_compress`/`docker_compose_up`: 签名适配 `*ProgressReporter`，暂不上报进度（indeterminate）

#### Step 7: 前端 taskStore 适配 ✅
**文件**: `webos-frontend/src/stores/taskStore.ts`
- `BackgroundTask` 加 `progress?`、`itemCurrent?`、`itemTotal?`、`bytesCurrent?`、`bytesTotal?`

#### Step 8: 前端任务 UI 展示进度 ✅
**文件**: `webos-frontend/src/components/TaskIndicator.tsx`
- `TaskProgress` 组件：确定进度条 + 百分比 + bytes/items 信息 + 速率
- `IndeterminateProgress` 组件：条纹滚动动画（用于无进度的任务）
- 速率计算：前端根据 `bytesCurrent` 时间差自行计算，500ms 最小采样间隔
- 运行中任务显示当前文件名（`task.message`）
- CSS 动画 `animate-indeterminate` 加入 `index.css`

### 阶段二：分块上传 + 断点续传 ✅ 已完成

> **传输方式**：Local 走 HTTP 中转，S3 走 presigned URL 直传（不经过服务器）
> **触发条件**：文件 > 10MB 走分块上传，≤ 10MB 保留现有单次 POST 上传
> **分块大小**：5MB（S3 最小分块要求），可配置
> **并发度**：前端同时上传 3 个分块
> **进度展示**：复用阶段一的 TaskManager + TaskIndicator，无需新 UI 组件
> **会话持久化**：服务端 SQLite（非 localStorage），支持跨浏览器恢复
> **S3 直传进度**：前端每完成一个 chunk 后通过 WebSocket 发 `upload_progress` 消息通知服务端
> **两种模式**：
> - **proxy 模式**（LocalDriver）：chunk 经服务器中转写入本地磁盘
> - **direct 模式**（S3Driver）：服务端只负责 init/complete/abort，chunk 由前端通过 presigned URL 直传 S3

---

#### Step 1: 定义 ChunkedUploader 接口 + DirectUploader 可选接口 ✅
**文件**: `webos-backend/internal/storage/driver.go`
- 新增 `UploadedPart`、`CompletedPart` 类型
- 新增 `ChunkedUploader` 接口（5 个方法：Init/UploadChunk/Complete/Abort/ListParts）
- 新增 `DirectUploader` 接口（`PresignUploadPart`）

---

#### Step 2: LocalDriver 实现 ChunkedUploader ✅
**文件**: `webos-backend/internal/storage/local.go`
- `LocalDriver` 新增 `uploads map[string]*localUploadSession` + `sync.Mutex`
- 临时目录 `{rootPath}/.uploads/{uploadID}/`，每个 part 写为 `part_000001` 等
- `meta.json` 持久化 targetPath + totalSize，服务重启时 `recoverUploads()` 恢复内存 map
- `CompleteUpload` 按 partNum 排序拼接所有 part 文件到目标路径

---

#### Step 3: S3Driver 实现 ChunkedUploader + DirectUploader ✅
**文件**: `webos-backend/internal/storage/s3.go`
- 新增 `minio.Core` 客户端用于低级 multipart API（`NewMultipartUpload`、`PutObjectPart`、`CompleteMultipartUpload`、`AbortMultipartUpload`、`ListObjectParts`）
- `S3Driver` 新增 `uploads map[string]*s3UploadSession` + `sync.Mutex`
- `PresignUploadPart` 通过 `client.Presign(PUT, ...)` 生成带 `partNumber` + `uploadId` 参数的 presigned URL
- `RecoverUpload` 方法支持从 DB 恢复会话到内存 map

---

#### Step 4: 上传会话注册表 + HTTP handlers + SQLite 持久化 ✅
**文件**: `webos-backend/internal/handler/upload.go`（新建）
- `uploadSession` 结构体：含 UploadID、NodeID、TaskID、Reporter、Done channel 等
- `uploadRegistry`：内存 map + RWMutex
- `upload_sessions` SQLite 表（migration v2）：持久化会话元数据，支持断点续传
- `FsUploadInitHandler`：检查 DB 是否有可恢复会话，有则返回已有 session；否则创建新 session + TaskManager 任务
- `FsUploadChunkHandler`：接收 chunk 二进制数据，调用 driver.UploadChunk，更新进度
- `FsUploadPresignHandler`：批量生成 presigned URL（S3 direct 模式）
- `FsUploadCompleteHandler`：调用 driver.CompleteUpload，关闭 Done channel 通知任务完成
- `FsUploadAbortHandler`：调用 driver.AbortUpload，清理
- `FsUploadPartsHandler`：查询已完成的 parts
- `ReportUploadProgress`：供 WebSocket handler 调用，更新 S3 直传进度
- `StartUploadCleaner`：后台 goroutine 每 30 分钟清理超过 24 小时的过期上传

**文件**: `webos-backend/internal/database/migrations.go`
- 新增 migration v2：`upload_sessions` 表 + 索引

---

#### Step 5: 注册路由 ✅
**文件**: `webos-backend/main.go`
- 新增 6 个路由（init/chunk/complete/abort/parts/presign）
- 保留原有 `POST /fs/:node_id/upload`（小文件继续用）
- 启动 `handler.StartUploadCleaner()`

---

#### Step 6: S3 直传进度上报 — WebSocket `upload_progress` ✅
**文件**: `webos-backend/internal/handler/system_ws.go`
- `wsClientMsg` 新增 `UploadID` 和 `PartNum` 字段
- 新增 `upload_progress` case：调用 `ReportUploadProgress(msg.UploadID, msg.PartNum)`
- 前端每完成一个 S3 直传 chunk 后发送 `{ type: "upload_progress", uploadId, partNum }`

---

#### Step 7: 前端分块上传逻辑 ✅
**文件**: `webos-frontend/src/lib/storageApi.ts`
- 新增辅助函数：`retryFetch`（带重试的 fetch）、`uploadWithConcurrency`（Promise 并发池）
- `fsApi.uploadChunked(nodeId, path, file)`：
  1. 调用 `/upload/init` 获取 session（服务端自动检查可恢复会话）
  2. 查询已完成 parts（断点续传）
  3. direct 模式：分批获取 presigned URL，直传 S3，每个 chunk 完成后 WS 通知进度
  4. proxy 模式：通过 HTTP POST 发送 chunk 到服务器
  5. 调用 `/upload/complete` 完成上传
- `fsApi.isChunkedUpload(file)`：判断是否走分块上传（> 10MB）
- 常量：`CHUNK_SIZE=5MB`、`CHUNK_THRESHOLD=10MB`、`CONCURRENT_CHUNKS=3`、`MAX_RETRIES=3`

---

#### Step 8: 前端上传入口改造 ✅
**文件**: `webos-frontend/src/apps/file-manager/FileManagerContent.tsx`
- `handleUpload`：大文件走 `fsApi.uploadChunked()`，小文件保留原有 presign/POST 逻辑
- 大文件上传成功 toast 由 TaskManager `task_update` 自动触发，不重复 toast
- 任务完成监听新增 `upload` 类型，自动刷新文件列表

---

### 设计决策变更记录

#### 变更 1：会话持久化从 localStorage 改为服务端 SQLite
**原方案**：前端 localStorage 存储上传会话信息
**新方案**：服务端 SQLite `upload_sessions` 表
**原因**：
- 服务端是 source of truth，跨浏览器/设备可恢复
- 前端无需管理 localStorage 生命周期
- `FsUploadInitHandler` 自动检查 DB 中是否有可恢复会话（幂等）

#### 变更 2：S3 直传进度通过 WebSocket 上报
**方案**：前端每完成一个 S3 直传 chunk 后，通过 WebSocket 发送 `upload_progress` 消息
**原因**：chunk 不经过服务器，服务端无法自动感知进度。WebSocket 消息轻量（几十字节），不增加 HTTP 往返

#### 变更 3：CopyAcross 可复用 ChunkedUploader（未来优化）
**现状**：`CopyAcross` 从 local→S3 走 `ReadStream` + `WriteStream`（minio PutObject 内部已支持 multipart）
**未来**：大文件跨存储复制可改用 `ChunkedUploader` 接口，获得更好的进度粒度和断点续传能力
**优先级**：低，当前实现已满足需求
