import { request } from '@/stores/webSocketStore'

interface ExecOptions {
  background?: boolean
  title?: string
  refreshChannels?: string[]
}

export function exec(command: string, opts?: ExecOptions): Promise<any> {
  if (opts?.background) {
    return request('exec', { command, background: true, title: opts.title, refreshChannels: opts.refreshChannels })
  }
  return request('exec', { command })
}
