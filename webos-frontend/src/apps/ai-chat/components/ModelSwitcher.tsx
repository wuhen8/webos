import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { request } from '@/stores/webSocketStore'

interface AIProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  apiFormat?: 'openai' | 'anthropic'
}

interface AIMultiConfig {
  providers: AIProvider[]
  activeProvider: string
  activeModel: string
  maxTokens: number
  maxInputTokens: number
  maxToolRounds: number
  skillsDir: string
  rpm: number
  recentMessages: number
}

export function ModelSwitcher({ configVer }: { configVer: number }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<AIMultiConfig | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    request('config.get', { key: 'ai_config' }).then((data: any) => {
      const value = data?.value
      if (value) {
        const raw = typeof value === 'string' ? JSON.parse(value) : value
        if (raw.providers) setCfg(raw as AIMultiConfig)
      }
    }).catch(() => {})
  }, [configVer])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!cfg || cfg.providers.length === 0) return null

  const activeP = cfg.providers.find(p => p.id === cfg.activeProvider) || cfg.providers[0]
  const label = `${activeP.name || activeP.id} / ${cfg.activeModel || '?'}`

  const handleSelect = async (providerId: string, model: string) => {
    const updated = { ...cfg, activeProvider: providerId, activeModel: model }
    setCfg(updated)
    setOpen(false)
    try {
      await request('config.set', {
        key: 'ai_config',
        value: JSON.stringify(updated)
      })
    } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:bg-slate-100 transition-colors max-w-[200px]"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20 max-h-64 overflow-auto">
          {cfg.providers.map(p => (
            <div key={p.id}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{p.name || p.id}</div>
              {p.models.map(m => (
                <button
                  key={`${p.id}-${m}`}
                  onClick={() => handleSelect(p.id, m)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 transition-colors ${
                    p.id === cfg.activeProvider && m === cfg.activeModel ? 'text-violet-600 bg-violet-50 font-medium' : 'text-slate-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
