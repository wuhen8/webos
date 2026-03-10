import { useState, useEffect } from 'react'
import { Settings2, X, Plus, Trash2, Loader2, Check } from 'lucide-react'
import { request } from '@/stores/webSocketStore'

interface AIProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  apiFormat?: 'openai' | 'anthropic' | 'responses'
  proxy?: string
  maxTokens?: number
  maxInputTokens?: number
  maxToolRounds?: number
  rpm?: number
  recentMessages?: number
}

interface AIMultiConfig {
  providers: AIProvider[]
  activeProvider: string
  activeModel: string
}

function newProvider(): AIProvider {
  return { id: `p-${Date.now()}`, name: '', baseUrl: '', apiKey: '', models: [''] }
}

function emptyMultiConfig(): AIMultiConfig {
  return { providers: [newProvider()], activeProvider: '', activeModel: '' }
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
      />
    </div>
  )
}

export function ConfigPanel({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [cfg, setCfg] = useState<AIMultiConfig>(emptyMultiConfig)
  const [activeTab, setActiveTab] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    request('config.get', { key: 'ai_config' }).then((data: any) => {
      const value = data?.value
      if (value) {
        const raw = typeof value === 'string' ? JSON.parse(value) : value
        if (raw.providers) {
          setCfg(raw as AIMultiConfig)
        }
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const provider = cfg.providers[activeTab]

  const updateProvider = (patch: Partial<AIProvider>) => {
    setCfg(prev => {
      const providers = [...prev.providers]
      providers[activeTab] = { ...providers[activeTab], ...patch }
      return { ...prev, providers }
    })
  }

  const addProvider = () => {
    setCfg(prev => ({ ...prev, providers: [...prev.providers, newProvider()] }))
    setActiveTab(cfg.providers.length)
  }

  const removeProvider = (idx: number) => {
    if (cfg.providers.length <= 1) return
    setCfg(prev => {
      const providers = prev.providers.filter((_, i) => i !== idx)
      return { ...prev, providers }
    })
    if (activeTab >= cfg.providers.length - 1) setActiveTab(Math.max(0, activeTab - 1))
  }

  const updateModel = (mIdx: number, val: string) => {
    const models = [...provider.models]
    models[mIdx] = val
    updateProvider({ models })
  }

  const addModel = () => updateProvider({ models: [...provider.models, ''] })

  const removeModel = (mIdx: number) => {
    if (provider.models.length <= 1) return
    updateProvider({ models: provider.models.filter((_, i) => i !== mIdx) })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const cleaned: AIMultiConfig = {
        ...cfg,
        providers: cfg.providers.map(p => ({
          ...p,
          models: p.models.filter(m => m.trim() !== '')
        }))
      }
      if (!cleaned.activeProvider && cleaned.providers.length > 0) {
        cleaned.activeProvider = cleaned.providers[0].id
      }
      if (!cleaned.activeModel) {
        const ap = cleaned.providers.find(p => p.id === cleaned.activeProvider)
        if (ap && ap.models.length > 0) cleaned.activeModel = ap.models[0]
      }
      await request('config.set', {
        key: 'ai_config',
        value: JSON.stringify(cleaned)
      })
      onClose(true)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="p-4 text-center text-sm text-slate-400">加载中...</div>

  return (
    <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Settings2 className="h-4 w-4" />
          AI 配置
        </div>
        <button onClick={() => onClose()} className="p-1 rounded hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Left: provider tabs */}
        <div className="w-36 border-r border-slate-200 flex flex-col bg-slate-50/80">
          <div className="flex-1 overflow-auto">
            {cfg.providers.map((p, i) => (
              <div
                key={p.id}
                className={`group flex items-center px-3 py-2 text-xs cursor-pointer transition-colors ${
                  i === activeTab ? 'bg-violet-100 text-violet-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setActiveTab(i)}
              >
                <span className="truncate flex-1">{p.name || '未命名'}</span>
                {cfg.providers.length > 1 && (
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 transition-opacity"
                    onClick={e => { e.stopPropagation(); removeProvider(i) }}
                  >
                    <X className="h-3 w-3 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-slate-200">
            <button onClick={addProvider} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-violet-600 hover:bg-violet-50 border border-violet-200">
              <Plus className="h-3 w-3" /> 添加供应商
            </button>
          </div>
        </div>

        {/* Right: provider detail */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {provider && (
            <>
              <Field label="供应商名称" value={provider.name} onChange={v => updateProvider({ name: v })} placeholder="DeepSeek" />
              <Field label="API 地址" value={provider.baseUrl} onChange={v => updateProvider({ baseUrl: v })} placeholder="https://api.deepseek.com" />
              <Field label="API Key" value={provider.apiKey} onChange={v => updateProvider({ apiKey: v })} placeholder="sk-..." type="password" />
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">API 类型</label>
                <div className="flex gap-2">
                  {(['openai', 'anthropic', 'responses'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => updateProvider({ apiFormat: fmt })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        (provider.apiFormat || 'openai') === fmt
                          ? 'bg-violet-100 border-violet-300 text-violet-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {fmt === 'openai' ? 'OpenAI 兼容' : fmt === 'anthropic' ? 'Anthropic' : 'Responses API'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">模型列表</label>
                <div className="space-y-1.5">
                  {provider.models.map((m, mi) => (
                    <div key={mi} className="flex items-center gap-1.5">
                      <input
                        value={m}
                        onChange={e => updateModel(mi, e.target.value)}
                        placeholder="model-name"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                      />
                      {provider.models.length > 1 && (
                        <button onClick={() => removeModel(mi)} className="p-1 rounded hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addModel} className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 mt-1">
                    <Plus className="h-3 w-3" /> 添加模型
                  </button>
                </div>
              </div>
              <hr className="border-slate-200" />
              <div className="text-xs font-medium text-slate-600 mb-2">供应商配置</div>
              <Field label="代理地址（可选）" value={provider.proxy || ''} onChange={v => updateProvider({ proxy: v })} placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080" />
              <Field label="最大输出 Tokens" value={String(provider.maxTokens || 4096)} onChange={v => updateProvider({ maxTokens: parseInt(v) || 4096 })} placeholder="4096" />
              <Field label="最大输入 Tokens" value={String(provider.maxInputTokens || 128000)} onChange={v => updateProvider({ maxInputTokens: parseInt(v) || 128000 })} placeholder="128000" />
              <Field label="最大工具调用轮次" value={String(provider.maxToolRounds || 25)} onChange={v => updateProvider({ maxToolRounds: parseInt(v) || 25 })} placeholder="25" />
              <Field label="每分钟请求数 (RPM)" value={String(provider.rpm || 10)} onChange={v => updateProvider({ rpm: parseInt(v) || 10 })} placeholder="10" />
              <Field label="保留最近消息数" value={String(provider.recentMessages || 5)} onChange={v => updateProvider({ recentMessages: parseInt(v) || 5 })} placeholder="5" />
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-3 border-t">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          保存
        </button>
      </div>
    </div>
  )
}
