import i18n from '@/i18n'
import { appRegistry, getDynamicApps } from './appRegistry'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AppConfig, ContextMenuEntry } from '@/types'

// 系统默认打开方式表（扩展名 → appId）
const SYSTEM_DEFAULTS: Record<string, string> = {
  // 图片
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.svg': 'image', '.webp': 'image', '.bmp': 'image', '.ico': 'image',
  // 视频
  '.mp4': 'video', '.avi': 'video', '.mov': 'video', '.wmv': 'video',
  '.flv': 'video', '.webm': 'video', '.mkv': 'video', '.m4v': 'video',
  '.3gp': 'video', '.ogv': 'video', '.m3u8': 'video', '.ts': 'video',
  '.vlist': 'video', '.m3u': 'video',
  // 音频
  '.mp3': 'musicPlayer', '.wav': 'musicPlayer', '.ogg': 'musicPlayer',
  '.flac': 'musicPlayer', '.aac': 'musicPlayer', '.m4a': 'musicPlayer',
  '.wma': 'musicPlayer', '.opus': 'musicPlayer',
  // Markdown
  '.md': 'markdown', '.markdown': 'markdown', '.mdown': 'markdown', '.mkd': 'markdown',
  // HTML
  '.html': 'webview', '.htm': 'webview',
}

// 扩展名 → 所有能打开的 appId[] 映射（缓存）
const extToAppsMap = new Map<string, string[]>()
// 所有声明了 fileAssociations 的 app 列表（缓存）
let fileCapableApps: { appId: string; config: AppConfig }[] | null = null

function ensureBuilt() {
  if (fileCapableApps !== null) return

  fileCapableApps = []

  // Scan both static registry and dynamic apps
  // Dynamic apps (installed from app store) take priority over built-in apps
  const allApps: Record<string, AppConfig> = {
    ...getDynamicApps(),
    ...appRegistry,
  }

  for (const [appId, config] of Object.entries(allApps)) {
    if (!config.fileAssociations || config.fileAssociations.length === 0) continue
    fileCapableApps.push({ appId, config })

    for (const assoc of config.fileAssociations) {
      for (const ext of assoc.extensions) {
        const lower = ext.toLowerCase()

        // 构建 extToAppsMap（能力映射）
        if (!extToAppsMap.has(lower)) {
          extToAppsMap.set(lower, [])
        }
        const list = extToAppsMap.get(lower)!
        if (!list.includes(appId)) {
          list.push(appId)
        }
      }
    }
  }
}

/** 清除缓存，下次访问时重新构建（动态应用变更后调用） */
export function invalidateFileAssociations() {
  fileCapableApps = null
  extToAppsMap.clear()
}

/**
 * 获取扩展名的默认打开 app
 * 优先级：用户设置 → 系统默认表 → 第一个能打开的 app → editor fallback
 */
export function getDefaultAppForExtension(ext: string): string {
  ensureBuilt()
  const lower = ext.toLowerCase()
  const capable = extToAppsMap.get(lower) || []

  // 1. 用户设置
  const userDefault = useSettingsStore.getState().fileDefaultApps[lower]
  if (userDefault && capable.includes(userDefault)) {
    return userDefault
  }

  // 2. 系统默认表
  const sysDefault = SYSTEM_DEFAULTS[lower]
  if (sysDefault && capable.includes(sysDefault)) {
    return sysDefault
  }

  // 3. 第一个能打开的 app
  if (capable.length > 0) {
    return capable[0]
  }

  // 4. fallback
  return 'editor'
}

/** 获取所有能打开该扩展名的 appId 列表 */
export function getAppsForExtension(ext: string): string[] {
  ensureBuilt()
  return extToAppsMap.get(ext.toLowerCase()) || []
}

/** 获取所有声明了 fileAssociations 的 app */
export function getAllFileCapableApps(): { appId: string; config: AppConfig }[] {
  ensureBuilt()
  return fileCapableApps!
}

/** 动态生成"打开方式"子菜单项 */
export function buildOpenWithMenuItems(ext?: string): ContextMenuEntry[] {
  ensureBuilt()

  // 决定显示哪些 app
  let apps: { appId: string; config: AppConfig }[]
  if (ext) {
    const lower = ext.toLowerCase()
    const capableIds = extToAppsMap.get(lower) || []
    apps = fileCapableApps!.filter(a => capableIds.includes(a.appId))
  } else {
    apps = fileCapableApps!
  }

  const currentDefault = ext ? getDefaultAppForExtension(ext) : null

  const items: ContextMenuEntry[] = apps.map(({ appId, config }) => {
    const assoc = config.fileAssociations?.[0]
    const isCurrentDefault = appId === currentDefault
    return {
      id: `open-with-${appId}`,
      label: (assoc?.label || config.name) + (isCurrentDefault ? i18n.t('apps.fileManager.openWith.defaultSuffix') : ''),
      icon: assoc?.icon || config.icon,
      action: `fm.openWith.${appId}`,
    }
  })

  // 添加"其他..."选项
  if (ext && apps.length > 0) {
    items.push({ id: 'open-with-divider', type: 'divider' })
    items.push({
      id: 'open-with-more',
      label: i18n.t('apps.fileManager.openWith.moreApps'),
      icon: 'Settings',
      action: 'fm.openWithDialog',
    })
  }

  return items
}
