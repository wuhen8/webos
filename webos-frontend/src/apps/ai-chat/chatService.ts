import { sendMsg, registerMessageHandler } from '@/stores/webSocketStore'

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
  type: 'delta' | 'thinking' | 'tool_call_pending' | 'tool_call' | 'tool_result' | 'shell_output' | 'done' | 'error' | 'command_result' | 'ui_action' | 'chat_busy' | 'status_update' | 'conv_switched' | 'inactive_conv' | 'command_progress'
  conversationId: string
  content?: string
  toolCallPending?: { id: string; name: string }
  toolCall?: ToolCall
  toolResult?: ToolResult
  shellOutput?: { toolCallId: string; stream: string; data: string }
  error?: string
  commandResult?: { text: string; isError: boolean; clearHistory: boolean }
  usage?: TokenUsage
  uiAction?: { action: string; params: Record<string, any> }
  busyInfo?: { rejectedConvId: string; busyConvTitle: string; hint: string }
  statusUpdate?: { state: 'idle' | 'running' | 'tool_executing'; runningConvId: string; runningConvTitle: string; queueSize: number; activeConvId: string }
  convSwitched?: { convId: string; convTitle: string }
  inactiveConv?: { conversationId: string; activeConvId: string; activeConvTitle: string; hint: string }
  commandProgress?: { command: string; state: 'running' | 'done' }
}

type ChatEventHandler = (event: ChatEvent) => void

// ── Listeners ──

const listeners = new Set<ChatEventHandler>()

export function onChatEvent(handler: ChatEventHandler): () => void {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}

function emit(event: ChatEvent) {
  for (const handler of listeners) handler(event)
}

// ── Register WS message handler ──

registerMessageHandler((msg: any) => {
  switch (msg.type) {
    case 'chat_delta':
      emit({
        type: 'delta',
        conversationId: msg.data?.conversationId,
        content: msg.data?.content,
      })
      return true
    case 'chat_thinking':
      emit({
        type: 'thinking',
        conversationId: msg.data?.conversationId,
        content: msg.data?.content,
      })
      return true
    case 'chat_tool_call_pending':
      emit({
        type: 'tool_call_pending',
        conversationId: msg.data?.conversationId,
        toolCallPending: msg.data?.pending,
      })
      return true
    case 'chat_tool_call':
      emit({
        type: 'tool_call',
        conversationId: msg.data?.conversationId,
        toolCall: msg.data?.toolCall,
      })
      return true
    case 'chat_tool_result':
      emit({
        type: 'tool_result',
        conversationId: msg.data?.conversationId,
        toolResult: msg.data?.result,
      })
      return true
    case 'chat_shell_output':
      emit({
        type: 'shell_output',
        conversationId: msg.data?.conversationId,
        shellOutput: {
          toolCallId: msg.data?.toolCallId,
          stream: msg.data?.output?.stream,
          data: msg.data?.output?.data,
        },
      })
      return true
    case 'chat_done':
      emit({
        type: 'done',
        conversationId: msg.data?.conversationId,
        usage: msg.data?.usage,
      })
      return true
    case 'chat_error':
      emit({
        type: 'error',
        conversationId: msg.data?.conversationId,
        error: msg.message,
      })
      return true
    case 'chat_command_result':
      emit({
        type: 'command_result',
        conversationId: msg.data?.conversationId,
        commandResult: {
          text: msg.data?.text || '',
          isError: msg.data?.isError || false,
          clearHistory: msg.data?.clearHistory || false,
        },
      })
      return true
    case 'chat_command_progress':
      emit({
        type: 'command_progress',
        conversationId: '',
        commandProgress: { command: msg.data?.command, state: msg.data?.state },
      })
      return true
    case 'chat_ui_action':
      emit({
        type: 'ui_action',
        conversationId: msg.data?.conversationId,
        uiAction: msg.data?.action,
      })
      return true
    case 'chat_busy':
      emit({
        type: 'chat_busy',
        conversationId: msg.data?.rejectedConvId || '',
        busyInfo: msg.data,
      })
      return true
    case 'chat_status_update':
      emit({
        type: 'status_update',
        conversationId: msg.data?.runningConvId || '',
        statusUpdate: msg.data,
      })
      return true
    case 'conv_switched':
      emit({
        type: 'conv_switched',
        conversationId: msg.data?.convId || '',
        convSwitched: msg.data,
      })
      return true
    case 'chat_inactive_conv':
      emit({
        type: 'inactive_conv',
        conversationId: msg.data?.conversationId || '',
        inactiveConv: msg.data,
      })
      return true
    default:
      return false
  }
})

// ── API ──

export function chatSend(conversationId: string, messageContent: string) {
  sendMsg({ type: 'chat_send', conversationId, messageContent })
}
