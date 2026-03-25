import { useEffect, useRef } from "react"
import { useTranslation } from 'react-i18next'
import { FileText, Download, XCircle } from "lucide-react"

interface LogsModalProps {
  title: string
  logs: string
  onClose: () => void
}

export function LogsModal({ title, logs, onClose }: LogsModalProps) {
  const { t } = useTranslation()
  const preRef = useRef<HTMLPreElement>(null)
  const autoScrollRef = useRef(true)

  const handleScroll = () => {
    const el = preRef.current
    if (!el) return
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  }

  useEffect(() => {
    if (autoScrollRef.current && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs])

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[90%] h-[80%] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <span className="text-[0.8125rem] font-medium text-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            {t('apps.docker.logs.title', { title })}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={downloadLogs} className="text-slate-400 hover:text-slate-600" title={t('apps.docker.logs.download')}>
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
        <pre ref={preRef} onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 text-[0.6875rem] font-mono bg-slate-900 text-green-400 leading-relaxed whitespace-pre-wrap select-text"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b', userSelect: 'text' }}>
          {logs}
        </pre>
      </div>
    </div>
  )
}
