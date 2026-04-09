import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Brain, Paperclip } from 'lucide-react'
import type { ToolCall, ToolResult, MediaAttachment } from '../chatService'
import { toolMeta } from './types'

export function ShellResultBlock({ content, isError }: { content: string; isError: boolean }) {
  const { t } = useTranslation()
  let stdout = '', stderr = '', exitCode = 0
  try {
    const parsed = JSON.parse(content)
    stdout = parsed.stdout || parsed.Stdout || ''
    stderr = parsed.stderr || parsed.Stderr || ''
    exitCode = parsed.exit_code ?? parsed.ExitCode ?? 0
  } catch {
    return (
      <pre className="whitespace-pre-wrap break-all bg-gray-900 text-gray-100 rounded p-2 max-h-60 overflow-auto text-xs font-mono">
        {content.length > 2000 ? content.slice(0, 2000) + '\n...' : content}
      </pre>
    )
  }

  return (
    <div className="space-y-1.5">
      {stdout && (
        <pre className="whitespace-pre-wrap break-all bg-gray-900 text-gray-100 rounded p-2 max-h-60 overflow-auto text-xs font-mono">
          {stdout.length > 2000 ? stdout.slice(0, 2000) + '\n...' : stdout}
        </pre>
      )}
      {stderr && (
        <pre className="whitespace-pre-wrap break-all bg-gray-900 text-red-400 rounded p-2 max-h-60 overflow-auto text-xs font-mono">
          {stderr.length > 2000 ? stderr.slice(0, 2000) + '\n...' : stderr}
        </pre>
      )}
      {exitCode !== 0 && (
        <div className="text-xs text-red-500">exit code: {exitCode}</div>
      )}
      {!stdout && !stderr && (
        <div className="text-xs opacity-50">{t('apps.aiChat.messageBlocks.noOutput')}</div>
      )}
    </div>
  )
}

function ToolArgsDisplay({ args }: { args: string }) {
  const { t } = useTranslation()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(args)
  } catch {
    return <pre className="whitespace-pre-wrap break-all bg-white/80 rounded p-2 max-h-40 overflow-auto">{args}</pre>
  }

  const entries = Object.entries(parsed)
  if (entries.length === 0) {
    return <div className="text-xs opacity-50">{t('apps.aiChat.messageBlocks.noArgs')}</div>
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const strVal = typeof value === 'string' ? value : JSON.stringify(value)
        return (
          <div key={key}>
            <span className="font-medium text-slate-500">{key}: </span>
            <pre className="mt-0.5 whitespace-pre-wrap break-all bg-gray-900 text-gray-100 rounded p-2 max-h-60 overflow-auto font-mono">
              {strVal.length > 3000 ? strVal.slice(0, 3000) + '\n...' : strVal}
            </pre>
          </div>
        )
      })}
    </div>
  )
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

export function MediaBlock({ attachment }: { attachment: MediaAttachment }) {
  return (
    <div className="my-2 rounded-lg border border-sky-200 bg-sky-50/70 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2 text-sm text-sky-700">
        <Paperclip className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{attachment.fileName || attachment.path}</div>
          <div className="mt-1 text-xs text-sky-600 break-all">{attachment.path}</div>
          <div className="mt-1 text-xs text-sky-500">
            {attachment.mimeType || 'application/octet-stream'} · {formatFileSize(attachment.size)}
          </div>
          {attachment.caption && (
            <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap break-words">{attachment.caption}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ToolCallBlock({ call, result, shellOutput }: { call: ToolCall; result?: ToolResult; shellOutput?: { stdout: string; stderr: string } }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const liveRef = useRef<HTMLDivElement>(null)
  const meta = toolMeta[call.function.name] || { icon: () => null, label: call.function.name, color: 'text-gray-600 bg-gray-50 border-gray-200' }
  const Icon = meta.icon
  const isRunning = !result
  const isError = result?.is_error
  const isGenerating = isRunning && !call.function.arguments
  const isShell = call.function.name === 'shell'
  const hasLiveOutput = isShell && isRunning && shellOutput && (shellOutput.stdout || shellOutput.stderr)

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.scrollTop = liveRef.current.scrollHeight
    }
  }, [shellOutput?.stdout, shellOutput?.stderr])

  let argsSummary = ''
  try {
    const args = JSON.parse(call.function.arguments)
    if (call.function.name === 'shell') {
      argsSummary = args.command || ''
    } else if (call.function.name === 'execute_code') {
      argsSummary = `${args.language || ''}`
    } else {
      argsSummary = args.path || ''
    }
  } catch { /* ignore */ }

  return (
    <div className={`my-2 rounded-lg border ${meta.color} overflow-hidden`}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 shrink-0" />
        ) : (
          <Icon className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{meta.label}</span>
        {isGenerating ? (
          <span className="text-xs opacity-60">{t('apps.aiChat.messageBlocks.generatingArgs')}</span>
        ) : argsSummary ? (
          <span className="text-xs opacity-60 truncate">{argsSummary}</span>
        ) : null}
        <span className="ml-auto shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-xs space-y-2 bg-white/60">
          <div>
            <div className="font-medium mb-1 opacity-60">{t('apps.aiChat.messageBlocks.params')}</div>
            {isGenerating ? (
              <div className="flex items-center gap-2 text-xs opacity-50 py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t('apps.aiChat.messageBlocks.aiGeneratingArgs')}</span>
              </div>
            ) : (
              <ToolArgsDisplay args={call.function.arguments} />
            )}
          </div>
          {result && (
            <div>
              <div className="font-medium mb-1 opacity-60">{t('apps.aiChat.messageBlocks.result')}</div>
              {call.function.name === 'shell' ? (
                <ShellResultBlock content={result.content} isError={!!result.is_error} />
              ) : (
                <pre className="whitespace-pre-wrap break-all bg-white/80 rounded p-2 max-h-60 overflow-auto">
                  {result.content.length > 2000 ? result.content.slice(0, 2000) + '\n...' : result.content}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
      {hasLiveOutput && (
        <div ref={liveRef} className="border-t px-3 py-2 max-h-60 overflow-auto bg-gray-900 rounded-b-lg">
          {shellOutput.stdout && (
            <pre className="whitespace-pre-wrap break-all text-gray-100 text-xs font-mono">{shellOutput.stdout.length > 2000 ? shellOutput.stdout.slice(-2000) : shellOutput.stdout}</pre>
          )}
          {shellOutput.stderr && (
            <pre className="whitespace-pre-wrap break-all text-red-400 text-xs font-mono">{shellOutput.stderr.length > 2000 ? shellOutput.stderr.slice(-2000) : shellOutput.stderr}</pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-2 rounded-lg border border-violet-200 bg-violet-50/50 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-violet-600"
        onClick={() => setExpanded(!expanded)}
      >
        {isStreaming ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-violet-500" />
        ) : (
          <Brain className="h-4 w-4 shrink-0 text-violet-500" />
        )}
        <span>{isStreaming ? t('apps.aiChat.messageBlocks.thinking') : t('apps.aiChat.messageBlocks.thoughtProcess')}</span>
        <span className="ml-auto shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-violet-200 px-3 py-2 text-xs text-slate-600 bg-white/60">
          <pre className="whitespace-pre-wrap break-words max-h-80 overflow-auto leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
