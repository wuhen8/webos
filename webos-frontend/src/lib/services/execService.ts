import { request } from '@/stores/webSocketStore'

interface ExecOptions {
  background?: boolean
  title?: string
  refreshChannels?: string[]
}

export function exec(command: string, opts?: ExecOptions): Promise<any> {
  if (opts?.background) {
    return request('system.exec', { command, background: true, title: opts.title, refreshChannels: opts.refreshChannels })
  }
  return request('system.exec', { command })
}
