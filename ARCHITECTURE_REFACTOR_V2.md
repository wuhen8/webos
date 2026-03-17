# 架构重构 V2：按需订阅 + 引用计数

## 问题回顾

### V1 架构的问题
第一版架构在应用启动时订阅所有频道，导致：
- ❌ 资源浪费：用户没打开 Docker，后端一直轮询 Docker 数据
- ❌ 消息爆炸：所有频道同时推送，WebSocket 消息量巨大
- ❌ 性能问题：后端压力大，前端处理大量不需要的数据
- ❌ 违背按需加载原则：窗口管理系统应该按需加载

### 根本原因
WebOS 是模仿 macOS 的**窗口管理系统**，用户可以随时打开/关闭各种应用窗口。数据应该**按需加载**，而不是全部预加载。

---

## V2 架构：按需订阅 + 引用计数

### 核心设计

```
┌─────────────────────────────────────────────────────────────┐
│                    窗口生命周期                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              订阅管理器 (dataSync.ts)                        │
│  - 引用计数：多个窗口可能使用同一频道                        │
│  - 自动订阅：第一个窗口打开时订阅                            │
│  - 自动取消：最后一个窗口关闭时取消订阅                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              全局数据层 (dataStore.ts)                       │
│  - 数据缓存：窗口关闭后数据仍然保留                          │
│  - 自动同步：所有订阅者自动获得最新数据                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    组件层                                    │
│  - 使用 hooks 按需订阅                                       │
│  - 组件卸载时自动取消订阅                                    │
└─────────────────────────────────────────────────────────────┘
```

### 订阅类型

#### 1. 全局订阅（始终保持）
这些数据是全局性的，不依赖于特定窗口：
- `sub.storage_nodes` - 存储节点列表（文件管理器、存储设置都需要）
- `sub.sidebar` - 侧边栏配置（文件管理器需要）

```typescript
// App.tsx - 应用启动时初始化
useEffect(() => {
  if (wsConnected) {
    initGlobalSync()  // 只订阅全局频道
  } else {
    destroyGlobalSync()
  }
}, [wsConnected])
```

#### 2. 按需订阅（窗口打开时订阅）
这些数据只在特定窗口打开时才需要：
- `sub.docker_*` - Docker 相关数据（Docker 管理窗口）
- `sub.processes` - 进程列表（任务管理器窗口）
- `sub.disks` - 磁盘信息（磁盘管理器窗口）
- `sub.services` - 系统服务（服务管理器窗口）
- `sub.tasks` - 任务列表（任务管理器窗口）
- `sub.mounts` - ISO 挂载（文件管理器侧边栏）

```typescript
// DockerContent.tsx - 组件挂载时订阅
useEffect(() => {
  const store = useDataStore.getState()
  return subscribeChannel('sub.docker_containers', 2000, (data) => {
    store.setDockerContainers(data)
  })
}, [])
```

### 引用计数机制

```typescript
// 第一个 Docker 窗口打开
subscribeChannel('sub.docker_containers', 2000, handler)
// → 引用计数 = 1，创建 WebSocket 订阅

// 第二个 Docker 窗口打开
subscribeChannel('sub.docker_containers', 2000, handler)
// → 引用计数 = 2，复用现有订阅

// 第一个窗口关闭
unsubscribe()
// → 引用计数 = 1，保持订阅

// 第二个窗口关闭
unsubscribe()
// → 引用计数 = 0，取消 WebSocket 订阅
```

---

## 实现细节

### 1. 订阅管理器 (`dataSync.ts`)

```typescript
interface ChannelSubscription {
  refCount: number
  unsubscribe: () => void
}

const subscriptions = new Map<string, ChannelSubscription>()

export function subscribeChannel(
  channel: string,
  interval: number,
  handler: (data: any) => void
): () => void {
  const key = `${channel}:${interval}`
  let sub = subscriptions.get(key)

  if (!sub) {
    // 首次订阅，创建 WebSocket 订阅
    const ws = useWebSocketStore.getState()
    const wsUnsub = ws.subscribe(channel, interval, handler)
    sub = { refCount: 1, unsubscribe: wsUnsub }
    subscriptions.set(key, sub)
  } else {
    // 已有订阅，增加引用计数
    sub.refCount++
  }

  // 返回取消订阅函数
  return () => {
    const sub = subscriptions.get(key)
    if (!sub) return

    sub.refCount--
    if (sub.refCount <= 0) {
      // 引用计数归零，真正取消订阅
      sub.unsubscribe()
      subscriptions.delete(key)
    }
  }
}
```

### 2. 数据订阅 Hooks (`useDataSubscription.ts`)

简化组件使用，封装订阅逻辑：

```typescript
export function useDockerContainersData(interval = 2000) {
  const containers = useDataStore((s) => s.dockerContainers)
  const available = useDataStore((s) => s.dockerAvailable)
  const loading = useDataStore((s) => s.dockerContainersLoading)

  useEffect(() => {
    const store = useDataStore.getState()
    return subscribeChannel('sub.docker_containers', interval, (data) => {
      store.setDockerContainers(data)
    })
  }, [interval])

  return { containers, available, loading }
}
```

### 3. 组件使用

#### 方式 1：使用封装的 Hook（推荐）

```typescript
function TaskManagerContent() {
  const { overview } = useOverviewData()
  const { processes } = useProcessesData()

  // 组件卸载时自动取消订阅
  return <div>...</div>
}
```

#### 方式 2：直接使用 subscribeChannel

```typescript
function DockerContent() {
  const [activeTab, setActiveTab] = useState("compose")

  useEffect(() => {
    const store = useDataStore.getState()
    const unsubs: Array<() => void> = []

    // 容器数据（所有标签页都需要）
    unsubs.push(
      subscribeChannel('sub.docker_containers', 2000, (data) => {
        store.setDockerContainers(data)
      })
    )

    // 根据当前标签页订阅对应数据
    if (activeTab === "images") {
      unsubs.push(
        subscribeChannel('sub.docker_images', 5000, (data) => {
          store.setDockerImages(data)
        })
      )
    }

    return () => {
      unsubs.forEach(fn => fn())
    }
  }, [activeTab])

  return <div>...</div>
}
```

---

## 重构范围

### 新增文件
- `webos-frontend/src/lib/dataSync.ts` - 订阅管理器（重写）
- `webos-frontend/src/hooks/useDataSubscription.ts` - 数据订阅 Hooks
- `webos-frontend/src/stores/dataStore.ts` - 全局数据 store（保留）

### 修改文件
- `webos-frontend/src/App.tsx` - 只初始化全局订阅
- `webos-frontend/src/apps/docker/DockerContent.tsx` - 按需订阅 Docker 数据
- `webos-frontend/src/apps/file-manager/Sidebar.tsx` - 按需订阅 ISO 挂载
- `webos-frontend/src/apps/settings/components/StorageTab.tsx` - 从 store 读取（全局订阅）
- `webos-frontend/src/hooks/useSidebarConfig.ts` - 从 store 读取（全局订阅）

### 订阅策略

| 频道 | 订阅类型 | 使用场景 |
|------|---------|---------|
| `sub.storage_nodes` | 全局订阅 | 文件管理器、存储设置 |
| `sub.sidebar` | 全局订阅 | 文件管理器侧边栏 |
| `sub.overview` | 按需订阅 | 任务管理器、系统监控 |
| `sub.processes` | 按需订阅 | 任务管理器 |
| `sub.docker_*` | 按需订阅 | Docker 管理 |
| `sub.disks` | 按需订阅 | 磁盘管理器 |
| `sub.services` | 按需订阅 | 服务管理器 |
| `sub.tasks` | 按需订阅 | 任务管理器 |
| `sub.mounts` | 按需订阅 | 文件管理器侧边栏 |

---

## 优势

### 1. 解决原始问题
- ✅ 无论打开顺序如何，所有窗口都能正常显示
- ✅ 每个频道只订阅一次（引用计数管理）
- ✅ 所有组件自动获得最新数据

### 2. 按需加载
- ✅ 只订阅当前需要的数据
- ✅ 窗口关闭时自动取消订阅
- ✅ 减少网络流量和后端压力

### 3. 性能优化
- ✅ 避免不必要的数据轮询
- ✅ 减少 WebSocket 消息量
- ✅ 降低前端内存占用

### 4. 架构优势
- ✅ 单一数据源：所有数据来自 dataStore
- ✅ 关注点分离：组件只负责展示
- ✅ 易于调试：数据流清晰
- ✅ 易于扩展：添加新频道只需创建新 Hook

---

## 使用示例

### 场景 1：用户打开 Docker 管理

```
1. DockerContent 组件挂载
2. useEffect 调用 subscribeChannel('sub.docker_containers', 2000, ...)
3. 订阅管理器创建 WebSocket 订阅（引用计数 = 1）
4. 后端开始轮询 Docker 数据并推送
5. 数据更新到 dataStore
6. 组件自动重新渲染
```

### 场景 2：用户打开第二个 Docker 窗口

```
1. 第二个 DockerContent 组件挂载
2. useEffect 调用 subscribeChannel('sub.docker_containers', 2000, ...)
3. 订阅管理器发现已有订阅，引用计数 +1（引用计数 = 2）
4. 复用现有 WebSocket 订阅，不创建新订阅
5. 两个窗口共享同一份数据
```

### 场景 3：用户关闭第一个 Docker 窗口

```
1. 第一个 DockerContent 组件卸载
2. useEffect 返回的清理函数执行
3. 订阅管理器引用计数 -1（引用计数 = 1）
4. 保持 WebSocket 订阅（因为还有一个窗口在使用）
```

### 场景 4：用户关闭最后一个 Docker 窗口

```
1. 最后一个 DockerContent 组件卸载
2. useEffect 返回的清理函数执行
3. 订阅管理器引用计数 -1（引用计数 = 0）
4. 取消 WebSocket 订阅
5. 后端停止轮询 Docker 数据
6. 数据仍然保留在 dataStore（缓存）
```

---

## 测试建议

### 功能测试
1. ✅ 同时打开文件管理器和存储设置 → 都能正常显示
2. ✅ 打开 Docker 管理 → 开始接收 Docker 数据
3. ✅ 关闭 Docker 管理 → 停止接收 Docker 数据
4. ✅ 打开多个 Docker 窗口 → 共享同一份数据
5. ✅ 切换 Docker 标签页 → 按需订阅对应数据

### 性能测试
1. ✅ 检查 WebSocket 订阅数量（应该等于打开的窗口需要的频道数）
2. ✅ 检查网络流量（关闭窗口后应该停止推送）
3. ✅ 检查后端 CPU 占用（关闭窗口后应该降低）

### 调试方法
打开浏览器控制台，查看日志：
```
[DataSync] Subscribed to sub.docker_containers (interval: 2000ms)
[DataSync] Ref count for sub.docker_containers increased to 2
[DataSync] Ref count for sub.docker_containers decreased to 1
[DataSync] Unsubscribed from sub.docker_containers
```

---

## 未来优化

### 1. 智能预加载
预测用户可能打开的窗口，提前订阅数据：
```typescript
// 用户打开文件管理器，预加载 ISO 挂载数据
// 用户打开系统监控，预加载进程列表
```

### 2. 数据过期策略
窗口关闭后，数据在 store 中保留一段时间：
```typescript
// 5分钟后清理未使用的数据
setTimeout(() => {
  if (refCount === 0) {
    store.clearDockerData()
  }
}, 5 * 60 * 1000)
```

### 3. 离线缓存
将常用数据持久化到 localStorage：
```typescript
// 存储节点列表、侧边栏配置等
localStorage.setItem('cache:storage_nodes', JSON.stringify(data))
```

---

## 总结

V2 架构通过**按需订阅 + 引用计数**，实现了：
- ✅ 解决多组件订阅竞争问题
- ✅ 按需加载，避免资源浪费
- ✅ 自动管理订阅生命周期
- ✅ 清晰的数据流和架构

这是真正适合**窗口管理系统**的架构设计！🎉
