import { useState, useRef, useEffect, useCallback, memo, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Send, AlertCircle, Settings2, Zap, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { chatSend, onChatEvent, type ChatEvent, type ToolCall, type TokenUsage } from './chatService'
import { request, registerReconnectHook } from '@/stores/webSocketStore'
import { copyToClipboard } from '@/utils'
import { useWindowStore } from '@/stores/windowStore'
import { useEditorStore } from '@/apps/editor/store'
import type { MessageBlock, Conversation, CommandDef } from './components/types'
import { ToolCallBlock, ThinkingBlock } from './components/MessageBlocks'
import { CommandAutocomplete } from './components/CommandAutocomplete'
import { ConfigPanel } from './components/ConfigPanel'
import { ModelSwitcher } from './components/ModelSwitcher'
import { Sidebar } from './components/Sidebar'

function CodeBlock(props: ComponentProps<'pre'>) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const handleCopy = () => {
    const text = preRef.current?.textContent || ''
    if (!text) return
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group">
      <pre ref={preRef} {...props} />
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded bg-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-600 transition-all"
        title={t('apps.aiChat.chat.copyCode')}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// Stable references for ReactMarkdown plugins (avoid re-creating arrays each render)
const remarkPluginsGfm = [remarkGfm]
const rehypePluginsHighlight = [rehypeHighlight]
const mdComponents = { pre: CodeBlock }

const UserMessage = memo(({ content }: { content: string }) => (
  <div className="flex justify-end">
    <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-md bg-violet-500 text-white text-sm whitespace-pre-wrap break-words">
      {content}
    </div>
  </div>
))

const AssistantMessage = memo(({ content, usage }: { content: string; usage?: TokenUsage }) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[85%] overflow-hidden px-3.5 py-2 rounded-2xl rounded-bl-md bg-slate-100 text-slate-800 text-sm prose prose-sm prose-slate [&_pre]:bg-slate-800 [&_pre]:text-slate-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_table]:text-xs">
        <ReactMarkdown remarkPlugins={remarkPluginsGfm} rehypePlugins={rehypePluginsHighlight} components={mdComponents}>
          {content}
        </ReactMarkdown>
      </div>
      {usage && (
        <div className="flex items-center gap-2 mt-1 ml-1 text-[10px] text-slate-400">
          <span>{t('apps.aiChat.chat.contextTokens', { count: usage.contextTokens.toLocaleString(), percent: usage.contextPercent })}</span>
          <span>·</span>
          <span>{t('apps.aiChat.chat.responseTokens', { count: usage.responseTokens.toLocaleString() })}</span>
          {usage.compressed && (
            <>
              <span>·</span>
              <span className="text-amber-500">{t('apps.aiChat.chat.compressed')}</span>
            </>
          )}
          {usage.contextPercent >= 80 && (
            <>
              <span>·</span>
              <span className="text-orange-500">{t('apps.aiChat.chat.contextNearLimit')}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
})

const ErrorMessage = memo(({ content }: { content: string }) => (
  <div className="flex justify-start">
    <div className="max-w-[85%] flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm break-words overflow-hidden">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="min-w-0">{content}</span>
    </div>
  </div>
))

const CommandMessage = memo(({ content }: { content: string }) => {
  const { t } = useTranslation()

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-bl-md bg-violet-50 border border-violet-200 text-slate-700 text-sm prose prose-sm prose-slate [&_code]:text-xs [&_code]:bg-violet-100 [&_code]:px-1 [&_code]:rounded [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 overflow-hidden">
        <div className="flex items-center gap-1.5 mb-1 text-violet-500 text-xs font-medium">
          <Zap className="h-3.5 w-3.5" />
          {t('apps.aiChat.chat.commandResult')}
        </div>
        <ReactMarkdown remarkPlugins={remarkPluginsGfm}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
})

export default function ChatContent() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<MessageBlock[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [convId, setConvId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [configVer, setConfigVer] = useState(0)
  const [showSidebar, setShowSidebar] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [commands, setCommands] = useState<CommandDef[]>([])
  const [showCommands, setShowCommands] = useState(false)
  const [cmdIndex, setCmdIndex] = useState(0)
  const [executorStatus, setExecutorStatus] = useState<{ state: 'idle' | 'running' | 'tool_executing'; runningConvId: string; runningConvTitle: string; queueSize: number; activeConvId: string }>({ state: 'idle', runningConvId: '', runningConvTitle: '', queueSize: 0, activeConvId: '' })
  const [commandProgress, setCommandProgress] = useState<string | null>(null)
  const [activeConvId, setActiveConvId] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamBuf = useRef('')
  const thinkingBuf = useRef('')
  const pendingToolCalls = useRef<Map<string, ToolCall>>(new Map())
  const shellOutputs = useRef<Map<string, { stdout: string; stderr: string }>>(new Map())
  const composingRef = useRef(false)
  const rafRef = useRef(0)
  const thinkingRafRef = useRef(0)
  const convIdRef = useRef(convId)
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ensureConvPromiseRef = useRef<Promise<boolean> | null>(null)
  useEffect(() => { convIdRef.current = convId }, [convId])

  const resetStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    streamTimeoutRef.current = setTimeout(() => {
      setStreaming(false)
    }, 120_000)
  }, [])
  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = undefined
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const loadConversations = useCallback(async () => {
    try {
      const data = await request('chat.history', {})
      if (Array.isArray(data)) {
        setConversations(data.map((c: any) => ({ id: c.ID || c.id, title: c.Title || c.title })))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  const loadConversationMessages = useCallback(async (id: string) => {
    try {
      const data = await request('chat.messages', { conversationId: id })
      if (Array.isArray(data)) {
        const blocks: MessageBlock[] = []
        for (const m of data) {
          const role = m.Role || m.role
          const content = m.Content || m.content || ''
          if (role === 'user') {
            blocks.push({ id: `h-${m.ID || m.id}`, type: 'user', content, timestamp: m.CreatedAt || m.created_at || 0 })
          } else if (role === 'assistant') {
            const thinking = m.Thinking || m.thinking || ''
            if (thinking) {
              blocks.push({ id: `ht-${m.ID || m.id}`, type: 'thinking', content: thinking, timestamp: m.CreatedAt || m.created_at || 0 })
            }
            if (content) {
              const usageRaw = m.TokenUsage || m.token_usage
              let usage: TokenUsage | undefined
              if (usageRaw) { try { usage = typeof usageRaw === 'string' ? JSON.parse(usageRaw) : usageRaw } catch { /* */ } }
              blocks.push({ id: `h-${m.ID || m.id}`, type: 'assistant', content, timestamp: m.CreatedAt || m.created_at || 0, usage })
            }
            const tcRaw = m.ToolCalls || m.tool_calls
            if (tcRaw) {
              try {
                const tcs = typeof tcRaw === 'string' ? JSON.parse(tcRaw) : tcRaw
                for (const tc of tcs) {
                  blocks.push({ id: `htc-${tc.id}`, type: 'tool_call', content: '', toolCall: tc, timestamp: m.CreatedAt || m.created_at || 0 })
                }
              } catch { /* */ }
            }
          } else if (role === 'tool') {
            const callId = m.ToolCallID || m.tool_call_id
            const tcBlock = blocks.findLast((b: MessageBlock) => b.type === 'tool_call' && b.toolCall?.id === callId)
            if (tcBlock) {
              tcBlock.toolResult = { tool_call_id: callId, content, is_error: false }
            }
          }
        }
        setMessages(blocks)
      }
    } catch { /* ignore */ }
  }, [])

  // On mount, fetch executor status and restore active conversation (parallel)
  useEffect(() => {
    const statusP = request('chat.executor_status', {})
    const msgsP = request('chat.messages', {})
    Promise.all([statusP, msgsP]).then(([statusData, msgsData]: any[]) => {
      if (statusData) {
        setExecutorStatus(statusData)
        if (statusData.activeConvId) {
          setActiveConvId(statusData.activeConvId)
          if (!convIdRef.current) {
            convIdRef.current = statusData.activeConvId
            setConvId(statusData.activeConvId)
          }
        }
      }
      if (Array.isArray(msgsData) && msgsData.length > 0 && !convIdRef.current) {
        // chat.messages without id returned active conv messages
        // extract convId from first message
        const firstMsg = msgsData[0]
        const cid = firstMsg.ConversationID || firstMsg.conversation_id || ''
        if (cid) {
          convIdRef.current = cid
          setConvId(cid)
        }
      }
      if (Array.isArray(msgsData) && msgsData.length > 0) {
        const blocks: MessageBlock[] = []
        for (const m of msgsData) {
          const role = m.Role || m.role
          const content = m.Content || m.content || ''
          if (role === 'user') {
            blocks.push({ id: `h-${m.ID || m.id}`, type: 'user', content, timestamp: m.CreatedAt || m.created_at || 0 })
          } else if (role === 'assistant') {
            const thinking = m.Thinking || m.thinking || ''
            if (thinking) {
              blocks.push({ id: `ht-${m.ID || m.id}`, type: 'thinking', content: thinking, timestamp: m.CreatedAt || m.created_at || 0 })
            }
            if (content) {
              const usageRaw = m.TokenUsage || m.token_usage
              let usage: TokenUsage | undefined
              if (usageRaw) { try { usage = typeof usageRaw === 'string' ? JSON.parse(usageRaw) : usageRaw } catch { /* */ } }
              blocks.push({ id: `h-${m.ID || m.id}`, type: 'assistant', content, timestamp: m.CreatedAt || m.created_at || 0, usage })
            }
            const tcRaw = m.ToolCalls || m.tool_calls
            if (tcRaw) {
              try {
                const tcs = typeof tcRaw === 'string' ? JSON.parse(tcRaw) : tcRaw
                for (const tc of tcs) {
                  blocks.push({ id: `htc-${tc.id}`, type: 'tool_call', content: '', toolCall: tc, timestamp: m.CreatedAt || m.created_at || 0 })
                }
              } catch { /* */ }
            }
          } else if (role === 'tool') {
            const callId = m.ToolCallID || m.tool_call_id
            const tcBlock = blocks.findLast((b: MessageBlock) => b.type === 'tool_call' && b.toolCall?.id === callId)
            if (tcBlock) {
              tcBlock.toolResult = { tool_call_id: callId, content: m.Content || m.content || '', is_error: false }
            }
          }
        }
        setMessages(blocks)
      }
    }).catch(() => {})
  }, [])

  // Restore after WebSocket reconnect: if streaming is still active, check whether the backend conversation already finished
  useEffect(() => {
    const unsub = registerReconnectHook(() => {
      if (!streaming) return
      const cid = convIdRef.current
      if (!cid) return
      // Give the backend a moment to finish, then check the conversation status
      setTimeout(async () => {
        try {
          const status = await request('chat.status', { conversationId: cid })
          if (status && !(status as any).active) {
            // Backend already finished, but the frontend missed the done event, so restore from DB
            setStreaming(false)
            streamBuf.current = ''
            thinkingBuf.current = ''
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
            if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
            const data = await request('chat.messages', { conversationId: cid })
            if (Array.isArray(data)) {
              const blocks: MessageBlock[] = []
              for (const m of data) {
                const role = m.Role || m.role
                const content = m.Content || m.content || ''
                if (role === 'user') {
                  blocks.push({ id: `h-${m.ID || m.id}`, type: 'user', content, timestamp: m.CreatedAt || m.created_at || 0 })
                } else if (role === 'assistant') {
                  const thinking = m.Thinking || m.thinking || ''
                  if (thinking) {
                    blocks.push({ id: `ht-${m.ID || m.id}`, type: 'thinking', content: thinking, timestamp: m.CreatedAt || m.created_at || 0 })
                  }
                  if (content) {
                    const usageRaw = m.TokenUsage || m.token_usage
                    let usage: TokenUsage | undefined
                    if (usageRaw) { try { usage = typeof usageRaw === 'string' ? JSON.parse(usageRaw) : usageRaw } catch { /* */ } }
                    blocks.push({ id: `h-${m.ID || m.id}`, type: 'assistant', content, timestamp: m.CreatedAt || m.created_at || 0, usage })
                  }
                  const tcRaw = m.ToolCalls || m.tool_calls
                  if (tcRaw) {
                    try {
                      const tcs = typeof tcRaw === 'string' ? JSON.parse(tcRaw) : tcRaw
                      for (const tc of tcs) {
                        blocks.push({ id: `htc-${tc.id}`, type: 'tool_call', content: '', toolCall: tc, timestamp: m.CreatedAt || m.created_at || 0 })
                      }
                    } catch { /* */ }
                  }
                } else if (role === 'tool') {
                  const callId = m.ToolCallID || m.tool_call_id
                  const tcBlock = blocks.findLast((b: MessageBlock) => b.type === 'tool_call' && b.toolCall?.id === callId)
                  if (tcBlock) {
                    tcBlock.toolResult = { tool_call_id: callId, content, is_error: false }
                  }
                }
              }
              setMessages(blocks)
            }
            loadConversations()
          }
        } catch { /* ignore when chat.status is unavailable */ }
      }, 1000)
    })
    return unsub
  }, [streaming, loadConversations])

  useEffect(() => {
    request('chat.commands', {}).then((data: any) => {
      if (Array.isArray(data)) setCommands(data)
    }).catch(() => {})
  }, [])

  // Listen to chat events
  useEffect(() => {
    const unsub = onChatEvent((event: ChatEvent) => {
      // Global events — not scoped to a conversation, handle before filtering
      if (event.type === 'status_update') {
        if (event.statusUpdate) {
          setExecutorStatus(event.statusUpdate)
          if (event.statusUpdate.activeConvId) {
            setActiveConvId(event.statusUpdate.activeConvId)
          }
          if (event.statusUpdate.state === 'idle') {
            setStreaming(false)
            pendingToolCalls.current.clear()
            shellOutputs.current.clear()
            setMessages(prev => {
              const hasPending = prev.some(m => m.type === 'tool_call' && !m.toolResult)
              if (!hasPending) return prev
              return prev.map(m =>
                m.type === 'tool_call' && !m.toolResult
                  ? { ...m, toolResult: { tool_call_id: m.toolCall!.id, content: t('apps.aiChat.chat.interrupted'), is_error: true }, shellOutput: undefined }
                  : m
              )
            })
          }
        }
        return
      }
      if (event.type === 'command_progress') {
        setCommandProgress(event.commandProgress?.state === 'running' ? event.commandProgress.command : null)
        return
      }
      if (event.type === 'chat.conv_switched') {
        if (event.convSwitched) {
          const newId = event.convSwitched.convId
          setActiveConvId(newId)
          // If we're in a "new chat" state (no convId yet), bind the newly created
          // conversation to the current view so responses appear here instead of
          // requiring the user to click the sidebar entry.
          if (!convIdRef.current && newId) {
            convIdRef.current = newId
            setConvId(newId)
          }
          loadConversations()
        }
        return
      }
      if (event.type === 'inactive_conv') {
        // Message was rejected because it targets a non-active conversation
        setStreaming(false)
        clearStreamTimeout()
        if (event.inactiveConv) {
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            type: 'error',
            content: event.inactiveConv!.hint,
            timestamp: Date.now(),
          }])
        }
        return
      }

      // Bind conversation ID on first event of a new chat
      if (event.conversationId && !convIdRef.current) {
        convIdRef.current = event.conversationId
        setConvId(event.conversationId)
      }

      // Ignore events from a different conversation
      if (event.conversationId && convIdRef.current && event.conversationId !== convIdRef.current) {
        return
      }

      resetStreamTimeout()

      switch (event.type) {
        case 'thinking':
          thinkingBuf.current += event.content || ''
          if (!thinkingRafRef.current) {
            thinkingRafRef.current = requestAnimationFrame(() => {
              thinkingRafRef.current = 0
              const buf = thinkingBuf.current
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.type === 'thinking') {
                  return [...prev.slice(0, -1), { ...last, content: buf }]
                }
                return [...prev, {
                  id: `think-${Date.now()}`,
                  type: 'thinking',
                  content: buf,
                  timestamp: Date.now(),
                }]
              })
            })
          }
          break

        case 'delta':
          // Flush pending thinking before switching to delta
          if (thinkingBuf.current) {
            if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
            const pendingThinking = thinkingBuf.current
            thinkingBuf.current = ''
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.type === 'thinking') {
                return [...prev.slice(0, -1), { ...last, content: pendingThinking }]
              }
              return [...prev, {
                id: `think-${Date.now()}`,
                type: 'thinking',
                content: pendingThinking,
                timestamp: Date.now(),
              }]
            })
          }
          streamBuf.current += event.content || ''
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = 0
              const buf = streamBuf.current
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.type === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, content: buf }]
                }
                return [...prev, {
                  id: `msg-${Date.now()}`,
                  type: 'assistant',
                  content: buf,
                  timestamp: Date.now(),
                }]
              })
            })
          }
          break

        case 'tool_call_pending': {
          // Flush pending thinking
          const pendingThinking = thinkingBuf.current
          thinkingBuf.current = ''
          if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
          // Flush pending streamBuf before cancelling rAF
          const pendingContent = streamBuf.current
          streamBuf.current = ''
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          if (pendingThinking) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.type === 'thinking') {
                return [...prev.slice(0, -1), { ...last, content: pendingThinking }]
              }
              return [...prev, {
                id: `think-${Date.now()}`,
                type: 'thinking',
                content: pendingThinking,
                timestamp: Date.now(),
              }]
            })
          }
          if (pendingContent) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.type === 'assistant') {
                return [...prev.slice(0, -1), { ...last, content: pendingContent }]
              }
              return [...prev, {
                id: `msg-${Date.now()}`,
                type: 'assistant',
                content: pendingContent,
                timestamp: Date.now(),
              }]
            })
          }
          if (event.toolCallPending) {
            const pending = event.toolCallPending
            pendingToolCalls.current.set(pending.id, {
              id: pending.id,
              type: 'function',
              function: { name: pending.name, arguments: '' },
            })
            setMessages(prev => [...prev, {
              id: `tc-${pending.id}`,
              type: 'tool_call',
              content: '',
              toolCall: {
                id: pending.id,
                type: 'function',
                function: { name: pending.name, arguments: '' },
              },
              timestamp: Date.now(),
            }])
          }
          break
        }

        case 'tool_call': {
          // Flush pending thinking
          const pendingThinking2 = thinkingBuf.current
          thinkingBuf.current = ''
          if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
          const pendingContent2 = streamBuf.current
          streamBuf.current = ''
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          if (pendingThinking2) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.type === 'thinking') {
                return [...prev.slice(0, -1), { ...last, content: pendingThinking2 }]
              }
              return [...prev, {
                id: `think-${Date.now()}`,
                type: 'thinking',
                content: pendingThinking2,
                timestamp: Date.now(),
              }]
            })
          }
          if (pendingContent2) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.type === 'assistant') {
                return [...prev.slice(0, -1), { ...last, content: pendingContent2 }]
              }
              return [...prev, {
                id: `msg-${Date.now()}`,
                type: 'assistant',
                content: pendingContent2,
                timestamp: Date.now(),
              }]
            })
          }
          if (event.toolCall) {
            const callId = event.toolCall.id
            if (pendingToolCalls.current.has(callId)) {
              pendingToolCalls.current.set(callId, event.toolCall)
              setMessages(prev => prev.map(m =>
                m.type === 'tool_call' && m.toolCall?.id === callId
                  ? { ...m, toolCall: event.toolCall }
                  : m
              ))
            } else {
              pendingToolCalls.current.set(callId, event.toolCall)
              setMessages(prev => [...prev, {
                id: `tc-${callId}`,
                type: 'tool_call',
                content: '',
                toolCall: event.toolCall,
                timestamp: Date.now(),
              }])
            }
          }
          break
        }

        case 'tool_result':
          if (event.toolResult) {
            const callId = event.toolResult.tool_call_id
            shellOutputs.current.delete(callId)
            setMessages(prev => prev.map(m =>
              m.type === 'tool_call' && m.toolCall?.id === callId
                ? { ...m, toolResult: event.toolResult, shellOutput: undefined }
                : m
            ))
          }
          break

        case 'shell_output':
          if (event.shellOutput) {
            const { toolCallId, stream, data } = event.shellOutput
            const prev = shellOutputs.current.get(toolCallId) || { stdout: '', stderr: '' }
            if (stream === 'stderr') {
              prev.stderr += data
            } else {
              prev.stdout += data
            }
            shellOutputs.current.set(toolCallId, prev)
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0
                setMessages(msgs => msgs.map(m =>
                  m.type === 'tool_call' && m.toolCall?.id === toolCallId && !m.toolResult
                    ? { ...m, shellOutput: { ...shellOutputs.current.get(toolCallId)! } }
                    : m
                ))
              })
            }
          }
          break

        case 'done': {
          clearStreamTimeout()
          setStreaming(false)
          const finalContent = streamBuf.current
          streamBuf.current = ''
          thinkingBuf.current = ''
          pendingToolCalls.current.clear()
          shellOutputs.current.clear()
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
          setMessages(prev => {
            // First, mark any pending tool_calls as completed
            const cleaned = prev.map(m =>
              m.type === 'tool_call' && !m.toolResult
                ? { ...m, toolResult: { tool_call_id: m.toolCall!.id, content: t('apps.aiChat.chat.completed'), is_error: false }, shellOutput: undefined }
                : m
            )
            const lastAssistantIdx = cleaned.findLastIndex(m => m.type === 'assistant')
            // Check if there are tool_call blocks after the last assistant message.
            // If so, the finalContent belongs to a NEW assistant turn (the summary after tools),
            // not the old one before tools. We must append a new block instead of overwriting.
            const hasToolCallAfter = lastAssistantIdx >= 0 && cleaned.slice(lastAssistantIdx + 1).some(m => m.type === 'tool_call')

            if (lastAssistantIdx >= 0 && !hasToolCallAfter) {
              // The last assistant block is already after all tool calls — safe to update in place
              const updated = [...cleaned]
              updated[lastAssistantIdx] = {
                ...updated[lastAssistantIdx],
                content: finalContent || updated[lastAssistantIdx].content,
                usage: event.usage,
              }
              return updated
            }
            if (finalContent) {
              // Either no assistant block exists, or the existing one is before tool calls
              // (rAF was cancelled before it could create the post-tool assistant message)
              return [...cleaned, {
                id: `msg-${Date.now()}`,
                type: 'assistant' as const,
                content: finalContent,
                timestamp: Date.now(),
                usage: event.usage,
              }]
            }
            if (lastAssistantIdx >= 0) {
              // No new content but we have an old assistant block — just attach usage
              const updated = [...cleaned]
              updated[lastAssistantIdx] = { ...updated[lastAssistantIdx], usage: event.usage }
              return updated
            }
            // No content at all — reload from DB as fallback
            const cid = convIdRef.current
            if (cid) {
              request('chat.messages', { conversationId: cid }).then((data: any) => {
                if (!Array.isArray(data)) return
                const blocks: MessageBlock[] = []
                for (const m of data) {
                  const role = m.Role || m.role
                  const content = m.Content || m.content || ''
                  if (role === 'user') {
                    blocks.push({ id: `h-${m.ID || m.id}`, type: 'user', content, timestamp: m.CreatedAt || m.created_at || 0 })
                  } else if (role === 'assistant') {
                    const thinking = m.Thinking || m.thinking || ''
                    if (thinking) {
                      blocks.push({ id: `ht-${m.ID || m.id}`, type: 'thinking', content: thinking, timestamp: m.CreatedAt || m.created_at || 0 })
                    }
                    if (content) {
                      const usageRaw = m.TokenUsage || m.token_usage
                      let u: TokenUsage | undefined
                      if (usageRaw) { try { u = typeof usageRaw === 'string' ? JSON.parse(usageRaw) : usageRaw } catch { /* */ } }
                      blocks.push({ id: `h-${m.ID || m.id}`, type: 'assistant', content, timestamp: m.CreatedAt || m.created_at || 0, usage: u })
                    }
                  }
                }
                if (blocks.length > 0) setMessages(blocks)
              }).catch(() => {})
            }
            return cleaned
          })
          loadConversations()
          break
        }

        case 'error':
          clearStreamTimeout()
          setStreaming(false)
          streamBuf.current = ''
          thinkingBuf.current = ''
          pendingToolCalls.current.clear()
          shellOutputs.current.clear()
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          if (thinkingRafRef.current) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = 0 }
          setMessages(prev => [
            ...prev.map(m =>
              m.type === 'tool_call' && !m.toolResult
                ? { ...m, toolResult: { tool_call_id: m.toolCall!.id, content: t('apps.aiChat.chat.interrupted'), is_error: true }, shellOutput: undefined }
                : m
            ),
            {
              id: `err-${Date.now()}`,
              type: 'error' as const,
              content: event.error || t('apps.aiChat.chat.unknownError'),
              timestamp: Date.now(),
            },
          ])
          break

        case 'command_result':
          clearStreamTimeout()
          setStreaming(false)
          if (event.commandResult) {
            if (event.commandResult.clearHistory) {
              convIdRef.current = ''
              setConvId('')
              setMessages([])
              loadConversations()
            } else {
              setMessages(prev => [...prev, {
                id: `cmd-${Date.now()}`,
                type: event.commandResult!.isError ? 'error' : 'command',
                content: event.commandResult!.text,
                timestamp: Date.now(),
              }])
            }
            setConfigVer(v => v + 1)
          }
          break

        case 'ui_action':
          if (event.uiAction) {
            const { action, params } = event.uiAction
            switch (action) {
              case 'open_app':
                if (params.appId) {
                  const options = (params.options || {}) as Record<string, unknown>
                  useWindowStore.getState().openWindow(params.appId, {
                    forceNew: true,
                    appDataOptions: options,
                  })
                }
                break
              case 'open_path':
                if (params.path) {
                  if (params.pathType === 'directory') {
                    useWindowStore.getState().openWindow('fileManager', {
                      forceNew: true,
                      appDataOptions: { initialPath: params.path, nodeId: params.nodeId },
                    })
                  } else {
                    const ext = params.path.includes('.') ? '.' + params.path.split('.').pop()! : ''
                    const name = params.path.split('/').pop() || params.path
                    useEditorStore.getState().findOrCreateEditorWindow({
                      name,
                      path: params.path,
                      isDir: false,
                      size: 0,
                      extension: ext,
                      modifiedTime: '',
                      nodeId: params.nodeId,
                    })
                  }
                }
                break
            }
          }
          break

        case 'chat.busy':
          if (event.busyInfo) {
            setMessages(prev => [...prev, {
              id: `busy-${Date.now()}`,
              type: 'error',
              content: event.busyInfo!.hint,
              timestamp: Date.now(),
            }])
          }
          break

      }
    })
    return () => {
      unsub()
      clearStreamTimeout()
    }
  }, [loadConversations, resetStreamTimeout, clearStreamTimeout])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    const isCommand = text.startsWith('/')
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: Date.now(),
    }])
    setInput('')
    setShowCommands(false)
    if (!isCommand) {
      setStreaming(true)
      streamBuf.current = ''
      thinkingBuf.current = ''
      resetStreamTimeout()
    }

    const ensureConversationReady = async (): Promise<boolean> => {
      if (isCommand) return true

      if (ensureConvPromiseRef.current) {
        return ensureConvPromiseRef.current
      }

      const promise = (async () => {
        // New chat: create & activate a new conversation first, wait until conv id is actually bound
        if (!convIdRef.current) {
          return await new Promise<boolean>(resolve => {
            let settled = false
            let timeout: ReturnType<typeof setTimeout> | undefined
            const finish = (ok: boolean) => {
              if (settled) return
              settled = true
              if (timeout) clearTimeout(timeout)
              unsub()
              resolve(ok)
            }
            const unsub = onChatEvent(ev => {
              if (ev.type === 'chat.conv_switched' && ev.convSwitched?.convId) {
                const newId = ev.convSwitched.convId
                convIdRef.current = newId
                setConvId(newId)
                setActiveConvId(newId)
                finish(true)
                return
              }
              if (ev.type === 'command_result' && ev.commandResult?.isError) {
                setStreaming(false)
                clearStreamTimeout()
                setMessages(prev => [...prev, {
                  id: `sys-${Date.now()}`,
                  type: 'error',
                  content: ev.commandResult!.text,
                  timestamp: Date.now(),
                }])
                finish(false)
              }
            })
            timeout = setTimeout(() => {
              setStreaming(false)
              clearStreamTimeout()
              setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                type: 'error',
                content: t('apps.aiChat.chat.createConversationTimeout'),
                timestamp: Date.now(),
              }])
              finish(false)
            }, 5000)
            chatSend('', '/conv new')
          })
        }

        // Viewing a non-active conversation: switch backend active conv before sending,
        // and wait until the switch is actually confirmed.
        if (convIdRef.current && convIdRef.current !== activeConvId) {
          const targetId = convIdRef.current
          return await new Promise<boolean>(resolve => {
            let settled = false
            let timeout: ReturnType<typeof setTimeout> | undefined
            const finish = (ok: boolean) => {
              if (settled) return
              settled = true
              if (timeout) clearTimeout(timeout)
              unsub()
              resolve(ok)
            }
            const unsub = onChatEvent(ev => {
              if (ev.type === 'chat.conv_switched' && ev.convSwitched?.convId === targetId) {
                setActiveConvId(targetId)
                finish(true)
                return
              }
              if (ev.type === 'command_result' && ev.commandResult?.isError) {
                setStreaming(false)
                clearStreamTimeout()
                setMessages(prev => [...prev, {
                  id: `sys-${Date.now()}`,
                  type: 'error',
                  content: ev.commandResult!.text,
                  timestamp: Date.now(),
                }])
                finish(false)
              }
            })
            timeout = setTimeout(() => {
              setStreaming(false)
              clearStreamTimeout()
              setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                type: 'error',
                content: t('apps.aiChat.chat.switchConversationTimeout'),
                timestamp: Date.now(),
              }])
              finish(false)
            }, 5000)
            chatSend('', `/conv switch ${targetId}`)
          })
        }

        return true
      })()

      ensureConvPromiseRef.current = promise
      try {
        return await promise
      } finally {
        if (ensureConvPromiseRef.current === promise) {
          ensureConvPromiseRef.current = null
        }
      }
    }

    const ready = await ensureConversationReady()
    if (!ready) return

    chatSend(convIdRef.current || '', text)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
        inputRef.current.style.overflow = 'hidden'
        inputRef.current.focus()
      }
    }, 50)
  }

  const handleNewChat = () => {
    convIdRef.current = ''
    setConvId('')
    setMessages([])
    streamBuf.current = ''
    thinkingBuf.current = ''
    pendingToolCalls.current.clear()
  }

  const handleSelectConversation = async (id: string) => {
    convIdRef.current = id
    setConvId(id)
    setMessages([])
    streamBuf.current = ''
    thinkingBuf.current = ''
    await loadConversationMessages(id)
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      await request('chat.delete', { conversationId: id })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (id === convId) handleNewChat()
    } catch { /* ignore */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && commands.length > 0) {
      const query = input.slice(1).toLowerCase()
      const filtered = commands.filter(c =>
        c.Name.includes(query) ||
        (c.Aliases || []).some(a => a.includes(query)) ||
        c.Description.includes(query)
      )
      if (filtered.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setCmdIndex(i => (i - 1 + filtered.length) % filtered.length)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setCmdIndex(i => (i + 1) % filtered.length)
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          const cmd = filtered[cmdIndex]
          if (cmd) {
            setInput(`/${cmd.Name} `)
            setShowCommands(false)
          }
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommands(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    if (value.startsWith('/') && !value.includes('\n')) {
      setShowCommands(true)
      setCmdIndex(0)
    } else {
      setShowCommands(false)
    }
  }

  const handleCommandSelect = (cmd: CommandDef) => {
    const hasArgs = cmd.Args && cmd.Args.length > 0
    if (hasArgs) {
      setInput(`/${cmd.Name} `)
      setShowCommands(false)
      inputRef.current?.focus()
    } else {
      setInput(`/${cmd.Name}`)
      setShowCommands(false)
      setTimeout(() => {
        chatSend('', `/${cmd.Name}`)
        setMessages(prev => [...prev, {
          id: `user-${Date.now()}`,
          type: 'user',
          content: `/${cmd.Name}`,
          timestamp: Date.now(),
        }])
        setInput('')
      }, 0)
    }
  }

  const dragCounter = useRef(0)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (dragCounter.current === 1) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)

    const jsonData = e.dataTransfer.getData('application/json')
    if (!jsonData) return

    try {
      const raw = JSON.parse(jsonData)
      const items = Array.isArray(raw) ? raw : [raw]
      const refs = items
        .filter((f: any) => f.path && f.nodeId)
        .map((f: any) => `[${f.isDir ? t('apps.aiChat.chat.dirRef') : t('apps.aiChat.chat.fileRef')}: ${f.nodeId}:${f.path}]`)

      if (refs.length > 0) {
        setInput(prev => {
          const sep = prev && !prev.endsWith('\n') && !prev.endsWith(' ') ? ' ' : ''
          return prev + sep + refs.join(' ')
        })
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } catch { /* ignore invalid data */ }
  }

  return (
    <div className="h-full flex bg-white relative">
      {showSidebar && (
        <Sidebar
          conversations={conversations}
          activeId={convId || activeConvId}
          onSelect={id => { handleSelectConversation(id); setShowSidebar(false) }}
          onNew={() => { handleNewChat(); setShowSidebar(false) }}
          onDelete={handleDeleteConversation}
        />
      )}

      {showConfig && <ConfigPanel onClose={(saved) => { setShowConfig(false); if (saved) setConfigVer(v => v + 1) }} />}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="relative flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title={t('apps.aiChat.chat.sidebar')}
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Bot className="h-4.5 w-4.5 text-violet-500" />
          <ModelSwitcher configVer={configVer} />
          <div className="absolute left-1/2 -translate-x-1/2">
            {(executorStatus.state === 'running' || executorStatus.state === 'tool_executing' || !!commandProgress) ? (
              <span className="relative flex h-2.5 w-2.5" title={t('apps.aiChat.chat.busy')}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" title={t('apps.aiChat.chat.idle')} />
            )}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowConfig(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title={t('apps.aiChat.chat.config')}
          >
            <Settings2 className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Status bar — only visible when busy */}
        {(executorStatus.state === 'running' || executorStatus.state === 'tool_executing' || !!commandProgress) && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50/80 text-xs">
            {(executorStatus.state === 'running' || executorStatus.state === 'tool_executing') && (
              <span className="inline-flex items-center gap-1.5 text-amber-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                {executorStatus.state === 'running' ? t('apps.aiChat.chat.responding') : t('apps.aiChat.chat.executing')}「{executorStatus.runningConvTitle}」
                {executorStatus.queueSize > 0 && ` · ${t('apps.aiChat.chat.queue', { count: executorStatus.queueSize })}`}
              </span>
            )}
            {commandProgress && (
              <span className="inline-flex items-center gap-1.5 text-blue-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                {t('apps.aiChat.chat.commandProgressPrefix')}{commandProgress === 'compress' ? t('apps.aiChat.chat.compressingConversation') : t('apps.aiChat.chat.executingCommand')}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
              <Bot className="h-12 w-12" />
              <p className="text-sm">{t('apps.aiChat.chat.emptyState')}</p>
            </div>
          )}

          {messages.map(msg => {
            if (msg.type === 'user') {
              return <UserMessage key={msg.id} content={msg.content} />
            }

            if (msg.type === 'assistant') {
              if (!msg.content.trim()) return null
              return <AssistantMessage key={msg.id} content={msg.content} usage={msg.usage} />
            }

            if (msg.type === 'thinking') {
              return (
                <div key={msg.id} className="px-2">
                  <ThinkingBlock content={msg.content} isStreaming={streaming && msg === messages[messages.length - 1]} />
                </div>
              )
            }

            if (msg.type === 'tool_call' && msg.toolCall) {
              return (
                <div key={msg.id} className="px-2">
                  <ToolCallBlock call={msg.toolCall} result={msg.toolResult} shellOutput={msg.shellOutput} />
                </div>
              )
            }

            if (msg.type === 'error') {
              return <ErrorMessage key={msg.id} content={msg.content} />
            }

            if (msg.type === 'command') {
              return <CommandMessage key={msg.id} content={msg.content} />
            }

            return null
          })}

        </div>

        {/* Input */}
        <div
          className="px-3 pb-3 pt-1 relative"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {showCommands && commands.length > 0 && (
            <CommandAutocomplete
              commands={commands}
              filter={input}
              onSelect={handleCommandSelect}
              selectedIndex={cmdIndex}
            />
          )}
          <div className={`flex items-end gap-2 bg-slate-50 rounded-xl border px-3 py-2 transition-all ${
            isDragging
              ? 'border-violet-400 ring-2 ring-violet-300 bg-violet-50/50'
              : 'border-slate-200 focus-within:ring-2 focus-within:ring-violet-300 focus-within:border-violet-300'
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              placeholder={t('apps.aiChat.chat.inputPlaceholder')}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none max-h-32 min-h-[1.5rem]"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                t.style.overflow = t.scrollHeight > 128 ? 'auto' : 'hidden'
              }}
              disabled={showConfig}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              title={t('apps.aiChat.chat.send')}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
