// notifyService.ts — Handles system_notify broadcast events from backend.
// Shows toast notifications for all connected clients.

import { registerMessageHandler } from '@/stores/webSocketStore'
import { toast, type ToastVariant } from '@/hooks/use-toast'

const levelToVariant: Record<string, ToastVariant> = {
  info: 'default',
  warning: 'default',
  error: 'destructive',
  success: 'success',
}

registerMessageHandler((msg: any) => {
  if (msg.type !== 'system_notify') return false

  const { level = 'info', title, message, source } = msg.data || {}
  const variant = levelToVariant[level] || 'default'
  const prefix = source ? `[${source}] ` : ''

  toast({
    variant,
    title: title || '系统通知',
    description: prefix + (message || ''),
  })

  return true
})
