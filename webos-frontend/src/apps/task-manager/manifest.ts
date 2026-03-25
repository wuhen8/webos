import i18n from '@/i18n'
import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'taskManager',
  name: 'i18n:apps.taskManager.name',
  icon: 'Activity',
  gradient: 'from-orange-400 to-orange-600',
  shadow: 'shadow-orange-500/30',
  defaultSize: { width: 960, height: 640 },
  defaultPosition: { xOffset: 80, yOffset: 60 },
  singleton: true,
  showInDock: false,
  dockOrder: 50,
  menus: [],
  contextMenus: {
    process: {
      id: 'process',
      items: [
        { id: 'process-sigterm', label: i18n.t('apps.taskManager.processMenu.sigterm'), icon: 'XCircle', action: 'process.sigterm' },
        { id: 'process-sigkill', label: i18n.t('apps.taskManager.processMenu.sigkill'), icon: 'Skull', action: 'process.sigkill', variant: 'danger', dividerAfter: true },
        { id: 'process-sighup', label: i18n.t('apps.taskManager.processMenu.sighup'), icon: 'RefreshCw', action: 'process.sighup' },
        { id: 'process-sigusr1', label: i18n.t('apps.taskManager.processMenu.sigusr1'), icon: 'Send', action: 'process.sigusr1' },
        { id: 'process-sigusr2', label: i18n.t('apps.taskManager.processMenu.sigusr2'), icon: 'Send', action: 'process.sigusr2' },
      ],
    },
    service: {
      id: 'service',
      items: [
        { id: 'service-start', label: i18n.t('apps.taskManager.serviceMenu.start'), icon: 'Play', action: 'service.start' },
        { id: 'service-stop', label: i18n.t('apps.taskManager.serviceMenu.stop'), icon: 'Square', action: 'service.stop' },
        { id: 'service-restart', label: i18n.t('apps.taskManager.serviceMenu.restart'), icon: 'RotateCcw', action: 'service.restart' },
        { id: 'service-reload', label: i18n.t('apps.taskManager.serviceMenu.reload'), icon: 'RefreshCw', action: 'service.reload', dividerAfter: true },
        { id: 'service-enable', label: i18n.t('apps.taskManager.serviceMenu.enable'), icon: 'CheckCircle', action: 'service.enable' },
        { id: 'service-disable', label: i18n.t('apps.taskManager.serviceMenu.disable'), icon: 'XCircle', action: 'service.disable', variant: 'danger' },
      ],
    },
    wasm: {
      id: 'wasm',
      items: [
        { id: 'wasm-start', label: i18n.t('apps.taskManager.wasmMenu.start'), icon: 'Play', action: 'wasm.start' },
        { id: 'wasm-stop', label: i18n.t('apps.taskManager.wasmMenu.stop'), icon: 'Square', action: 'wasm.stop' },
        { id: 'wasm-restart', label: i18n.t('apps.taskManager.wasmMenu.restart'), icon: 'RotateCcw', action: 'wasm.restart', dividerAfter: true },
        { id: 'wasm-enable-autostart', label: i18n.t('apps.taskManager.wasmMenu.enableAutostart'), icon: 'CheckCircle', action: 'wasm.enableAutostart' },
        { id: 'wasm-disable-autostart', label: i18n.t('apps.taskManager.wasmMenu.disableAutostart'), icon: 'XCircle', action: 'wasm.disableAutostart', variant: 'danger' },
      ],
    },
  },
}
