import { sendMsg, request, registerMessageHandler, registerDisconnectHook } from '@/stores/webSocketStore'
import { exec } from '@/lib/services/execService'
import { fsService } from '@/lib/services/fsService'

const NODE_ID = 'local_1'
const DAEMON_JSON_PATH = '/etc/docker/daemon.json'
const COMPOSE_FILE = 'docker-compose.yml'

// Docker logs push handlers keyed by containerId
const dockerLogsHandlers = new Map<string, { handler: (chunk: string, isFirst: boolean) => void; isFirst: boolean }>()

// Register push message handler for docker_logs
registerMessageHandler((msg) => {
  if (msg.type === 'docker_logs' && msg.data) {
    const containerId = msg.data.containerId as string
    const entry = containerId ? dockerLogsHandlers.get(containerId) : null
    if (entry) {
      entry.handler(msg.data.logs || '', entry.isFirst)
      entry.isFirst = false
    }
    return true
  }
  return false
})

// Clear state on disconnect
registerDisconnectHook(() => {
  dockerLogsHandlers.clear()
})

export const dockerService = {
  containerLogs(id: string, tail?: string): Promise<{ logs: string }> {
    return request('docker_container_logs', { data: id, tail: tail || '200' })
  },

  composeLogs(projectDir: string, tail?: string): Promise<{ logs: string }> {
    return request('docker_compose_logs', { projectDir, tail: tail || '100' })
  },

  composeCreate(projectDir: string, yamlContent: string, autoUp: boolean): Promise<{ composePath: string; output?: string }> {
    return request('docker_compose_create', { projectDir, yamlContent, autoUp })
  },

  async composeRead(projectDir: string): Promise<{ composePath: string; content: string }> {
    const composePath = `${projectDir}/${COMPOSE_FILE}`
    const { content } = await fsService.read(NODE_ID, composePath)
    return { composePath, content }
  },

  async daemonConfigRead(): Promise<{ content: string }> {
    try {
      const { content } = await fsService.read(NODE_ID, DAEMON_JSON_PATH)
      return { content }
    } catch {
      return { content: '{}' }
    }
  },

  async daemonConfigWrite(content: string): Promise<{ status: string }> {
    await fsService.write(NODE_ID, DAEMON_JSON_PATH, content)
    return { status: 'ok' }
  },

  async daemonRestart(): Promise<{ status: string }> {
    await exec('systemctl restart docker', { background: true, title: 'Docker 重启', refreshChannels: ['docker_containers', 'docker_images', 'docker_compose', 'docker_networks', 'docker_volumes'] })
    return { status: 'ok' }
  },

  pull(imageName: string) {
    sendMsg({ type: 'docker_pull', name: imageName })
  },

  logsSubscribe(containerId: string, tail: string, handler: (chunk: string, isFirst: boolean) => void): () => void {
    dockerLogsHandlers.set(containerId, { handler, isFirst: true })
    sendMsg({ type: 'docker_logs_subscribe', data: containerId, tail })
    return () => {
      dockerLogsHandlers.delete(containerId)
      sendMsg({ type: 'docker_logs_unsubscribe' })
    }
  },

  networkInspect(id: string): Promise<any> {
    return request('docker_network_inspect', { data: id })
  },

  networkCreate(name: string, driver: string): Promise<any> {
    return request('docker_network_create', { name, driver })
  },

  networkRemove(id: string): Promise<any> {
    return request('docker_network_remove', { data: id })
  },

  volumeInspect(name: string): Promise<any> {
    return request('docker_volume_inspect', { data: name })
  },

  volumeCreate(name: string, driver: string): Promise<any> {
    return request('docker_volume_create', { name, driver })
  },

  volumeRemove(name: string, force?: boolean): Promise<any> {
    return request('docker_volume_remove', { data: name, force: !!force })
  },
}
