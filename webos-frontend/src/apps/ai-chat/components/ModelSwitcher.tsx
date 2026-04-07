import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { request } from '@/stores/webSocketStore'

interface AIProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  apiFormat?: 'openai' | 'anthropic' | 'responses'
}

interface ConversationConfig {
  conversationId?: string
  providers: AIProvider[]
  providerId: string
  model: string
  draft: boolean
}

interface ModelSwitcherProps {
  conversationId: string
  configVer: number
  draftConfig: { providerId: string; model: string } | null
  onDraftConfigChange: (cfg: { providerId: string; model: string }) => void
}

export function ModelSwitcher({ conversationId, configVer, draftConfig, onDraftConfigChange }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<ConversationConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    request('chat.conversation_config_get', { conversationId }).then((data: any) => {
      if (cancelled) return
      if (data?.providers) {
        const nextCfg: ConversationConfig = {
          conversationId: data.conversationId,
          providers: Array.isArray(data.providers) ? data.providers : [],
          providerId: draftConfig?.providerId || data.providerId || '',
          model: draftConfig?.model || data.model || '',
          draft: !conversationId,
        }
        setCfg(nextCfg)
      } else {
        setCfg(null)
      }
    }).catch(() => {
      if (!cancelled) setCfg(null)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [conversationId, configVer, draftConfig?.providerId, draftConfig?.model])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (loading || !cfg || cfg.providers.length === 0) return null

  const selectedProvider = cfg.providers.find(p => p.id === cfg.providerId) || cfg.providers[0]
  const selectedModel = cfg.model || selectedProvider.models[0] || '?'
  const label = `${selectedProvider.name || selectedProvider.id} / ${selectedModel}`

  const handleSelect = async (providerId: string, model: string) => {
    const updated = { ...cfg, providerId, model }
    setCfg(updated)
    setOpen(false)
    if (!conversationId) {
      onDraftConfigChange({ providerId, model })
      return
    }
    try {
      const data = await request('chat.conversation_config_set', {
        conversationId,
        providerId,
        model,
      })
      if (data?.providers) {
        setCfg({
          conversationId: data.conversationId,
          providers: Array.isArray(data.providers) ? data.providers : cfg.providers,
          providerId: data.providerId || providerId,
          model: data.model || model,
          draft: false,
        })
      }
    } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:bg-slate-100 transition-colors max-w-[220px]"
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
                    p.id === selectedProvider.id && m === selectedModel ? 'text-violet-600 bg-violet-50 font-medium' : 'text-slate-600'
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
