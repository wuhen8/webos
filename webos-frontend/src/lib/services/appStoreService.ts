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
      (task.type === 'appstore.install' || task.type === 'appstore.uninstall' || task.type === 'appstore.update')
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
    return wsRequest('appstore.catalog', { refresh })
  },

  getInstalled(): Promise<any[]> {
    return wsRequest('appstore.installed', {})
  },

  install(appId: string, appConfig: Record<string, any> = {}): Promise<void> {
    return wsRequest('appstore.install', { appId, appConfig })
  },

  uninstall(appId: string): Promise<void> {
    return wsRequest('appstore.uninstall', { appId })
  },

  start(appId: string): Promise<void> {
    return wsRequest('appstore.start', { appId })
  },

  stop(appId: string): Promise<void> {
    return wsRequest('appstore.stop', { appId })
  },

  update(appId: string): Promise<void> {
    return wsRequest('appstore.update', { appId })
  },

  updateConfig(appId: string, appConfig: Record<string, any>): Promise<void> {
    return wsRequest('appstore.update_config', { appId, appConfig })
  },

  setAutostart(appId: string, enabled: boolean): Promise<void> {
    return wsRequest('appstore.set_autostart', { appId, enabled })
  },

  getAppStatus(appId: string): Promise<any> {
    return wsRequest('appstore.app_status', { appId })
  },

  onInstalledAppsChanged(handler: (apps: any[]) => void): () => void {
    installedAppsHandlers.add(handler)
    return () => {
      installedAppsHandlers.delete(handler)
    }
  },

  // Skills marketplace
  getSkillsCatalog(refresh = false): Promise<any[]> {
    return wsRequest('skills.catalog', { refresh })
  },

  getInstalledSkills(): Promise<any[]> {
    return wsRequest('skills.installed', {})
  },

  installSkill(skillId: string, zipUrl: string): Promise<void> {
    return wsRequest('skills.install', { skillId, zipUrl })
  },

  uninstallSkill(skillId: string): Promise<void> {
    return wsRequest('skills.uninstall', { skillId })
  },
}
