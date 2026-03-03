import { useState } from "react"
import { Folder, FileText, Settings } from "lucide-react"
import { useSettingsStore } from "@/stores"
import { SettingsIcon } from "./SettingsIcon"

export default function GeneralTab({ activeCategory }: { activeCategory: string }) {
  const dockSize = useSettingsStore((s) => s.dockSize)
  const setDockSize = useSettingsStore((s) => s.setDockSize)
  const wallpaperUrl = useSettingsStore((s) => s.wallpaperUrl)
  const setWallpaperUrl = useSettingsStore((s) => s.setWallpaperUrl)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const resetSettings = useSettingsStore((s) => s.resetSettings)

  // 设置项列表组件
  const SettingsRow = ({ icon, iconBg, label, children, onClick, hasArrow = false }: {
    icon: React.ReactNode; iconBg: string; label: string; children?: React.ReactNode; onClick?: () => void; hasArrow?: boolean
  }) => (
    <div
      className={`flex items-center px-3 py-2.5 ${onClick ? 'cursor-pointer hover:bg-black/[0.03] active:bg-black/[0.05]' : ''}`}
      onClick={onClick}
    >
      <div className={`w-7 h-7 ${iconBg} rounded-lg flex items-center justify-center mr-3 shadow-sm`}>
        {icon}
      </div>
      <span className="flex-1 text-[0.8125rem] text-gray-900">{label}</span>
      {children}
      {hasArrow && (
        <svg className="w-4 h-4 text-gray-300 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
      )}
    </div>
  )

  return (
    <>
      {/* 通用设置 */}
      {activeCategory === 'general' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center mb-8 pt-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-500 flex items-center justify-center shadow-lg mb-3">
              <SettingsIcon type="general" className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">通用</h1>
            <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">管理系统的整体设置和偏好设置</p>
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
            <SettingsRow
              icon={<SettingsIcon type="about" className="w-4 h-4 text-white" />}
              iconBg="bg-gray-500"
              label="关于本机"
              hasArrow
            />
            <div className="h-px bg-gray-200 ml-12" />
            <SettingsRow
              icon={<SettingsIcon type="storage" className="w-4 h-4 text-white" />}
              iconBg="bg-gray-500"
              label="储存空间"
              hasArrow
            />
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-6">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[0.8125rem] text-gray-900">恢复默认设置</span>
              <button
                onClick={resetSettings}
                className="px-3 py-1 text-[0.8125rem] bg-white hover:bg-gray-100 text-gray-700 rounded-md border border-gray-200 transition-colors"
              >
                恢复默认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 外观设置 */}
      {activeCategory === 'appearance' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center mb-8 pt-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400 flex items-center justify-center shadow-lg mb-3">
              <SettingsIcon type="appearance" className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">外观</h1>
            <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">自定义系统外观和显示设置</p>
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.8125rem] text-gray-900">界面缩放</span>
                <span className="text-[0.8125rem] text-gray-500">{Math.round(fontSize / 16 * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.6875rem] text-gray-400">小</span>
                <input
                  type="range"
                  min={12}
                  max={20}
                  step={1}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="flex-1 h-1 bg-gray-300 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-300"
                />
                <span className="text-[0.6875rem] text-gray-400">大</span>
              </div>
              <p className="text-[0.6875rem] text-gray-400 mt-2">通过修改根字号等比缩放整个界面（基准 16px = 100%）</p>
            </div>
          </div>
        </div>
      )}

      {/* 墙纸设置 */}
      {activeCategory === 'wallpaper' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center mb-8 pt-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500 flex items-center justify-center shadow-lg mb-3">
              <SettingsIcon type="wallpaper" className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">墙纸</h1>
            <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">选择桌面背景图片</p>
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden p-4">
            <div className={`relative w-full aspect-video rounded-xl overflow-hidden shadow-lg ${
              wallpaperUrl?.startsWith('gradient:')
                ? `bg-gradient-to-br ${wallpaperUrl.replace('gradient:', '')}`
                : 'bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-200'
            }`}>
              {wallpaperUrl && !wallpaperUrl.startsWith('gradient:') ? (
                <img src={wallpaperUrl} className="w-full h-full object-cover" alt="当前墙纸" />
              ) : null}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 bg-white/30 backdrop-blur-xl rounded-2xl">
                <div className="w-6 h-6 bg-white/50 rounded-lg"></div>
                <div className="w-6 h-6 bg-white/50 rounded-lg"></div>
                <div className="w-6 h-6 bg-white/50 rounded-lg"></div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/*'
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (file) {
                      const url = URL.createObjectURL(file)
                      setWallpaperUrl(url)
                    }
                  }
                  input.click()
                }}
                className="flex-1 py-2 text-[0.8125rem] bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
              >
                选择图片
              </button>
              {wallpaperUrl && (
                <button
                  onClick={() => setWallpaperUrl(null)}
                  className="px-4 py-2 text-[0.8125rem] bg-white hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors"
                >
                  使用默认
                </button>
              )}
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden p-4 mt-4">
            <h3 className="text-[0.8125rem] font-medium text-gray-900 mb-3">默认背景</h3>
            <div className="flex flex-wrap gap-3">
              {[
                { id: 'default', gradient: 'from-indigo-200 via-purple-200 to-pink-200' },
                { id: 'ocean', gradient: 'from-cyan-400 via-blue-500 to-indigo-600' },
                { id: 'sunset', gradient: 'from-orange-400 via-rose-500 to-purple-600' },
                { id: 'forest', gradient: 'from-emerald-400 via-teal-500 to-cyan-600' },
                { id: 'night', gradient: 'from-slate-800 via-slate-900 to-zinc-900' },
                { id: 'aurora', gradient: 'from-green-400 via-cyan-500 to-blue-600' },
                { id: 'peach', gradient: 'from-rose-300 via-pink-400 to-orange-300' },
                { id: 'lavender', gradient: 'from-violet-400 via-purple-500 to-fuchsia-500' },
              ].map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setWallpaperUrl(`gradient:${bg.gradient}`)}
                  className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    wallpaperUrl === `gradient:${bg.gradient}` || (!wallpaperUrl && bg.id === 'default')
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <div className={`w-full h-full bg-gradient-to-br ${bg.gradient}`} />
                  {(wallpaperUrl === `gradient:${bg.gradient}` || (!wallpaperUrl && bg.id === 'default')) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 桌面与程序坞 */}
      {activeCategory === 'dock' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center mb-8 pt-4">
            <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center shadow-lg mb-3">
              <SettingsIcon type="dock" className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">桌面与程序坞</h1>
            <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">自定义程序坞的外观和行为</p>
          </div>

          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.8125rem] text-gray-900">大小</span>
                <span className="text-[0.8125rem] text-gray-500">{dockSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.6875rem] text-gray-400">小</span>
                <input
                  type="range"
                  min={44}
                  max={88}
                  step={2}
                  value={dockSize}
                  onChange={(e) => setDockSize(Number(e.target.value))}
                  className="flex-1 h-1 bg-gray-300 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-300"
                />
                <span className="text-[0.6875rem] text-gray-400">大</span>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-[#f5f5f7] rounded-xl p-4">
            <div className="text-[0.6875rem] text-gray-500 mb-3 text-center">预览</div>
            <div className="flex justify-center">
              <div className="inline-flex items-end gap-1.5 px-4 py-2 bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-lg">
                {[
                  { bg: 'bg-blue-500', icon: <Folder className="w-1/2 h-1/2 text-white" /> },
                  { bg: 'bg-yellow-500', icon: <FileText className="w-1/2 h-1/2 text-white" /> },
                  { bg: 'bg-gray-500', icon: <Settings className="w-1/2 h-1/2 text-white" /> },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{ width: dockSize * 0.5, height: dockSize * 0.5 }}
                    className={`flex items-center justify-center ${item.bg} rounded-xl shadow-sm`}
                  >
                    {item.icon}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
