import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Trash2, RefreshCw, Link, Loader2 } from 'lucide-react'
import { request as wsRequest } from '@/stores/webSocketStore'
import { getOrigin } from '@/lib/env'
import { copyToClipboard } from '@/utils'

interface ShareLink {
  token: string
  nodeId: string
  path: string
  filename: string
  createdAt: number
  expiresAt?: number
  url?: string
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function expiryLabel(link: ShareLink, t: ReturnType<typeof useTranslation>['t']) {
  if (!link.expiresAt) return t('apps.fileManager.shareManager.neverExpires')
  const now = Date.now() / 1000
  if (now > link.expiresAt) return t('apps.fileManager.shareManager.expired')
  const diff = link.expiresAt - now
  if (diff < 3600) return t('apps.fileManager.shareManager.expiresInMinutes', { count: Math.ceil(diff / 60) })
  if (diff < 86400) return t('apps.fileManager.shareManager.expiresInHours', { count: Math.ceil(diff / 3600) })
  return t('apps.fileManager.shareManager.expiresInDays', { count: Math.ceil(diff / 86400) })
}

export default function ShareManagerContent({ windowId }: { windowId: string }) {
  const { t } = useTranslation()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedToken, setCopiedToken] = useState('')

  const loadLinks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await wsRequest('share.list', {})
      setLinks(data || [])
    } catch {
      setLinks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLinks() }, [loadLinks])

  const handleDelete = async (token: string) => {
    try {
      await wsRequest('share.delete', { token })
      setLinks(prev => prev.filter(l => l.token !== token))
    } catch {}
  }

  const handleCopy = async (link: ShareLink, mode: 'external' | 'internal') => {
    const url = mode === 'external' && link.url
      ? link.url
      : `${getOrigin()}/api/share/${link.token}`
    await copyToClipboard(url)
    setCopiedToken(link.token + mode)
    setTimeout(() => setCopiedToken(''), 2000)
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 bg-white/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium text-slate-800">{t('apps.fileManager.shareManager.title')}</span>
          <span className="text-xs text-slate-400">({links.length})</span>
        </div>
        <button
          onClick={loadLinks}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('apps.fileManager.shareManager.refresh')}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && links.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Link className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">{t('apps.fileManager.shareManager.empty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {links.map(link => {
              const expired = link.expiresAt ? Date.now() / 1000 > link.expiresAt : false
              return (
                <div key={link.token} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors ${expired ? 'opacity-50' : ''}`}>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{link.filename}</span>
                      <span className={`text-[0.6875rem] px-1.5 py-0.5 rounded ${expired ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                        {expiryLabel(link, t)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {link.nodeId}:{link.path}
                    </div>
                    <div className="text-[0.6875rem] text-slate-300 mt-0.5">
                      {t('apps.fileManager.shareManager.createdAt', { time: formatTime(link.createdAt) })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {link.url && (
                      <button
                        onClick={() => handleCopy(link, 'external')}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[0.6875rem] border transition-colors ${
                          copiedToken === link.token + 'external'
                            ? 'bg-green-50 border-green-200 text-green-600'
                            : 'bg-white border-gray-200 text-slate-600 hover:bg-gray-50'
                        }`}
                        title={t('apps.fileManager.shareManager.copyExternal')}
                      >
                        {copiedToken === link.token + 'external' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {t('apps.fileManager.shareManager.external')}
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(link, 'internal')}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[0.6875rem] border transition-colors ${
                        copiedToken === link.token + 'internal'
                          ? 'bg-green-50 border-green-200 text-green-600'
                          : 'bg-white border-gray-200 text-slate-600 hover:bg-gray-50'
                      }`}
                      title={t('apps.fileManager.shareManager.copyInternal')}
                    >
                      {copiedToken === link.token + 'internal' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {t('apps.fileManager.shareManager.internal')}
                    </button>
                    <button
                      onClick={() => handleDelete(link.token)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.6875rem] border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors"
                      title={t('apps.fileManager.shareManager.cancelShare')}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('apps.fileManager.shareManager.cancel')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
