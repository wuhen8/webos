import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { RefreshCw, Download, Loader2 } from "lucide-react"
import { request as wsRequest } from '@/stores/webSocketStore'
import { SettingsIcon } from "./SettingsIcon"

export default function UpdateTab() {
  const { t } = useTranslation()
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateRunning, setUpdateRunning] = useState(false)

  const checkUpdate = async () => {
    setUpdateChecking(true)
    try {
      const info = await wsRequest('system.check_update', {})
      setUpdateInfo(info)
    } catch (e: any) {
      setUpdateInfo({ error: e.message || t('settings.update.checkFailed') })
    } finally {
      setUpdateChecking(false)
    }
  }

  const doUpdate = async () => {
    setUpdateRunning(true)
    try {
      await wsRequest('system.do_update', {})
    } catch {
      // task manager handles it
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="update" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{t('settings.sidebar.update')}</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">{t('settings.update.subtitle')}</p>
      </div>

      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden p-5">
        {!updateInfo && !updateChecking && (
          <div className="text-center py-8">
            <Download className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-[0.8125rem] text-gray-500 mb-4">{t('settings.update.checkPrompt')}</p>
            <button
              onClick={checkUpdate}
              className="h-8 px-5 rounded-lg bg-indigo-500 text-white text-[0.8125rem] font-medium hover:bg-indigo-600 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('settings.update.checkNow')}
            </button>
          </div>
        )}

        {updateChecking && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-indigo-500 animate-spin" />
            <p className="text-[0.8125rem] text-gray-500">{t('settings.update.checking')}</p>
          </div>
        )}

        {updateInfo && !updateChecking && (
          <div>
            {updateInfo.error ? (
              <div className="text-center py-8">
                <p className="text-[0.8125rem] text-red-500 mb-4">{updateInfo.error}</p>
                <button
                  onClick={checkUpdate}
                  className="h-8 px-5 rounded-lg bg-indigo-500 text-white text-[0.8125rem] font-medium hover:bg-indigo-600 transition-colors inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('task.actions.retry')}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[0.8125rem] text-gray-500">{t('settings.update.currentVersion')}</div>
                    <div className="text-[0.9375rem] font-medium text-gray-900">{updateInfo.currentVersion || t('apps.about.unknownVersion')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.8125rem] text-gray-500">{t('settings.update.latestVersion')}</div>
                    <div className="text-[0.9375rem] font-medium text-gray-900">{updateInfo.version || t('apps.about.unknownVersion')}</div>
                  </div>
                </div>

                {updateInfo.hasUpdate ? (
                  <div>
                    {updateInfo.changelog && (
                      <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
                        <div className="text-[0.8125rem] font-medium text-gray-700 mb-1">{t('settings.update.changelog')}</div>
                        <p className="text-[0.75rem] text-gray-500 whitespace-pre-wrap">{updateInfo.changelog}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={doUpdate}
                        disabled={updateRunning}
                        className="h-8 px-5 rounded-lg bg-indigo-500 text-white text-[0.8125rem] font-medium hover:bg-indigo-600 disabled:bg-gray-300 transition-colors inline-flex items-center gap-2"
                      >
                        {updateRunning ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('settings.update.updating')}</>
                        ) : (
                          <><Download className="w-3.5 h-3.5" /> {t('settings.update.updateNow')}</>
                        )}
                      </button>
                      <button
                        onClick={checkUpdate}
                        className="h-8 px-4 rounded-lg bg-white border border-gray-200 text-[0.8125rem] text-gray-600 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t('settings.update.recheck')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-[0.8125rem] text-emerald-600 font-medium mb-3">{t('settings.update.upToDate')}</p>
                    <button
                      onClick={checkUpdate}
                      className="h-8 px-4 rounded-lg bg-white border border-gray-200 text-[0.8125rem] text-gray-600 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t('settings.update.recheck')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
