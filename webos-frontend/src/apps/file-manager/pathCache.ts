import type { PathViewState } from '@/types'

export const PATH_CACHE_MAX = 50

/** 写入路径缓存，超出上限时淘汰最旧条目。纯函数。 */
export function setPathCache(
  cache: Record<string, PathViewState>,
  path: string,
  state: Omit<PathViewState, 'timestamp'>
): Record<string, PathViewState> {
  const newCache = { ...cache }
  newCache[path] = { ...state, timestamp: Date.now() }

  const keys = Object.keys(newCache)
  if (keys.length > PATH_CACHE_MAX) {
    let oldestKey = keys[0]
    let oldestTime = newCache[oldestKey].timestamp
    for (const k of keys) {
      if (newCache[k].timestamp < oldestTime) {
        oldestKey = k
        oldestTime = newCache[k].timestamp
      }
    }
    delete newCache[oldestKey]
  }

  return newCache
}

/** 读取路径缓存，命中时更新 timestamp（LRU touch）。 */
export function getPathCache(
  cache: Record<string, PathViewState>,
  path: string
): [PathViewState | null, Record<string, PathViewState>] {
  const entry = cache[path]
  if (!entry) return [null, cache]
  const updated = { ...cache, [path]: { ...entry, timestamp: Date.now() } }
  return [entry, updated]
}
