import { request as wsRequest } from '@/stores/webSocketStore'
import type { AppConfig, FileAssociation } from '@/types'
import { getHostname } from '@/lib/env'
import { appStoreService } from './appStoreService'
import { invalidateFileAssociations } from '@/config/fileAssociationRegistry'

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

export async function syncInstalledApps(): Promise<void> {
  try {
    const apps = await appStoreService.getInstalled()

    for (const key of Object.keys(dynamicApps)) {
      delete dynamicApps[key]
    }

    if (!apps) {
      invalidateFileAssociations()
      return
    }

    let staticManifests: Record<string, any> = {}
    try {
      const manifests: any[] = await wsRequest('webapp_list', {})
      if (manifests) {
        for (const m of manifests) {
          staticManifests[m.id] = m
        }
      }
    } catch {}

    for (const app of apps) {
      if (app.status !== 'running' && app.status !== 'stopped') continue
      if (!app.appType) continue

      const dynId = 'dyn_' + app.id
      const manifest = app.manifest || {}

      const isSideload = app.appType === 'sideload'
      const hasWasm = !!manifest.wasmModule
      const isBackground = !!manifest.background
      const isBackgroundOnly = isSideload && (isBackground || (hasWasm && !staticManifests[app.id]?.name))

      let webviewUrl: string | undefined
      if (app.appType === 'docker' && manifest.accessMode === 'webview' && manifest.accessUrl) {
        webviewUrl = `http://${getHostname()}:${manifest.accessUrl}`
      }

      const iconName = isSideload && manifest.icon ? manifest.icon : 'PackageOpen'

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
        singleton: !fileAssociations,
        showInDock: false,
        dockOrder: 100 + apps.indexOf(app),
        menus: [],
        fileAssociations,
        openFile,
        _accessMode: manifest.accessMode,
        _accessUrl: manifest.accessUrl,
        _appStoreId: app.id,
        _appType: app.appType,
      } as AppConfig & Record<string, any>
    }

    invalidateFileAssociations()
  } catch {}
}
