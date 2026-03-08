import { useState, useEffect, useCallback } from "react"
import { Key, Plus, Trash2, Copy, Check, Clock, Eye, EyeOff } from "lucide-react"
import { request as wsRequest } from "@/stores/webSocketStore"
import { copyToClipboard } from "@/utils"
import { SettingsIcon } from "./SettingsIcon"

interface APIToken {
  id: number
  token: string
  name: string
  expiresAt: number
  createdAt: number
}

export default function APITokensTab() {
  const [tokens, setTokens] = useState<APIToken[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [expiryType, setExpiryType] = useState<"never" | "custom">("never")
  const [expiryDays, setExpiryDays] = useState(30)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set())

  const loadTokens = useCallback(async () => {
    setLoading(true)
    try {
      const data = await wsRequest("api_token.list", {})
      setTokens(data || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadTokens() }, [loadTokens])

  const createToken = async () => {
    const expiresIn = expiryType === "never" ? 0 : expiryDays * 86400
    try {
      await wsRequest("api_token.create", { name: newName, expiresIn })
      setNewName("")
      setExpiryType("never")
      setExpiryDays(30)
      setShowCreate(false)
      loadTokens()
    } catch {}
  }

  const deleteToken = async (id: number) => {
    try {
      await wsRequest("api_token.delete", { id })
      loadTokens()
    } catch {}
  }

  const copyToken = async (id: number, token: string) => {
    await copyToClipboard(token)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleVisible = (id: number) => {
    setVisibleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const maskToken = (token: string) => token.slice(0, 8) + "••••••••"

  const formatDate = (ts: number) => {
    if (!ts) return "永不过期"
    const d = new Date(ts * 1000)
    const now = Date.now()
    if (ts * 1000 < now) return "已过期"
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="apiTokens" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">API 令牌</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">管理外部访问令牌，用于通过 HTTP 接口发送 AI 指令</p>
      </div>

      {/* 创建按钮 / 表单 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-[0.8125rem] text-gray-900 font-medium">令牌列表</span>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] text-blue-500 hover:bg-blue-50 rounded-md transition-colors font-medium">
            <Plus className="w-3.5 h-3.5" />创建令牌
          </button>
        </div>

        {showCreate && (
          <div className="mx-4 mb-3 p-3 bg-white rounded-lg border border-blue-200">
            <div className="space-y-2">
              <div>
                <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">备注名称</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：自动化脚本、iOS 快捷指令" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">有效期</label>
                <div className="flex items-center gap-2">
                  <select value={expiryType} onChange={(e) => setExpiryType(e.target.value as "never" | "custom")} className="h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="never">永不过期</option>
                    <option value="custom">自定义天数</option>
                  </select>
                  {expiryType === "custom" && (
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(parseInt(e.target.value) || 1)} className="w-20 h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <span className="text-[0.75rem] text-gray-500">天</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={createToken} className="flex-1 py-1.5 text-[0.75rem] bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-medium">创建</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 text-[0.75rem] bg-white hover:bg-gray-100 text-gray-600 rounded-md border border-gray-200 transition-colors">取消</button>
            </div>
          </div>
        )}

        {/* 令牌列表 */}
        <div className="px-4 pb-3">
          {loading ? (
            <div className="py-8 text-center text-[0.8125rem] text-gray-400">加载中...</div>
          ) : !tokens || tokens.length === 0 ? (
            <div className="py-8 text-center">
              <Key className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-[0.8125rem] text-gray-400">暂无令牌</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Key className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[0.8125rem] text-gray-900 truncate">{t.name || "未命名"}</div>
                      <div className="flex items-center gap-2 text-[0.6875rem] text-gray-400">
                        <code className="font-mono truncate max-w-[16rem]" title={t.token}>{visibleIds.has(t.id) ? t.token : maskToken(t.token)}</code>
                        <button onClick={() => toggleVisible(t.id)} className="p-0.5 hover:bg-gray-100 rounded transition-colors shrink-0" title={visibleIds.has(t.id) ? "隐藏" : "显示"}>
                          {visibleIds.has(t.id) ? <EyeOff className="w-3 h-3 text-gray-400" /> : <Eye className="w-3 h-3 text-gray-400" />}
                        </button>
                        <button onClick={() => copyToken(t.id, t.token)} className="p-0.5 hover:bg-gray-100 rounded transition-colors shrink-0" title="复制令牌">
                          {copiedId === t.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                        </button>
                        <span>·</span>
                        <span className="flex items-center gap-0.5 shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatDate(t.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteToken(t.id)} className="p-1.5 hover:bg-red-50 rounded-md transition-colors shrink-0" title="删除令牌">
                    <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 使用说明 */}
      <div className="mt-4 bg-[#f5f5f7] rounded-xl p-4">
        <h3 className="text-[0.75rem] font-medium text-gray-700 mb-2">使用方法</h3>
        <code className="block text-[0.6875rem] text-gray-600 bg-white rounded-lg p-3 font-mono whitespace-pre-wrap break-all">
{`curl -X POST /api/ai/send \\
  -H "Authorization: Bearer <令牌>" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "你的指令"}'`}
        </code>
      </div>
    </div>
  )
}
