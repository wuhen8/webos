import { useState } from "react"
import { RefreshCw, Download, Loader2 } from "lucide-react"
import { request as wsRequest } from '@/stores/webSocketStore'
import { SettingsIcon } from "./SettingsIcon"

export default function UpdateTab() {
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateRunning, setUpdateRunning] = useState(false)

  const checkUpdate = async () => {
    setUpdateChecking(true)
    try {
      const info = await wsRequest('system_check_update', {})
      setUpdateInfo(info)
    } catch (e: any) {
      setUpdateInfo({ error: e.message || '检查更新失败' })
    } finally {
      setUpdateChecking(false)
    }
  }

  const doUpdate = async () => {
    setUpdateRunning(true)
    try {
      await wsRequest('system_do_update', {})
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
        <h1 className="text-xl font-semibold text-gray-900">程序更新</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">检查并安装系统更新</p>
      </div>

      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden p-5">
        {!updateInfo && !updateChecking && (
          <div className="text-center py-8">
            <Download className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-[0.8125rem] text-gray-500 mb-4">点击下方按钮检查是否有新版本</p>
            <button
              onClick={checkUpdate}
              className="h-8 px-5 rounded-lg bg-indigo-500 text-white text-[0.8125rem] font-medium hover:bg-indigo-600 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              检查更新
            </button>
          </div>
        )}

        {updateChecking && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-indigo-500 animate-spin" />
            <p className="text-[0.8125rem] text-gray-500">正在检查更新...</p>
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
                  重试
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[0.8125rem] text-gray-500">当前版本</div>
                    <div className="text-[0.9375rem] font-medium text-gray-900">{updateInfo.currentVersion || '未知'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.8125rem] text-gray-500">最新版本</div>
                    <div className="text-[0.9375rem] font-medium text-gray-900">{updateInfo.version || '未知'}</div>
                  </div>
                </div>

                {updateInfo.hasUpdate ? (
                  <div>
                    {updateInfo.changelog && (
                      <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
                        <div className="text-[0.8125rem] font-medium text-gray-700 mb-1">更新日志</div>
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
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 更新中...</>
                        ) : (
                          <><Download className="w-3.5 h-3.5" /> 立即更新</>
                        )}
                      </button>
                      <button
                        onClick={checkUpdate}
                        className="h-8 px-4 rounded-lg bg-white border border-gray-200 text-[0.8125rem] text-gray-600 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        重新检查
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-[0.8125rem] text-emerald-600 font-medium mb-3">当前已是最新版本</p>
                    <button
                      onClick={checkUpdate}
                      className="h-8 px-4 rounded-lg bg-white border border-gray-200 text-[0.8125rem] text-gray-600 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      重新检查
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
