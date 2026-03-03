import type { AppConfig } from '@/types'

export const manifest: AppConfig = {
  id: 'taskManager',
  name: '任务管理器',
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
        { id: 'process-sigterm', label: '终止进程 (SIGTERM)', icon: 'XCircle', action: 'process.sigterm' },
        { id: 'process-sigkill', label: '强制终止 (SIGKILL)', icon: 'Skull', action: 'process.sigkill', variant: 'danger', dividerAfter: true },
        { id: 'process-sighup', label: '重载配置 (SIGHUP)', icon: 'RefreshCw', action: 'process.sighup' },
        { id: 'process-sigusr1', label: '发送 SIGUSR1', icon: 'Send', action: 'process.sigusr1' },
        { id: 'process-sigusr2', label: '发送 SIGUSR2', icon: 'Send', action: 'process.sigusr2' },
      ],
    },
    service: {
      id: 'service',
      items: [
        { id: 'service-start', label: '启动', icon: 'Play', action: 'service.start' },
        { id: 'service-stop', label: '停止', icon: 'Square', action: 'service.stop' },
        { id: 'service-restart', label: '重启', icon: 'RotateCcw', action: 'service.restart' },
        { id: 'service-reload', label: '重载', icon: 'RefreshCw', action: 'service.reload', dividerAfter: true },
        { id: 'service-enable', label: '启用开机自启', icon: 'CheckCircle', action: 'service.enable' },
        { id: 'service-disable', label: '禁用开机自启', icon: 'XCircle', action: 'service.disable', variant: 'danger' },
      ],
    },
  },
}
