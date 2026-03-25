import i18n from '@/i18n'
import { request, notify, registerMessageHandler, registerDisconnectHook } from '@/stores/webSocketStore'
import { exec } from '@/lib/services/execService'
import { fsService } from '@/lib/services/fsService'

const NODE_ID = 'local_1'
const DAEMON_JSON_PATH = '/etc/docker/daemon.json'
const COMPOSE_FILE = 'docker-compose.yml'

const dockerLogsHandlers = new Map<string, { handler: (chunk: string, isFirst: boolean) => void; isFirst: boolean }>()

registerMessageHandler((msg) => {
  if (msg.method === 'docker.logs' && msg.params) {
    const containerId = msg.params.containerId as string
    const entry = containerId ? dockerLogsHandlers.get(containerId) : null
    if (entry) {
      entry.handler(msg.params.logs || '', entry.isFirst)
      entry.isFirst = false
    }
    return true
  }
  return false
})

registerDisconnectHook(() => { dockerLogsHandlers.clear() })

export const dockerService = {
  containerLogs(id: string, tail?: string): Promise<{ logs: string }> {
    return request('docker.container_logs', { data: id, tail: tail || '200' })
  },
  composeLogs(projectDir: string, tail?: string): Promise<{ logs: string }> {
    return request('docker.compose_logs', { projectDir, tail: tail || '100' })
  },
  composeCreate(projectDir: string, yamlContent: string, autoUp: boolean): Promise<{ composePath: string; output?: string }> {
    return request('docker.compose_create', { projectDir, yamlContent, autoUp })
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
    } catch { return { content: '{}' } }
  },
  async daemonConfigWrite(content: string): Promise<{ status: string }> {
    await fsService.write(NODE_ID, DAEMON_JSON_PATH, content)
    return { status: 'ok' }
  },
  async daemonRestart(): Promise<{ status: string }> {
    await exec('systemctl restart docker', { background: true, title: i18n.t('apps.docker.settings.actions.restartDocker'), refreshChannels: ['sub.docker_containers', 'sub.docker_images', 'sub.docker_compose', 'sub.docker_networks', 'sub.docker_volumes'] })
    return { status: 'ok' }
  },
  pull(imageName: string) {
    notify('docker.pull', { name: imageName })
  },
  logsSubscribe(containerId: string, tail: string, handler: (chunk: string, isFirst: boolean) => void): () => void {
    dockerLogsHandlers.set(containerId, { handler, isFirst: true })
    notify('docker.logs_subscribe', { data: containerId, tail })
    return () => {
      dockerLogsHandlers.delete(containerId)
      notify('docker.logs_unsubscribe')
    }
  },
  networkInspect(id: string): Promise<any> { return request('docker.network_inspect', { data: id }) },
  networkCreate(name: string, driver: string): Promise<any> { return request('docker.network_create', { name, driver }) },
  networkRemove(id: string): Promise<any> { return request('docker.network_remove', { data: id }) },
  volumeInspect(name: string): Promise<any> { return request('docker.volume_inspect', { data: name }) },
  volumeCreate(name: string, driver: string): Promise<any> { return request('docker.volume_create', { name, driver }) },
  volumeRemove(name: string, force?: boolean): Promise<any> { return request('docker.volume_remove', { data: name, force: !!force }) },
}
