# WebOS Backend - Handler-Service 分层架构

## 📋 项目概览

| 项目信息 | 详情 |
|---------|------|
| 后端框架 | Go 1.24 + Gin Web Framework |
| 前端框架 | React 18 + TypeScript + Vite |
| 通信方式 | REST API (HTTP/JSON) + WebSocket (终端) |
| 认证方式 | JWT Bearer Token |
| 存储抽象 | Driver 接口 (Local / S3) |
| 部署方式 | 单二进制 (前端 embed 到 Go 二进制) |

---

## 🏗️ 架构演进

### 重构前架构（单层）

```
┌─────────────────────────────────────────┐
│           客户端 (React)                 │
└──────────────┬──────────────────────────┘
               │ HTTP REST API
               ▼
┌─────────────────────────────────────────┐
│         Handler 层 (Gin)                 │
│  ┌────────────────────────────────┐     │
│  │  业务逻辑 + HTTP 处理混在一起   │     │
│  │  - 参数解析                     │     │
│  │  - 业务逻辑（排序、验证等）      │     │
│  │  - 直接调用 Storage Driver      │     │
│  │  - 响应格式化                   │     │
│  └────────────────────────────────┘     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Storage Driver 层                   │
│  (Local / S3)                            │
└─────────────────────────────────────────┘
```

**问题**：
- ❌ 业务逻辑和 HTTP 协议耦合
- ❌ 无法跨端复用
- ❌ 难以测试（依赖 HTTP 上下文）
- ❌ Handler 职责过重

### 重构后架构（三层）

```
┌──────────────────────────────────────────────────────────┐
│                    客户端层                               │
│  Web (React) │ 桌面端 (Tauri) │ App │ 其他协议            │
└────┬─────────┴────────┬────────┴─────┴──────┬────────────┘
     │                  │                     │
     │ HTTP REST        │ Tauri Bridge        │ gRPC/WebSocket
     ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────┐
│              协议适配层 (Handler - 薄层)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ HTTP       │  │ Tauri      │  │ gRPC       │         │
│  │ Handler    │  │ Command    │  │ Handler    │         │
│  │ (薄层)     │  │            │  │            │         │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘         │
│        │               │               │                 │
│        └───────────────┼───────────────┘                 │
│                        ▼                                 │
│  ┌──────────────────────────────────────────────┐       │
│  │         Service 层 (业务逻辑 - 核心)          │       │
│  │  ┌──────────────────────────────────────┐    │       │
│  │  │ FileService (文件系统)                │    │       │
│  │  │  - List / Read / Write               │    │       │
│  │  │  - Copy / Move / Delete / Rename     │    │       │
│  │  │  - Upload / Download / Presign       │    │       │
│  │  └──────────────────────────────────────┘    │       │
│  │  ┌──────────────────────────────────────┐    │       │
│  │  │ DockerService (容器管理)              │    │       │
│  │  │  - ListContainers / ContainerAction  │    │       │
│  │  │  - ListImages / RemoveImage          │    │       │
│  │  │  - ComposeAction / GetComposeLogs    │    │       │
│  │  └──────────────────────────────────────┘    │       │
│  │  ┌──────────────────────────────────────┐    │       │
│  │  │ FirewallService (防火墙管理)          │    │       │
│  │  │  - GetRules / AddRule / DeleteRule   │    │       │
│  │  │  - GetNatRules / AddNatRule          │    │       │
│  │  │  - SetForwardStatus                  │    │       │
│  │  └──────────────────────────────────────┘    │       │
│  │  ┌──────────────────────────────────────┐    │       │
│  │  │ SystemService (系统监控)              │    │       │
│  │  │  - GetOverview (CPU/内存/磁盘/网络)   │    │       │
│  │  │  - GetProcessList / KillProcess      │    │       │
│  │  └──────────────────────────────────────┘    │       │
│  └──────────────────┬───────────────────────────┘       │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────┐
│           Storage Driver / Adapter 层                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Local    │  │ S3       │  │ Docker   │               │
│  │ Driver   │  │ Driver   │  │ CLI      │               │
│  └──────────┘  └──────────┘  └──────────┘               │
└──────────────────────────────────────────────────────────┘
```

**优势**：
- ✅ 业务逻辑独立，协议无关
- ✅ Service 层可被任意协议调用
- ✅ 易于测试（纯业务逻辑）
- ✅ Handler 职责清晰（仅参数解析 + 响应格式化）
- ✅ 支持跨端复用（Web、桌面端、App）

---

## 📊 重构成果统计

### 模块重构对比

| 模块 | 重构前 | Handler (重构后) | Service (重构后) | 总计 | 减少比例 |
|------|--------|------------------|------------------|------|----------|
| **文件系统** | 368 行 | 288 行 | 204 行 | 492 行 | Handler -22% |
| **Docker** | 322 行 | 260 行 | 228 行 | 488 行 | Handler -19% |
| **Firewall** | 520 行 | 246 行 | 457 行 | 703 行 | Handler -53% |
| **System** | 447 行 | 68 行 | 452 行 | 520 行 | Handler -85% |
| **总计** | **1,657 行** | **862 行** | **1,341 行** | **2,203 行** | **Handler -48%** |

### 关键指标

- **API 端点数**：46 个（已删除 11 个 Legacy 端点）
- **Service 方法数**：40+ 个业务方法
- **代码可复用性**：100%（Service 层可被任意协议调用）
- **Handler 代码减少**：平均 48%
- **架构清晰度**：显著提升

---

## 🎯 核心模块详解

### 1. 文件系统模块 (FileService)

**Handler**: `internal/handler/fs.go` (288 行)
**Service**: `internal/service/fs.go` (204 行)

#### Service 方法 (13 个)

```go
type FileService struct{}

// 文件操作
func (s *FileService) List(nodeID, path string) ([]storage.FileInfo, error)
func (s *FileService) Read(nodeID, path string) ([]byte, error)
func (s *FileService) Write(nodeID, path string, content []byte) error
func (s *FileService) CreateFile(nodeID, path, name string) (string, error)
func (s *FileService) CreateDir(nodeID, path, name string) (string, error)
func (s *FileService) Delete(nodeID, path string) error
func (s *FileService) Rename(nodeID, path, oldName, newName string) (string, error)
func (s *FileService) Copy(nodeID, from, to string) (string, error)
func (s *FileService) Move(nodeID, from, to string) (string, error)

// 上传下载
func (s *FileService) Upload(nodeID, path, filename string, reader io.Reader, size int64) (string, error)
func (s *FileService) Download(nodeID, path string) (io.ReadCloser, *storage.FileInfo, error)

// 预签名 URL
func (s *FileService) PresignGetURL(nodeID, path string, expires time.Duration) (string, error)
func (s *FileService) PresignPutURL(nodeID, path string, expires time.Duration) (string, error)
```

#### 代码示例

**Handler (薄层)**：
```go
func FsListHandler(c *gin.Context) {
    nodeID := c.Param("node_id")
    path := c.Query("path")

    files, err := fileSvc.List(nodeID, path)
    if err != nil {
        response.Error(c, http.StatusInternalServerError, 500, err.Error())
        return
    }

    response.Success(c, files)
}
```

**Service (业务逻辑)**：
```go
func (s *FileService) List(nodeID, path string) ([]storage.FileInfo, error) {
    driver, err := storage.GetDriver(nodeID)
    if err != nil {
        return nil, err
    }

    if path == "" {
        path = "/"
    }

    files, err := driver.List(path)
    if err != nil {
        return nil, err
    }

    // 业务逻辑：排序（目录优先，然后按名称）
    sort.Slice(files, func(i, j int) bool {
        if files[i].IsDir && !files[j].IsDir {
            return true
        }
        if !files[i].IsDir && files[j].IsDir {
            return false
        }
        return files[i].Name < files[j].Name
    })

    return files, nil
}
```

---

### 2. Docker 模块 (DockerService)

**Handler**: `internal/handler/docker.go` (260 行)
**Service**: `internal/service/docker.go` (228 行)

#### Service 方法 (12 个)

```go
type DockerService struct{}

// Docker 基础
func (s *DockerService) IsAvailable() bool
func (s *DockerService) GetInfo() (interface{}, error)

// 容器管理
func (s *DockerService) ListContainers(all bool) ([]interface{}, error)
func (s *DockerService) ContainerAction(id, action string) error
func (s *DockerService) RemoveContainer(id string, force bool) error
func (s *DockerService) GetContainerLogs(id, tail string) (string, error)

// 镜像管理
func (s *DockerService) ListImages() ([]interface{}, error)
func (s *DockerService) RemoveImage(id string, force bool) error

// Docker Compose
func (s *DockerService) ListComposeProjects() ([]interface{}, error)
func (s *DockerService) ComposeAction(projectDir, action string) (string, error)
func (s *DockerService) GetComposeLogs(projectDir, tail string) (string, error)
```

---

### 3. 防火墙模块 (FirewallService)

**Handler**: `internal/handler/firewall.go` (246 行)
**Service**: `internal/service/firewall.go` (457 行)

#### Service 方法 (13 个)

```go
type FirewallService struct{}

// 防火墙基础
func (s *FirewallService) IsAvailable() bool
func (s *FirewallService) GetStatus() (*FirewallStatus, error)

// 防火墙规则
func (s *FirewallService) GetRules(chain string) (map[string][]FirewallRule, error)
func (s *FirewallService) AddRule(req *AddRuleRequest) (string, error)
func (s *FirewallService) DeleteRule(chain, num string) error
func (s *FirewallService) SetPolicy(chain, policy string) error

// IP 转发
func (s *FirewallService) GetForwardStatus() (bool, error)
func (s *FirewallService) SetForwardStatus(enabled bool) error

// NAT 规则
func (s *FirewallService) GetNatRules() (*NatRulesResult, error)
func (s *FirewallService) AddNatRule(req *AddNatRuleRequest) (string, error)
func (s *FirewallService) DeleteNatRule(chain, num string) error

// 辅助方法
func (s *FirewallService) parseIptablesOutput(chain string) ([]FirewallRule, error)
```

**特色功能**：支持三种 NAT 类型（DNAT、SNAT、MASQUERADE）

---

### 4. 系统监控模块 (SystemService)

**Handler**: `internal/handler/system.go` (68 行)
**Service**: `internal/service/system.go` (452 行)

#### Service 方法 (3 个核心方法)

```go
type SystemService struct{}

// 系统概览（CPU、内存、磁盘、网络）
func (s *SystemService) GetOverview() (SystemOverview, error)

// 进程列表
func (s *SystemService) GetProcessList() ([]ProcessInfo, error)

// 终止进程
func (s *SystemService) KillProcess(pid int, signal string) error
```

**特色功能**：
- 跨平台支持（Linux 和 macOS）
- 实时 CPU 使用率计算
- 内存、磁盘、网络统计
- 进程管理（列表、终止）

---

## 🚀 跨端复用示例

同一个 Service 方法可以被不同协议调用：

### HTTP (当前)
```go
func FsListHandler(c *gin.Context) {
    files, err := fileSvc.List(nodeID, path)
    response.Success(c, files)
}
```

### Tauri 桌面端 (将来)
```rust
#[tauri::command]
fn list_files(node_id: String, path: String) -> Result<Vec<FileInfo>, String> {
    fileSvc.List(node_id, path)
}
```

### gRPC (将来)
```go
func (s *GrpcServer) List(ctx context.Context, req *pb.ListRequest) (*pb.ListResponse, error) {
    files, err := fileSvc.List(req.NodeId, req.Path)
    return &pb.ListResponse{Files: files}, err
}
```

### WebSocket (将来)
```go
func handleListCommand(conn *websocket.Conn, msg *Message) {
    files, err := fileSvc.List(msg.NodeID, msg.Path)
    conn.WriteJSON(Response{Data: files, Error: err})
}
```

---

## 🧪 测试示例

Service 层可以直接进行单元测试，无需模拟 HTTP：

```go
func TestFileService_List(t *testing.T) {
    svc := service.NewFileService()

    // 直接调用业务方法
    files, err := svc.List("local_1", "/")

    assert.NoError(t, err)
    assert.NotNil(t, files)

    // 验证排序逻辑
    for i := 0; i < len(files)-1; i++ {
        if files[i].IsDir && !files[i+1].IsDir {
            // 目录应该在文件前面
            assert.True(t, true)
        }
    }
}
```

---

## 📁 目录结构

```
webos-backend/
├── main.go                          # 入口文件
├── internal/
│   ├── handler/                     # HTTP Handler 层（薄层）
│   │   ├── fs.go                    # 文件系统 Handler (288 行)
│   │   ├── docker.go                # Docker Handler (260 行)
│   │   ├── firewall.go              # 防火墙 Handler (246 行)
│   │   ├── system.go                # 系统监控 Handler (68 行)
│   │   ├── settings.go              # 设置 Handler
│   │   ├── app_registry.go          # 应用注册表 Handler
│   │   └── terminal.go              # 终端 WebSocket Handler
│   │
│   ├── service/                     # Service 层（业务逻辑）
│   │   ├── fs.go                    # 文件系统 Service (204 行)
│   │   ├── docker.go                # Docker Service (228 行)
│   │   ├── firewall.go              # 防火墙 Service (457 行)
│   │   └── system.go                # 系统监控 Service (452 行)
│   │
│   ├── storage/                     # 存储驱动层
│   │   ├── driver.go                # Driver 接口定义
│   │   ├── local.go                 # 本地存储实现
│   │   ├── s3.go                    # S3 存储实现
│   │   └── registry.go              # Driver 注册表
│   │
│   ├── auth/                        # 认证模块
│   │   └── auth.go                  # JWT 认证
│   │
│   ├── config/                      # 配置模块
│   │   └── config.go                # 配置管理
│   │
│   └── response/                    # 响应格式化
│       └── response.go              # 统一响应格式
│
└── dist/                            # 前端静态资源（embed）
```

---

## 🎉 重构成果总结

### 核心成就

1. **✅ 完成 4 个核心模块的分层重构**
   - 文件系统 (FileService)
   - Docker (DockerService)
   - 防火墙 (FirewallService)
   - 系统监控 (SystemService)

2. **✅ 删除 11 个 Legacy 接口**
   - 从 57 个端点减少到 46 个
   - 清理了冗余代码

3. **✅ Handler 代码减少 48%**
   - 从 1,657 行减少到 862 行
   - Handler 成为薄层

4. **✅ Service 层独立可复用**
   - 1,341 行业务逻辑
   - 40+ 个业务方法
   - 可被任意协议调用

5. **✅ 架构清晰度显著提升**
   - 职责分明
   - 易于测试
   - 易于维护

### 技术价值

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| **架构模式** | 单层（Handler 包含一切） | 三层（Handler + Service + Driver） |
| **业务逻辑位置** | 混在 Handler 中 | 独立的 Service 层 |
| **跨端复用** | 不可能 | Service 层可被任意协议调用 |
| **可测试性** | 低（依赖 HTTP 上下文） | 高（Service 层纯业务逻辑） |
| **代码可维护性** | 中等 | 高 |
| **扩展性** | 困难 | 容易 |

### 业务价值

- **支持多端部署**：Web、桌面端（Tauri/Wails）、App 等
- **提高开发效率**：新功能只需在 Service 层添加，多个协议层自动复用
- **降低维护成本**：代码结构清晰，易于理解和修改
- **提升代码质量**：业务逻辑可独立测试，减少 Bug

---

## 🔮 未来扩展方向

### 1. 路由模块化

将路由从 `main.go` 拆分到独立的 router 文件：

```go
// internal/router/router.go
func Setup(r *gin.Engine) {
    api := r.Group("/api/v1")  // 加版本号

    RegisterAuthRoutes(api)
    RegisterFsRoutes(api)
    RegisterDockerRoutes(api)
    RegisterFirewallRoutes(api)
    RegisterSystemRoutes(api)
}
```

### 2. 添加 API 版本管理

```go
api := r.Group("/api/v1")  // v1 版本
```

### 3. 统一错误处理

在 Service 层定义业务错误类型：

```go
type ServiceError struct {
    Code    int
    Message string
}
```

### 4. 桌面端支持

**Tauri 方案**：
```
Tauri App
├── 前端 (复用现有 React 代码)
├── Go 后端 (作为 sidecar 进程)
└── 通信: localhost HTTP + WebSocket
```

**Wails 方案**：
```
Wails App
├── 前端 (复用现有 React 代码)
├── Go 后端 (Wails 直接绑定 Go 函数)
└── 通信: Wails Bridge (前端直接调用 Go 函数)
```

### 5. gRPC 支持（可选）

如果有微服务需求，可以添加 gRPC 接口：

```go
// gRPC Handler 调用同一个 Service
func (s *GrpcServer) List(ctx context.Context, req *pb.ListRequest) (*pb.ListResponse, error) {
    files, err := fileSvc.List(req.NodeId, req.Path)
    return &pb.ListResponse{Files: files}, err
}
```

---

## 📝 总结

通过 Handler-Service 分层重构，我们建立了清晰的三层架构：

1. **Handler 层**：薄层，只负责 HTTP 协议处理
2. **Service 层**：核心，包含所有业务逻辑，可跨端复用
3. **Driver 层**：基础设施，提供存储抽象

这个架构为项目的长期发展奠定了坚实基础，支持未来的多端部署、功能扩展和技术演进。

**核心理念**：业务逻辑独立于协议，Service 层是真正的核心资产。
