import {
  Folder,
  FileCode,
  Settings,
  Monitor,
  TerminalSquare,
  Activity,
  Container,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Download,
  Upload,
  Copy,
  Scissors,
  ClipboardCopy,
  Edit2,
  Trash2,
  RefreshCw,
  Star,
  LogOut,
  Minus,
  Square,
  Globe,
  Music,
  Link,
  PackageOpen,
  HardDrive,
  Shield,
  AppWindow,
  BookOpen,
  Image,
  Film,
  Rocket,
  Bot,
  Share2,
  Eye,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppConfig, ContextMenuConfig, FileAssociation } from '@/types'
import { getHostname } from '@/lib/env'
import { request as wsRequest } from '@/stores/webSocketStore'

// 图标映射表
export const iconMap: Record<string, LucideIcon> = {
  Folder,
  FileCode,
  Settings,
  Monitor,
  TerminalSquare,
  Activity,
  Container,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Download,
  Upload,
  Copy,
  Scissors,
  ClipboardCopy,
  Edit2,
  Trash2,
  RefreshCw,
  Star,
  LogOut,
  Minus,
  Square,
  Globe,
  Music,
  Link,
  PackageOpen,
  HardDrive,
  Shield,
  AppWindow,
  BookOpen,
  Image,
  Film,
  Rocket,
  Bot,
  Share2,
  Eye,
}

// 解析图标：string → LucideIcon
export function resolveIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Monitor
}

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

const dynamicApps: Record<string, AppConfig> = {}

export function registerDynamicApp(config: AppConfig) {
  dynamicApps[config.id] = config
}

export function unregisterDynamicApp(appId: string) {
  delete dynamicApps[appId]
}

export function getDynamicApps(): Record<string, AppConfig> {
  return dynamicApps
}

// Sync installed apps from backend into dynamicApps registry
export async function syncInstalledApps(): Promise<void> {
  try {
    const { appStoreService } = await import('@/lib/services/appStoreService')
    const { invalidateFileAssociations } = await import('@/config/fileAssociationRegistry')
    const apps = await appStoreService.getInstalled()
    // Clear existing dynamic apps
    for (const key of Object.keys(dynamicApps)) {
      delete dynamicApps[key]
    }
    if (!apps) {
      invalidateFileAssociations()
      return
    }

    // Fetch static app manifests for file associations
    let staticManifests: Record<string, any> = {}
    try {
      const manifests: any[] = await wsRequest('webapp_list', {})
      if (manifests) {
        for (const m of manifests) {
          staticManifests[m.id] = m
        }
      }
    } catch {
      // ignore
    }

    for (const app of apps) {
      if (app.status !== 'running' && app.status !== 'stopped') continue
      // 跳过没有界面的后台应用（如 wasm bot）
      if (!app.appType) continue
      const dynId = 'dyn_' + app.id
      const manifest = app.manifest || {}

      // Skip background-only sideload apps (no frontend, e.g. telegram bot)
      const isSideload = app.appType === 'sideload'
      const hasWasm = !!manifest.wasmModule
      const isBackgroundOnly = isSideload && hasWasm && !staticManifests[app.id]?.name

      // Build full URL for docker webview apps
      let webviewUrl: string | undefined
      if (app.appType === 'docker' && manifest.accessMode === 'webview' && manifest.accessUrl) {
        webviewUrl = `http://${getHostname()}:${manifest.accessUrl}`
      }

      // Resolve icon
      const iconName = isSideload && manifest.icon ? manifest.icon : 'PackageOpen'

      // Build file associations for sideload apps
      let fileAssociations: FileAssociation[] | undefined
      let openFile: AppConfig['openFile'] | undefined

      if (isSideload) {
        const diskManifest = staticManifests[app.id]
        if (diskManifest?.fileAssociations?.length) {
          fileAssociations = diskManifest.fileAssociations
          const staticAppId = app.id
          openFile = async (file, ctx) => {
            const nodeId = file.nodeId || 'local'
            const fileData = {
              name: file.name,
              path: file.path,
              nodeId,
              size: file.size,
              extension: file.extension,
            }

            const winSize = diskManifest.defaultSize?.width
              ? { width: diskManifest.defaultSize.width, height: diskManifest.defaultSize.height }
              : { width: 900, height: 600 }

            ctx.createWindow({
              type: 'static-app',
              appId: dynId,
              title: file.name,
              size: winSize,
              appData: { staticAppId, file: fileData },
            })
            return { ok: true }
          }
        }
      }

      // Skip background-only apps that have no disk manifest (pure wasm bots)
      if (isBackgroundOnly) continue

      dynamicApps[dynId] = {
        id: dynId,
        name: manifest.name || app.id,
        icon: iconName,
        ...(webviewUrl && { url: webviewUrl }),
        ...(isSideload && {
          windowType: 'static-app',
          defaultAppData: () => ({ staticAppId: app.id }),
        }),
        gradient: isSideload ? 'from-blue-400 to-blue-600' : 'from-emerald-400 to-emerald-600',
        shadow: isSideload ? 'shadow-blue-500/30' : 'shadow-emerald-500/30',
        defaultSize: { width: 900, height: 600 },
        singleton: !fileAssociations, // non-singleton if it handles files
        showInDock: false,
        dockOrder: 100 + apps.indexOf(app),
        menus: [],
        fileAssociations,
        openFile,
        // Store extra metadata for open behavior
        _accessMode: manifest.accessMode,
        _accessUrl: manifest.accessUrl,
        _appStoreId: app.id,
        _appType: app.appType,
      } as AppConfig & Record<string, any>
    }

    // Invalidate file association cache so it picks up new dynamic apps
    invalidateFileAssociations()
  } catch {
    // silently fail
  }
}

// 从后端加载用户覆盖值
export async function loadAppOverrides(): Promise<void> {
  try {
    appOverrides = await wsRequest('app_overrides_get', {}) || {}
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
    await wsRequest('app_override_save', { id: appId, overrides: merged })
  } catch {
    // 静默失败，本地缓存已更新
  }
}

// 删除单个应用的覆盖值（恢复默认）
export async function deleteAppOverride(appId: string): Promise<void> {
  delete appOverrides[appId]
  try {
    await wsRequest('app_override_delete', { id: appId })
  } catch {
    // 静默失败
  }
}

// 获取 merge 后的应用配置（manifest 默认值 + 用户覆盖值）
function getMergedConfig(app: AppConfig): AppConfig {
  const override = appOverrides[app.id]
  if (!override) return app
  return { ...app, ...override, id: app.id } // id 不可覆盖
}

// Get dock items sorted by dockOrder (merge 后, including dynamic apps)
export const getDockItems = () => {
  const staticApps = Object.values(appRegistry).map(getMergedConfig)
  const dynApps = Object.values(dynamicApps).map(getMergedConfig)
  return [...staticApps, ...dynApps]
    .filter((app) => app.showInDock)
    .sort((a, b) => a.dockOrder - b.dockOrder)
}

// Get all visible apps (for launchpad and "add to dock" menu)
export const getAllApps = () => {
  const staticApps = Object.values(appRegistry).map(getMergedConfig)
  const dynApps = Object.values(dynamicApps).map(getMergedConfig)
  return [...staticApps, ...dynApps].filter((app) => !app.hidden)
}

// Get app config by id, with fallback to fileManager
export const getAppConfig = (appId: string): AppConfig => {
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
