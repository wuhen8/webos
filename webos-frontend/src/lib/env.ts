/**
 * 运行环境配置
 *
 * Web 端：自动从 window.location 推导，无需配置
 * App 端（Capacitor / Tauri）：调用 setServerUrl() 设置后端地址
 */

const ENV_STORAGE_KEY = 'fm_server_url'

let _serverUrl = ''

/** 获取后端 HTTP 基础地址，如 "https://example.com" 或 ""（同源） */
export function getServerUrl(): string {
  if (_serverUrl) return _serverUrl
  // 尝试从 localStorage 恢复（App 端持久化）
  const stored = localStorage.getItem(ENV_STORAGE_KEY)
  if (stored) {
    _serverUrl = stored.replace(/\/+$/, '')
    return _serverUrl
  }
  // Web 端：空字符串，走相对路径
  return ''
}

/** 设置后端地址（App 端登录前调用） */
export function setServerUrl(url: string) {
  _serverUrl = url.replace(/\/+$/, '')
  if (_serverUrl) {
    localStorage.setItem(ENV_STORAGE_KEY, _serverUrl)
  } else {
    localStorage.removeItem(ENV_STORAGE_KEY)
  }
}

/** 获取 API 基础路径，如 "https://example.com/api" 或 "/api" */
export function getApiBase(): string {
  return `${getServerUrl()}/api`
}

/** 获取 WebSocket 地址，如 "wss://example.com/api/ws" */
export function getWsBase(): string {
  const server = getServerUrl()
  if (server) {
    const url = new URL(server)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${url.host}/api/ws`
  }
  // Web 端：从当前页面推导
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

/** 获取完整的 origin，如 "https://example.com" 或当前 window.location.origin */
export function getOrigin(): string {
  return getServerUrl() || window.location.origin
}

/** 获取 hostname，如 "example.com" 或当前 window.location.hostname */
export function getHostname(): string {
  const server = getServerUrl()
  if (server) {
    return new URL(server).hostname
  }
  return window.location.hostname
}

/** 是否为触屏设备（检测一次，缓存结果） */
let _isTouch: boolean | null = null
export function isTouchDevice(): boolean {
  if (_isTouch === null) {
    _isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }
  return _isTouch
}
