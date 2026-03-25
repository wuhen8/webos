import type { AppConfig, ContextMenuConfig, MenuConfig, MenuItemConfig } from '@/types'
import { resolveI18nText } from '@/i18n/resolve'
import { request as wsRequest } from '@/stores/webSocketStore'
export { iconMap, resolveIcon } from '@/lib/iconResolver'


// 自动收集所有 apps/*/manifest.ts
const manifestModules = import.meta.glob('../apps/*/manifest.ts', { eager: true })

const appRegistry: Record<string, AppConfig> = {}

for (const [, mod] of Object.entries(manifestModules)) {
  const { manifest } = mod as { manifest: AppConfig }
  appRegistry[manifest.id] = manifest
}

// ==================== App Overrides ====================

// 用户覆盖值缓存：appId → { showInDock, dockOrder, ... }
let appOverrides: Record<string, Record<string, any>> = {}

// ==================== Dynamic Apps (installed from app store) ====================

import { getDynamicApps as _getDynamicApps } from '@/lib/services/appSyncService'
export { registerDynamicApp, unregisterDynamicApp, getDynamicApps, syncInstalledApps } from '@/lib/services/appSyncService'

// 从后端加载用户覆盖值
export async function loadAppOverrides(): Promise<void> {
  try {
    appOverrides = await wsRequest('settings.app_overrides_get', {}) || {}
  } catch {
    appOverrides = {}
  }
}

// 保存单个应用的覆盖值
export async function saveAppOverride(appId: string, overrides: Record<string, any>): Promise<void> {
  // 合并已有覆盖值
  const merged = { ...(appOverrides[appId] || {}), ...overrides }
  appOverrides[appId] = merged
  try {
    await wsRequest('settings.app_override_save', { id: appId, overrides: merged })
  } catch {
    // 静默失败，本地缓存已更新
  }
}

// 删除单个应用的覆盖值（恢复默认）
export async function deleteAppOverride(appId: string): Promise<void> {
  delete appOverrides[appId]
  try {
    await wsRequest('settings.app_override_delete', { id: appId })
  } catch {
    // 静默失败
  }
}

function localizeMenuItem(item: MenuItemConfig): MenuItemConfig {
  return {
    ...item,
    label: resolveI18nText(item.label),
  }
}

function localizeMenu(menu: MenuConfig): MenuConfig {
  return {
    ...menu,
    label: resolveI18nText(menu.label),
    items: menu.items.map(localizeMenuItem),
  }
}

function localizeAppConfig(app: AppConfig): AppConfig {
  return {
    ...app,
    name: resolveI18nText(app.name),
    menus: app.menus.map(localizeMenu),
  }
}

// 获取 merge 后的应用配置（manifest 默认值 + 用户覆盖值）
function getMergedConfig(app: AppConfig): AppConfig {
  const override = appOverrides[app.id]
  const merged = override ? { ...app, ...override, id: app.id } : app
  return localizeAppConfig(merged)
}

// Get dock items sorted by dockOrder (merge 后, including dynamic apps)
export const getDockItems = () => {
  const staticApps = Object.values(appRegistry).map(getMergedConfig)
  const dynApps = Object.values(_getDynamicApps()).map(getMergedConfig)
  return [...staticApps, ...dynApps]
    .filter((app) => app.showInDock)
    .sort((a, b) => a.dockOrder - b.dockOrder)
}

// Get all visible apps (for launchpad and "add to dock" menu)
export const getAllApps = () => {
  const staticApps = Object.values(appRegistry).map(getMergedConfig)
  const dynApps = Object.values(_getDynamicApps()).map(getMergedConfig)
  return [...staticApps, ...dynApps].filter((app) => !app.hidden)
}

// Get app config by id, with fallback to fileManager
export const getAppConfig = (appId: string): AppConfig => {
  const dynamicApps = _getDynamicApps()
  const app = appRegistry[appId] || dynamicApps[appId] || appRegistry.fileManager
  return getMergedConfig(app)
}

// 获取应用注册的右键菜单配置
export function getContextMenu(appId: string, menuKey: string): ContextMenuConfig {
  const config = getAppConfig(appId)
  const menu = config.contextMenus?.[menuKey]
  if (!menu) {
    console.warn(`[appRegistry] No context menu "${menuKey}" for app "${appId}"`)
    return { id: menuKey, items: [] }
  }
  return menu
}

export { appRegistry }
