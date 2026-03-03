import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { loadSnippets, saveSnippets, type ShellSnippet } from './snippets'

export default function SnippetManager() {
  const [snippets, setSnippets] = useState<ShellSnippet[]>(loadSnippets)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')

  const add = () => {
    const n = name.trim()
    const c = command.trim()
    if (!n || !c) return
    const next = [...snippets, { id: `snip-${Date.now()}`, name: n, command: c }]
    setSnippets(next)
    saveSnippets(next)
    setName('')
    setCommand('')
  }

  const remove = (id: string) => {
    const next = snippets.filter((s) => s.id !== id)
    setSnippets(next)
    saveSnippets(next)
  }

  return (
    <div className="h-full flex flex-col text-slate-700">
      {/* Add form */}
      <div className="p-3 border-b border-white/20 flex flex-col gap-2">
        <div className="text-xs text-slate-500">添加快捷命令，将显示在终端工具栏中</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称，如：查看日志"
          className="w-full px-2 py-1.5 text-sm bg-white/20 border border-white/30 rounded text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30"
        />
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="命令，如：tail -f /var/log/syslog"
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          className="w-full px-2 py-1.5 text-sm bg-white/20 border border-white/30 rounded text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30 font-mono"
        />
        <button
          onClick={add}
          className="w-full py-1.5 text-sm rounded bg-blue-500/80 text-white font-medium hover:bg-blue-500 transition-colors"
        >
          添加
        </button>
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {snippets.length === 0 && (
          <div className="px-3 py-8 text-sm text-slate-400 text-center">暂无自定义命令</div>
        )}
        {snippets.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-3 py-2 border-b border-white/10 hover:bg-white/10 group"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-700 truncate">{s.name}</div>
              <div className="text-xs text-slate-500 font-mono truncate">{s.command}</div>
            </div>
            <button
              onClick={() => remove(s.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/20 rounded transition-all shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
