# 架构重构：全局数据管理层

## 问题背景

### 原始问题
用户报告：打开文件管理器后，存储设置里的存储节点无法正常显示；先打开存储节点，再打开文件管理器，S3存储无法显示。

### 根本原因
前端的 WebSocket 订阅机制存在设计缺陷：

1. **订阅去重优化**：为了避免多个组件重复订阅同一频道（如 CPU、内存等轮询数据），前端实现了订阅去重
2. **Event 模式频道的特性**：后端的 Event 模式频道（如 `sub.storage_nodes`）在订阅时会立即推送一次当前数据
3. **冲突**：当第二个组件订阅同一个 Event 频道时，因为频道已存在，前端不会发送新的订阅请求，导致第二个组件的 handler 从未收到数据

```typescript
// 旧的订阅逻辑
if (isNewChannel || needsUpdate) {
  request('sub.subscribe', { channel, interval }).catch(() => {})
}
// 第二个组件订阅时，isNewChannel = false，不会发送请求
// 后端不知道有新订阅者，不会推送数据
```

## 架构设计

### 新架构：三层数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        应用启动                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              数据同步层 (dataSync.ts)                        │
│  - 单一订阅点：每个频道只订阅一次                            │
│  - 在 WebSocket 连接时初始化                                 │
│  - 接收所有 WebSocket 推送                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              全局数据层 (dataStore.ts)                       │
│  - Zustand store，存储所有订阅数据                           │
│  - 自动通知所有订阅组件                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    组件层                                    │
│  - 从 dataStore 读取数据                                     │
│  - 不直接管理 WebSocket 订阅                                 │
│  - 自动响应数据更新                                          │
└─────────────────────────────────────────────────────────────┘
```

### 旧架构 vs 新架构

#### 旧架构（组件直接订阅）
```typescript
// StorageTab.tsx
useEffect(() => {
  return subscribe("sub.storage_nodes", 0, (data) => {
    setStorageNodes(data)
  })
}, [subscribe])

// Sidebar.tsx
useEffect(() => {
  return subscribe("sub.storage_nodes", 0, (data) => {
    setStorageNodes(data)
  })
}, [subscribe])

// 问题：第二个组件订阅时收不到数据
```

#### 新架构（全局数据层）
```typescript
// dataSync.ts（应用启动时初始化，只订阅一次）
ws.subscribe('sub.storage_nodes', 0, (data) => {
  useDataStore.getState().setStorageNodes(data)
})

// StorageTab.tsx（只读取数据）
const storageNodes = useDataStore((s) => s.storageNodes)
const loading = useDataStore((s) => s.storageNodesLoading)

// Sidebar.tsx（只读取数据）
const storageNodes = useDataStore((s) => s.storageNodes)

// 优势：所有组件自动获得最新数据
```

## 实现细节

### 1. 全局数据 Store (`dataStore.ts`)

```typescript
interface DataState {
  // 数据
  storageNodes: StorageNodeConfig[]
  storageNodesLoading: boolean

  // Actions
  setStorageNodes: (nodes: StorageNodeConfig[]) => void
}

export const useDataStore = create<DataState>((set) => ({
  storageNodes: [],
  storageNodesLoading: true,
  setStorageNodes: (nodes) => set({
    storageNodes: nodes,
    storageNodesLoading: false
  }),
}))
```

### 2. 数据同步层 (`dataSync.ts`)

```typescript
export function initDataSync() {
  const ws = useWebSocketStore.getState()
  const store = useDataStore.getState()

  // Event 模式频道
  ws.subscribe('sub.storage_nodes', 0, (data) => {
    if (Array.isArray(data)) {
      store.setStorageNodes(data)
    }
  })

  // Poll 模式频道
  ws.subscribe('sub.overview', 2000, (data) => {
    store.setOverview(data)
  })

  // ... 其他频道
}
```

### 3. 应用初始化 (`App.tsx`)

```typescript
useEffect(() => {
  if (wsConnected) {
    initDataSync()
  } else {
    destroyDataSync()
  }
}, [wsConnected])
```

### 4. 组件使用

```typescript
// 旧代码（需要管理订阅）
const [storageNodes, setStorageNodes] = useState([])
const [loading, setLoading] = useState(true)
const subscribe = useWebSocketStore((s) => s.subscribe)

useEffect(() => {
  return subscribe("sub.storage_nodes", 0, (data) => {
    setStorageNodes(data)
    setLoading(false)
  })
}, [subscribe])

// 新代码（只读取数据）
const storageNodes = useDataStore((s) => s.storageNodes)
const loading = useDataStore((s) => s.storageNodesLoading)
```

## 重构范围

### 新增文件
- `webos-frontend/src/stores/dataStore.ts` - 全局数据 store
- `webos-frontend/src/lib/dataSync.ts` - 数据同步层

### 修改文件
- `webos-frontend/src/App.tsx` - 初始化数据同步
- `webos-frontend/src/apps/settings/components/StorageTab.tsx` - 从 store 读取
- `webos-frontend/src/apps/file-manager/Sidebar.tsx` - 从 store 读取
- `webos-frontend/src/apps/docker/DockerContent.tsx` - 从 store 读取
- `webos-frontend/src/hooks/useSidebarConfig.ts` - 从 store 读取

### 订阅的频道
数据同步层统一管理以下频道：

**Event 模式**（数据变化时推送）：
- `sub.storage_nodes` - 存储节点列表
- `sub.sidebar` - 侧边栏配置

**Poll 模式**（定时轮询）：
- `sub.overview` - 系统概览（2秒）
- `sub.processes` - 进程列表（2秒）
- `sub.docker_containers` - Docker 容器（2秒）
- `sub.docker_images` - Docker 镜像（5秒）
- `sub.docker_compose` - Docker Compose（5秒）
- `sub.docker_networks` - Docker 网络（5秒）
- `sub.docker_volumes` - Docker 卷（5秒）
- `sub.disks` - 磁盘信息（5秒）
- `sub.services` - 系统服务（5秒）
- `sub.tasks` - 任务列表（2秒）
- `sub.mounts` - ISO 挂载（3秒）

## 优势

### 1. 解决原始问题
- ✅ 每个频道只订阅一次，避免订阅去重导致的数据丢失
- ✅ 所有组件自动获得最新数据
- ✅ 无论打开顺序如何，所有窗口都能正常显示

### 2. 架构优势
- **单一数据源**：所有数据来自 dataStore，避免状态不一致
- **关注点分离**：组件只负责展示，不管理订阅
- **易于调试**：数据流清晰，可以在 Redux DevTools 中查看
- **性能优化**：避免重复订阅，减少网络请求
- **代码简化**：组件代码更简洁，减少样板代码

### 3. 可维护性
- **统一管理**：所有订阅在一个地方，易于维护
- **类型安全**：TypeScript 类型检查
- **易于扩展**：添加新频道只需在 dataSync 中添加一行

## 测试建议

### 功能测试
1. 同时打开文件管理器和存储设置，验证两个窗口都能正常显示存储节点
2. 先打开文件管理器，再打开存储设置，验证存储设置能正常显示
3. 先打开存储设置，再打开文件管理器，验证文件管理器能正常显示
4. 在存储设置中添加/修改/删除节点，验证文件管理器自动更新
5. 打开多个文件管理器窗口，验证都能正常显示

### 性能测试
1. 检查 WebSocket 订阅数量（应该每个频道只有一个订阅）
2. 检查网络请求（不应该有重复的订阅请求）
3. 检查内存占用（dataStore 的内存占用应该很小）

### 回归测试
1. Docker 管理界面的所有功能
2. 系统监控界面的所有功能
3. 任务管理器的所有功能
4. 侧边栏的收藏功能

## 未来优化方向

### 1. 按需订阅
当前实现是在应用启动时订阅所有频道。可以优化为：
- 只订阅当前需要的频道
- 当没有组件使用某个频道时，自动取消订阅

### 2. 数据持久化
可以将部分数据持久化到 localStorage：
- 存储节点列表
- 侧边栏配置
- 用户偏好设置

### 3. 离线支持
当 WebSocket 断开时：
- 使用缓存数据
- 显示离线状态
- 重连后自动同步

### 4. 数据预加载
在登录后立即加载常用数据：
- 存储节点列表
- 系统概览
- 减少首次打开窗口的等待时间

## 总结

这次重构从根本上解决了多组件订阅的竞争问题，通过引入全局数据管理层，实现了：
- **单一订阅点**：每个频道只订阅一次
- **自动同步**：所有组件自动获得最新数据
- **清晰架构**：数据流清晰，易于维护

这是一个**架构层面的解决方案**，而不是打补丁。它不仅解决了当前问题，还为未来的功能扩展奠定了良好的基础。
