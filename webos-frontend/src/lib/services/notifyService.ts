// notifyService.ts — Handles system.notify broadcast events from backend.
// Shows toast notifications for all connected clients.

import i18n from '@/i18n'
import { registerMessageHandler } from '@/stores/webSocketStore'
import { toast, type ToastVariant } from '@/hooks/use-toast'

const levelToVariant: Record<string, ToastVariant> = {
  info: 'default',
  warning: 'default',
  error: 'destructive',
  success: 'success',
}

registerMessageHandler((msg: any) => {
  if (msg.method !== 'system.notify') return false

  const { level = 'info', title, message, source } = msg.params || {}
  const variant = levelToVariant[level] || 'default'
  const prefix = source ? `[${source}] ` : ''

  toast({
    variant,
    title: title || i18n.t('common.systemNotification'),
    description: prefix + (message || ''),
  })

  return true
})
