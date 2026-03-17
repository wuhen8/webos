import { useWebSocketStore } from '@/stores/webSocketStore'
import { useDataStore } from '@/stores/dataStore'

/**
 * 数据同步管理器（按需订阅版本）
 *
 * 设计原则：
 * 1. 按需订阅：只有当组件需要数据时才订阅频道
 * 2. 引用计数：多个组件可能使用同一频道，使用引用计数管理
 * 3. 自动清理：当引用计数归零时，自动取消订阅
 * 4. 数据缓存：数据存储在全局 store，组件卸载后数据仍然保留
 *
 * 使用方式：
 * ```typescript
 * useEffect(() => {
 *   return subscribeChannel('sub.docker_containers', 2000, (data) => {
 *     useDataStore.getState().setDockerContainers(data)
 *   })
 * }, [])
 * ```
 */

interface ChannelSubscription {
  refCount: number
  unsubscribe: () => void
}

const subscriptions = new Map<string, ChannelSubscription>()

/**
 * 订阅频道（带引用计数）
 *
 * @param channel 频道名称
 * @param interval 轮询间隔（毫秒），0 表示 Event 模式
 * @param handler 数据处理函数
 * @returns 取消订阅函数
 */
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

    sub = {
      refCount: 1,
      unsubscribe: wsUnsub,
    }
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

/**
 * 全局频道订阅（始终保持订阅）
 *
 * 这些频道的数据是全局性的，不依赖于特定窗口：
 * - sub.storage_nodes: 存储节点列表（文件管理器、存储设置都需要）
 * - sub.sidebar: 侧边栏配置（文件管理器需要）
 */
const globalUnsubscribers: Array<() => void> = []

export function initGlobalSync() {
  const ws = useWebSocketStore.getState()
  const store = useDataStore.getState()

  // 存储节点（Event 模式）
  globalUnsubscribers.push(
    ws.subscribe('sub.storage_nodes', 0, (data: any) => {
      if (Array.isArray(data)) {
        store.setStorageNodes(data)
      }
    })
  )

  // 侧边栏配置（Event 模式）
  globalUnsubscribers.push(
    ws.subscribe('sub.sidebar', 0, (data: any) => {
      if (Array.isArray(data)) {
        store.setSidebarItems(data)
      }
    })
  )
}

export function destroyGlobalSync() {
  for (const unsub of globalUnsubscribers) {
    unsub()
  }
  globalUnsubscribers.length = 0
}

/**
 * 清理所有订阅（用于调试）
 */
export function clearAllSubscriptions() {
  for (const [, sub] of subscriptions) {
    sub.unsubscribe()
  }
  subscriptions.clear()

  destroyGlobalSync()
}
