import { X } from 'lucide-react'
import type { Conversation } from './types'

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete }: {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="w-48 border-r border-slate-200 flex flex-col bg-slate-50/80">
      <div className="p-2">
        <button
          onClick={onNew}
          className="w-full px-3 py-1.5 rounded-lg text-xs font-medium text-violet-600 hover:bg-violet-50 border border-violet-200 transition-colors"
        >
          + 新建对话
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {conversations.map(c => (
          <div
            key={c.id}
            className={`group flex items-center px-3 py-2 text-xs cursor-pointer transition-colors ${
              c.id === activeId ? 'bg-violet-100 text-violet-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => onSelect(c.id)}
          >
            <span className="truncate flex-1">{c.title || '新对话'}</span>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 transition-opacity"
              onClick={e => { e.stopPropagation(); onDelete(c.id) }}
            >
              <X className="h-3 w-3 text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
