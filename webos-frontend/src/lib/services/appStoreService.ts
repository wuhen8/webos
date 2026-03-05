import { request as wsRequest, registerReconnectHook } from '@/stores/webSocketStore'
import { useTaskStore } from '@/stores/taskStore'
import { syncInstalledApps } from './appSyncService'

// Installed apps change handlers (for dynamic dock sync)
const installedAppsHandlers = new Set<(apps: any[]) => void>()

// Listen for task completions related to app store via taskStore
useTaskStore.subscribe((state, prevState) => {
  for (const task of state.tasks) {
    const prev = prevState.tasks.find((t) => t.id === task.id)
    if (
      prev && prev.status === 'running' &&
      (task.status === 'success' || task.status === 'failed') &&
      (task.type === 'appstore_install' || task.type === 'appstore_uninstall' || task.type === 'appstore_update')
    ) {
      // Auto-refresh installed apps list after install/uninstall/update
      appStoreService.getInstalled().then((apps) => {
        for (const handler of installedAppsHandlers) {
          handler(apps || [])
        }
      }).catch(() => {})
      // Re-sync dynamic app registry
      syncInstalledApps().catch(() => {})
      break
    }
  }
})

// Re-sync on reconnect
registerReconnectHook(() => {
  appStoreService.getInstalled().then((apps) => {
    for (const handler of installedAppsHandlers) {
      handler(apps || [])
    }
  }).catch(() => {})
  // Also re-sync dynamic app registry
  syncInstalledApps().catch(() => {})
})

export const appStoreService = {
  getCatalog(refresh = false): Promise<any[]> {
    return wsRequest('appstore_catalog', { refresh })
  },

  getInstalled(): Promise<any[]> {
    return wsRequest('appstore_installed', {})
  },

  install(appId: string, appConfig: Record<string, any> = {}): Promise<void> {
    return wsRequest('appstore_install', { appId, appConfig })
  },

  uninstall(appId: string): Promise<void> {
    return wsRequest('appstore_uninstall', { appId })
  },

  start(appId: string): Promise<void> {
    return wsRequest('appstore_start', { appId })
  },

  stop(appId: string): Promise<void> {
    return wsRequest('appstore_stop', { appId })
  },

  update(appId: string): Promise<void> {
    return wsRequest('appstore_update', { appId })
  },

  updateConfig(appId: string, appConfig: Record<string, any>): Promise<void> {
    return wsRequest('appstore_update_config', { appId, appConfig })
  },

  getAppStatus(appId: string): Promise<any> {
    return wsRequest('appstore_app_status', { appId })
  },

  onInstalledAppsChanged(handler: (apps: any[]) => void): () => void {
    installedAppsHandlers.add(handler)
    return () => {
      installedAppsHandlers.delete(handler)
    }
  },

  // Skills marketplace
  getSkillsCatalog(refresh = false): Promise<any[]> {
    return wsRequest('skills_catalog', { refresh })
  },

  getInstalledSkills(): Promise<any[]> {
    return wsRequest('skills_installed', {})
  },

  installSkill(skillId: string, zipUrl: string): Promise<void> {
    return wsRequest('skills_install', { skillId, zipUrl })
  },

  uninstallSkill(skillId: string): Promise<void> {
    return wsRequest('skills_uninstall', { skillId })
  },
}
