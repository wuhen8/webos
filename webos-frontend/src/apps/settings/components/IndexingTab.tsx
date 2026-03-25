import { useState, useEffect, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { X } from "lucide-react"
import { request as wsRequest } from '@/stores/webSocketStore'
import { SettingsIcon } from "./SettingsIcon"

export default function IndexingTab() {
  const { t } = useTranslation()
  const [skipDirs, setSkipDirs] = useState<string[]>([])
  const [skipDirInput, setSkipDirInput] = useState("")
  const [skipDirsLoading, setSkipDirsLoading] = useState(false)
  const [indexDirs, setIndexDirs] = useState<string[]>([])
  const [indexDirInput, setIndexDirInput] = useState("")
  const [indexDirsLoading, setIndexDirsLoading] = useState(false)

  useEffect(() => {
    setSkipDirsLoading(true)
    setIndexDirsLoading(true)
    wsRequest('settings.preferences_get', {}).then((data: any) => {
      if (data?.indexSkipDirs && Array.isArray(data.indexSkipDirs)) {
        setSkipDirs(data.indexSkipDirs)
      }
      if (data?.indexDirs && Array.isArray(data.indexDirs)) {
        setIndexDirs(data.indexDirs)
      }
    }).finally(() => {
      setSkipDirsLoading(false)
      setIndexDirsLoading(false)
    })
  }, [])

  const saveSkipDirs = useCallback(async (dirs: string[]) => {
    setSkipDirs(dirs)
    await wsRequest('settings.preferences_save', { prefs: { indexSkipDirs: dirs } })
  }, [])

  const addSkipDir = useCallback(() => {
    const val = skipDirInput.trim()
    if (!val || skipDirs.includes(val)) return
    const next = [...skipDirs, val]
    setSkipDirInput("")
    saveSkipDirs(next)
  }, [skipDirInput, skipDirs, saveSkipDirs])

  const removeSkipDir = useCallback((dir: string) => {
    saveSkipDirs(skipDirs.filter(d => d !== dir))
  }, [skipDirs, saveSkipDirs])

  const saveIndexDirs = useCallback(async (dirs: string[]) => {
    setIndexDirs(dirs)
    await wsRequest('settings.preferences_save', { prefs: { indexDirs: dirs } })
  }, [])

  const addIndexDir = useCallback(() => {
    const val = indexDirInput.trim()
    if (!val || indexDirs.includes(val)) return
    const next = [...indexDirs, val]
    setIndexDirInput("")
    saveIndexDirs(next)
  }, [indexDirInput, indexDirs, saveIndexDirs])

  const removeIndexDir = useCallback((dir: string) => {
    saveIndexDirs(indexDirs.filter(d => d !== dir))
  }, [indexDirs, saveIndexDirs])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="indexing" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{t('settings.sidebar.indexing')}</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">{t('settings.indexing.subtitle')}</p>
      </div>

      {/* 索引目录 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.8125rem] font-medium text-gray-900">{t('settings.indexing.indexDirs')}</span>
          <span className="text-[0.6875rem] text-gray-400">{t('settings.indexing.indexDirsHint')}</span>
        </div>
        {indexDirsLoading ? (
          <div className="text-[0.8125rem] text-gray-400 py-2">{t('apps.settings.firewall.loading')}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {indexDirs.map((dir) => (
                <span
                  key={dir}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[0.75rem] text-gray-700"
                >
                  {dir}
                  <button
                    onClick={() => removeIndexDir(dir)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {indexDirs.length === 0 && (
                <span className="text-[0.75rem] text-gray-400">{t('settings.indexing.indexAll')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={indexDirInput}
                onChange={(e) => setIndexDirInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addIndexDir() }}
                placeholder={t('settings.indexing.indexDirPlaceholder')}
                className="flex-1 px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
              />
              <button
                onClick={addIndexDir}
                disabled={!indexDirInput.trim()}
                className="px-3 py-1.5 text-[0.8125rem] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-md transition-colors"
              >
                {t('apps.settings.firewall.add')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 索引排除目录 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-6 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.8125rem] font-medium text-gray-900">{t('settings.indexing.excludeDirs')}</span>
          <span className="text-[0.6875rem] text-gray-400">{t('settings.indexing.excludeDirsHint')}</span>
        </div>
        {skipDirsLoading ? (
          <div className="text-[0.8125rem] text-gray-400 py-2">{t('apps.settings.firewall.loading')}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {skipDirs.map((dir) => (
                <span
                  key={dir}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[0.75rem] text-gray-700"
                >
                  {dir}
                  <button
                    onClick={() => removeSkipDir(dir)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {skipDirs.length === 0 && (
                <span className="text-[0.75rem] text-gray-400">{t('settings.indexing.noExcludeRules')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={skipDirInput}
                onChange={(e) => setSkipDirInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSkipDir() }}
                placeholder={t('settings.indexing.excludeDirPlaceholder')}
                className="flex-1 px-2.5 py-1.5 text-[0.8125rem] bg-white border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
              />
              <button
                onClick={addSkipDir}
                disabled={!skipDirInput.trim()}
                className="px-3 py-1.5 text-[0.8125rem] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-md transition-colors"
              >
                {t('apps.settings.firewall.add')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 索引说明 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-6 px-4 py-3">
        <p className="text-[0.75rem] text-gray-500 leading-relaxed">
          {t('settings.indexing.description')}
        </p>
      </div>
    </div>
  )
}
