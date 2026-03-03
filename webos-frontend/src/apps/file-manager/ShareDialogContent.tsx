import { useState } from 'react'
import { Copy, Check, Link, Loader2 } from 'lucide-react'
import { request as wsRequest } from '@/stores/webSocketStore'
import { getOrigin } from '@/lib/env'
import { copyToClipboard } from '@/utils'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'

const EXPIRY_OPTIONS = [
  { label: '永不过期', value: 0 },
  { label: '1 天', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '30 天', value: 2592000 },
]

type NetworkMode = 'internal' | 'external'

export default function ShareDialogContent({ windowId }: { windowId: string }) {
  const { procState } = useCurrentProcess(windowId)
  const appData = procState as { nodeId?: string; path?: string; fileName?: string }

  const [expiry, setExpiry] = useState(0)
  const [networkMode, setNetworkMode] = useState<NetworkMode>('external')
  const [token, setToken] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const internalUrl = token ? `${getOrigin()}/api/share/${token}` : ''
  const displayUrl = networkMode === 'external' ? externalUrl : internalUrl
  const hasExternal = !!externalUrl

  const handleCreate = async () => {
    if (!appData.nodeId || !appData.path) return
    setLoading(true)
    setError('')
    setToken('')
    setExternalUrl('')
    try {
      const result = await wsRequest('share_create', {
        nodeId: appData.nodeId,
        path: appData.path,
        expireSeconds: expiry,
      })
      if (result?.token) {
        setToken(result.token)
        if (result.url) {
          setExternalUrl(result.url)
        } else {
          setNetworkMode('internal')
        }
      } else {
        setError(result?.message || '创建分享链接失败')
      }
    } catch (e: any) {
      setError(e?.message || '创建分享链接失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!displayUrl) return
    await copyToClipboard(displayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedBtn = 'bg-blue-500 !border-blue-500 text-white shadow-sm'
  const unselectedBtn = 'bg-white !border-gray-200 text-gray-500 hover:bg-gray-50'

  return (
    <div className="flex flex-col h-full p-4 gap-3 select-none">
      {/* File name */}
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <Link className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="truncate font-medium">{appData.fileName || '未知文件'}</span>
      </div>

      {/* Network mode selector */}
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">链接类型</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => { setNetworkMode('external'); setCopied(false) }}
            className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${
              networkMode === 'external' ? selectedBtn : unselectedBtn
            }`}
          >
            外网链接
          </button>
          <button
            onClick={() => { setNetworkMode('internal'); setCopied(false) }}
            className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${
              networkMode === 'internal' ? selectedBtn : unselectedBtn
            }`}
          >
            内网链接
          </button>
        </div>
      </div>

      {/* Expiry selector */}
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">有效期</label>
        <div className="grid grid-cols-4 gap-1.5">
          {EXPIRY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setExpiry(opt.value); setToken(''); setExternalUrl(''); setError(''); setCopied(false) }}
              className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${
                expiry === opt.value ? selectedBtn : unselectedBtn
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Create button */}
      {!token && (
        <button
          onClick={handleCreate}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
          {loading ? '生成中...' : '生成分享链接'}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Share URL result */}
      {token && (
        <div className="flex flex-col gap-2">
          {networkMode === 'external' && !hasExternal && (
            <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              未配置外部访问地址，请在存储节点设置中配置 externalHost
            </div>
          )}
          {displayUrl && (
            <>
              <div className="flex items-center gap-2">
                <input
                  data-share-url
                  readOnly
                  value={displayUrl}
                  className="flex-1 h-8 px-3 rounded-lg border border-gray-200 text-xs text-slate-700 bg-gray-50 focus:outline-none"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border transition-all flex-shrink-0 ${
                    copied
                      ? 'bg-green-500 !border-green-500 text-white'
                      : 'bg-blue-500 !border-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <p className="text-[0.6875rem] text-slate-400">
                {expiry === 0 ? '此链接永不过期' : `此链接将在 ${EXPIRY_OPTIONS.find(o => o.value === expiry)?.label}后过期`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
