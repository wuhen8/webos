import i18n from '@/i18n'
import { Terminal, FileText, FolderOpen, Download, Upload, Pencil, Trash2, AppWindow } from 'lucide-react'
import type { ToolCall, ToolResult, TokenUsage } from '../chatService'

// ── Types ──

export interface MessageBlock {
  id: string
  type: 'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'command'
  content: string
  toolCall?: ToolCall
  toolResult?: ToolResult
  shellOutput?: { stdout: string; stderr: string }
  timestamp: number
  usage?: TokenUsage
}

export interface Conversation {
  id: string
  title: string
  providerId?: string
  model?: string
}

export interface CommandDef {
  Name: string
  Aliases: string[]
  Description: string
  Category: string
  CategoryLabel: string
  CategoryOrder: number
  Args: string
}

// ── Tool display helpers ──

export const toolMeta: Record<string, { icon: typeof Terminal; label: string; color: string }> = {
  shell:                { icon: Terminal,  label: 'Shell',                                     color: 'text-gray-700 bg-gray-50 border-gray-300' },
  execute_code:         { icon: Terminal,  label: i18n.t('apps.aiChat.tools.executeCode'),     color: 'text-amber-600 bg-amber-50 border-amber-200' },
  read_file:            { icon: FileText,  label: i18n.t('apps.aiChat.tools.readFile'),        color: 'text-blue-600 bg-blue-50 border-blue-200' },
  write_file:           { icon: FileText,  label: i18n.t('apps.aiChat.tools.writeFile'),       color: 'text-green-600 bg-green-50 border-green-200' },
  edit_file:            { icon: Pencil,    label: i18n.t('apps.aiChat.tools.editFile'),        color: 'text-orange-600 bg-orange-50 border-orange-200' },
  undo_file:            { icon: Trash2,    label: i18n.t('apps.aiChat.tools.undoFile'),        color: 'text-red-600 bg-red-50 border-red-200' },
  list_files:           { icon: FolderOpen,label: i18n.t('apps.aiChat.tools.listFiles'),       color: 'text-purple-600 bg-purple-50 border-purple-200' },
  download_to_sandbox:  { icon: Download,  label: i18n.t('apps.aiChat.tools.downloadToSandbox'), color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  upload_from_sandbox:  { icon: Upload,    label: i18n.t('apps.aiChat.tools.uploadFromSandbox'), color: 'text-teal-600 bg-teal-50 border-teal-200' },
  open_ui:              { icon: AppWindow, label: i18n.t('apps.aiChat.tools.openUi'),          color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
}

export function formatJSON(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
