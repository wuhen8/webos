import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { Search, User, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { resolveI18nText } from '@/i18n/resolve'
import { SettingsIcon, settingsCategories } from "./components/SettingsIcon"
import GeneralTab from "./components/GeneralTab"
import StorageTab from "./components/StorageTab"
import IndexingTab from "./components/IndexingTab"
import ScheduledTab from "./components/ScheduledTab"
import SecurityTab from "./components/SecurityTab"
import APITokensTab from "./components/APITokensTab"
import SharingTab from "./components/SharingTab"
import FirewallTab from "./components/FirewallTab"
import UpdateTab from "./components/UpdateTab"

export function SettingsContent() {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState('general')
  const [searchQuery, setSearchQuery] = useState("")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 640)

  const filteredCategories = searchQuery
    ? settingsCategories.filter(c => resolveI18nText(c.label).toLowerCase().includes(searchQuery.toLowerCase()))
    : settingsCategories

  return (
    <div className="flex h-full bg-[#f5f5f7]">
      {/* 左侧边栏 - macOS Sequoia 风格 */}
      <div className={`${sidebarCollapsed ? 'w-10' : 'w-[16.25rem]'} bg-[#f5f5f7]/80 backdrop-blur-2xl overflow-y-auto flex flex-col border-r border-black/[0.06] transition-all duration-200 shrink-0`}>
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-4'} pt-3 pb-2 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && <div className="text-[0.6875rem] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{t('apps.settings.name')}</div>}
          <button onClick={() => setSidebarCollapsed(v => !v)} className="p-0.5 rounded hover:bg-black/[0.06] text-gray-500 transition-colors" title={sidebarCollapsed ? t('settings.sidebar.expand') : t('settings.sidebar.collapse')}>
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* 搜索框 */}
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('launchpad.placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-7 pl-8 pr-3 rounded-md bg-black/[0.06] border-none text-[0.8125rem] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {/* 用户账户 */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/[0.04] cursor-pointer">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-md">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-[0.8125rem] font-medium text-gray-900">{t('login.user')}</div>
                  <div className="text-[0.6875rem] text-gray-500">{t('settings.sidebar.account')}</div>
                </div>
              </div>
            </div>

            {/* 分类列表 */}
            <div className="flex-1 px-3 py-1">
              {filteredCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg mb-0.5 transition-colors ${
                    activeCategory === category.id
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-black/[0.04] text-gray-900'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg ${category.color} flex items-center justify-center shadow-sm`}>
                    <SettingsIcon type={category.icon} className={`w-4 h-4 ${activeCategory === category.id ? 'text-white' : 'text-white'}`} />
                  </div>
                  <span className="text-[0.8125rem]">{resolveI18nText(category.label)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="p-6">
          {(activeCategory === 'general' || activeCategory === 'appearance' || activeCategory === 'wallpaper' || activeCategory === 'dock') && (
            <GeneralTab activeCategory={activeCategory} />
          )}
          {activeCategory === 'storage' && <StorageTab />}
          {activeCategory === 'indexing' && <IndexingTab />}
          {activeCategory === 'scheduled' && <ScheduledTab />}
          {activeCategory === 'security' && <SecurityTab />}
          {activeCategory === 'apiTokens' && <APITokensTab />}
          {activeCategory === 'sharing' && <SharingTab />}
          {activeCategory === 'firewall' && <FirewallTab />}
          {activeCategory === 'update' && <UpdateTab />}
        </div>
      </div>
    </div>
  )
}

export default SettingsContent
