import { notify, registerMessageHandler } from '@/stores/webSocketStore'

// ── Types ──

export interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

export interface ToolResult {
  tool_call_id: string
  content: string
  is_error?: boolean
}

export interface MediaAttachment {
  nodeId: string
  path: string
  fileName: string
  mimeType?: string
  size: number
  caption?: string
}

export interface ChatDelta {
  conversationId: string
  content: string
}

export interface TokenUsage {
  contextTokens: number
  responseTokens: number
  contextPercent: number
  compressed: boolean
}

export interface ChatEvent {
  type: 'delta' | 'thinking' | 'tool_call_pending' | 'tool_call' | 'tool_result' | 'shell_output' | 'done' | 'error' | 'command_result' | 'ui_action' | 'chat.busy' | 'status_update' | 'command_progress' | 'media'
  conversationId: string
  content?: string
  toolCallPending?: { id: string; name: string }
  toolCall?: ToolCall
  toolResult?: ToolResult
  shellOutput?: { toolCallId: string; stream: string; data: string }
  error?: string
  commandResult?: {
    text: string
    isError: boolean
    clearHistory: boolean
    targetConversationId?: string
    conversationAction?: string
    switchConversation?: boolean
    routePolicy?: string
    ownerClientId?: string
  }
  usage?: TokenUsage
  uiAction?: { action: string; params: Record<string, any> }
  busyInfo?: { rejectedConvId: string; busyConvTitle: string; hint: string }
  statusUpdate?: { state: 'idle' | 'running' | 'tool_executing'; runningConvId: string; runningConvTitle: string; queueSize: number }
  commandProgress?: { command: string; state: 'running' | 'done' }
  media?: MediaAttachment
}

type ChatEventHandler = (event: ChatEvent) => void

const listeners = new Set<ChatEventHandler>()

export function onChatEvent(handler: ChatEventHandler): () => void {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}

function emit(event: ChatEvent) {
  for (const handler of listeners) handler(event)
}

// ── Register WS message handler (JSON-RPC 2.0 notifications) ──

const methodMap: Record<string, (p: any) => ChatEvent | null> = {
  'chat.delta': (p) => ({ type: 'delta', conversationId: p.conversationId, content: p.content }),
  'chat.thinking': (p) => ({ type: 'thinking', conversationId: p.conversationId, content: p.content }),
  'chat.tool_call_pending': (p) => ({ type: 'tool_call_pending', conversationId: p.conversationId, toolCallPending: p.pending }),
  'chat.tool_call': (p) => ({ type: 'tool_call', conversationId: p.conversationId, toolCall: p.toolCall }),
  'chat.tool_result': (p) => ({ type: 'tool_result', conversationId: p.conversationId, toolResult: p.result }),
  'chat.shell_output': (p) => ({
    type: 'shell_output', conversationId: p.conversationId,
    shellOutput: { toolCallId: p.toolCallId, stream: p.output?.stream, data: p.output?.data },
  }),
  'chat.done': (p) => ({ type: 'done', conversationId: p.conversationId, usage: p.usage }),
  'chat.error': (p) => ({ type: 'error', conversationId: p.conversationId, error: p.message || p.error }),
  'chat.command_result': (p) => ({
    type: 'command_result', conversationId: p.conversationId,
    commandResult: {
      text: p.text || '',
      isError: p.isError || false,
      clearHistory: p.clearHistory || false,
      targetConversationId: p.targetConversationId || '',
      conversationAction: p.conversationAction || '',
      switchConversation: p.switchConversation || false,
      routePolicy: p.routePolicy || '',
      ownerClientId: p.ownerClientId || '',
    },
  }),
  'chat.command_progress': (p) => ({ type: 'command_progress', conversationId: '', commandProgress: { command: p.command, state: p.state } }),
  'chat.ui_action': (p) => ({ type: 'ui_action', conversationId: p.conversationId, uiAction: p.action }),
  'chat.busy': (p) => ({ type: 'chat.busy', conversationId: p.rejectedConvId || '', busyInfo: p }),
  'chat.status_update': (p) => ({ type: 'status_update', conversationId: p.runningConvId || '', statusUpdate: p }),
  'chat.media': (p) => ({ type: 'media', conversationId: p.conversationId, media: p.attachment }),
}

registerMessageHandler((msg: any) => {
  if (!msg.method || !msg.params) return false
  const mapper = methodMap[msg.method]
  if (!mapper) return false
  const event = mapper(msg.params)
  if (event) emit(event)
  return true
})

// ── API ──

export function chatSend(conversationId: string, messageContent: string, draftConfig?: { providerId: string; model: string } | null) {
  notify('chat.send', {
    conversationId,
    messageContent,
    providerId: draftConfig?.providerId || '',
    model: draftConfig?.model || '',
  })
}
