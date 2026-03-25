// macOS Sequoia 风格 SF Symbols 图标组件
export const SettingsIcon = ({ type, className = "" }: { type: string; className?: string }) => {
  const icons: Record<string, JSX.Element> = {
    wifi: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 18c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm-4.9-2.3l1.4 1.4C9.4 16.4 10.6 16 12 16s2.6.4 3.5 1.1l1.4-1.4C15.6 14.6 13.9 14 12 14s-3.6.6-4.9 1.7zm-2.8-2.8l1.4 1.4C7.3 13 9.5 12 12 12s4.7 1 6.3 2.3l1.4-1.4C17.7 11.1 15 10 12 10s-5.7 1.1-7.7 2.9zm-2.8-2.8l1.4 1.4C5.1 10 8.3 8.5 12 8.5s6.9 1.5 9.1 3l1.4-1.4C19.8 8 16.1 6.5 12 6.5S4.2 8 1.5 10.1z"/>
      </svg>
    ),
    general: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>
    ),
    appearance: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2v20M2 12h20" stroke="white" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
    dock: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <rect x="2" y="3" width="20" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
        <rect x="4" y="16" width="16" height="3" rx="1"/>
      </svg>
    ),
    wallpaper: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="2" fill="white"/>
        <path d="M21 15l-5-5L5 21h14a2 2 0 002-2v-4z" fill="white" opacity="0.7"/>
      </svg>
    ),
    security: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
      </svg>
    ),
    storage: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/>
      </svg>
    ),
    about: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <rect x="7" y="5" width="10" height="7" rx="1" fill="white"/>
        <rect x="7" y="14" width="10" height="1" fill="white" opacity="0.5"/>
        <rect x="7" y="17" width="6" height="1" fill="white" opacity="0.5"/>
      </svg>
    ),
    firewall: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        <path d="M10 17l-3.5-3.5 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="white"/>
      </svg>
    ),
    sharing: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
    scheduled: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
      </svg>
    ),
    indexing: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h4v2H7V7zm0 4h10v2H7v-2zm0 4h10v2H7v-2zm6-8h4v2h-4V7z"/>
      </svg>
    ),
    update: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M16 12l-4-4v3H8v2h4v3l4-4z" fill="white"/>
      </svg>
    ),
    apiTokens: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.65 10a6 6 0 1 0-1.3 0H2v4h2v4h4v-4h3.35a6 6 0 0 0 1.3 0H22v-4h-9.35zM7 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
      </svg>
    ),
  }
  return icons[type] || icons.general
}

// macOS Sequoia 风格设置分类
export const settingsCategories = [
  { id: 'general', icon: 'general', label: 'i18n:settings.sidebar.general', color: 'bg-gray-500' },
  { id: 'appearance', icon: 'appearance', label: 'i18n:settings.sidebar.appearance', color: 'bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400' },
  { id: 'wallpaper', icon: 'wallpaper', label: 'i18n:settings.sidebar.wallpaper', color: 'bg-cyan-500' },
  { id: 'dock', icon: 'dock', label: 'i18n:settings.sidebar.dock', color: 'bg-black' },
  { id: 'storage', icon: 'storage', label: 'i18n:settings.sidebar.storage', color: 'bg-emerald-500' },
  { id: 'indexing', icon: 'indexing', label: 'i18n:settings.sidebar.indexing', color: 'bg-amber-500' },
  { id: 'scheduled', icon: 'scheduled', label: 'i18n:settings.sidebar.scheduled', color: 'bg-violet-500' },
  { id: 'security', icon: 'security', label: 'i18n:settings.sidebar.security', color: 'bg-blue-500' },
  { id: 'apiTokens', icon: 'apiTokens', label: 'i18n:settings.sidebar.apiTokens', color: 'bg-rose-500' },
  { id: 'sharing', icon: 'sharing', label: 'i18n:settings.sidebar.sharing', color: 'bg-teal-500' },
  { id: 'firewall', icon: 'firewall', label: 'i18n:settings.sidebar.firewall', color: 'bg-orange-500' },
  { id: 'update', icon: 'update', label: 'i18n:settings.sidebar.update', color: 'bg-indigo-500' },
]
