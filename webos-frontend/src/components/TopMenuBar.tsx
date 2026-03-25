import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from 'react-i18next'
import { Search, Wifi, Volume2, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { getAppConfig } from "@/config/appRegistry"
import { dispatchMenuAction } from "@/config/actionRegistry"
import { useWindowStore, useUIStore, useAuthStore } from "@/stores"
import { TaskIndicator } from "@/components/TaskIndicator"


export function TopMenuBar() {
  const { t, i18n } = useTranslation()
  const windows = useWindowStore((s) => s.windows)
  const openWindow = useWindowStore((s) => s.openWindow)
  const activateWindow = useWindowStore((s) => s.activateWindow)
  const topMenuOpen = useUIStore((s) => s.topMenuOpen)
  const setTopMenuOpen = useUIStore((s) => s.setTopMenuOpen)
  const setSpotlightOpen = useUIStore((s) => s.setSpotlightOpen)
  const logout = useAuthStore((s) => s.logout)

  const [windowMenuOpen, setWindowMenuOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [appMenuOpenStates, setAppMenuOpenStates] = useState<Record<string, boolean>>({})
  const [time, setTime] = useState(new Date())
  const anyMenuOpen = useRef(false)

  const activeWindow = windows.find(w => w.isActive)
  const activeType = activeWindow?.appId || activeWindow?.type || 'fileManager'
  const appConfig = getAppConfig(activeType)
  const appName = appConfig.name
  const formattedTime = new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const allAppMenusOpen = Object.values(appMenuOpenStates).some(Boolean)

  useEffect(() => {
    anyMenuOpen.current = topMenuOpen || windowMenuOpen || helpMenuOpen || allAppMenusOpen
  }, [topMenuOpen, windowMenuOpen, helpMenuOpen, allAppMenusOpen])

  const menuContentClass = [
    "min-w-[15rem] p-[0.3125rem]",
    "bg-white/50 backdrop-blur-[40px] backdrop-saturate-[1.8]",
    "border border-white/30",
    "rounded-[0.875rem]",
    "shadow-[0_24px_80px_-16px_rgba(0,0,0,0.18),0_8px_24px_-8px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.9),inset_0_-0.5px_0_rgba(0,0,0,0.04)]",
    "animate-in fade-in-0 zoom-in-95 duration-150",
  ].join(" ")

  const menuItemClass = [
    "px-3 py-[0.3125rem] text-[0.8125rem] leading-[1.125rem] text-gray-900/90",
    "hover:bg-blue-500/90 hover:text-white",
    "rounded-[0.5rem] cursor-default",
    "transition-colors duration-75",
    "flex items-center justify-between group",
    "outline-none",
  ].join(" ")

  const menuDividerClass = "my-[0.25rem] mx-3 h-[0.5px] bg-black/[0.08]"
  const shortcutClass = "text-[0.75rem] text-black/30 group-hover:text-white/60 ml-auto pl-6 font-normal tracking-wide"

  const menuBtnBase = [
    "px-[0.5625rem] h-[1.125rem] rounded-[0.25rem]",
    "text-[0.84375rem] leading-none text-black/[0.85]",
    "hover:bg-black/[0.06] active:bg-black/[0.1]",
    "transition-colors duration-100",
  ].join(" ")

  const statusBtnClass = [
    "flex items-center justify-center",
    "w-[1.625rem] h-[1.125rem] rounded-[0.25rem]",
    "hover:bg-black/[0.06] active:bg-black/[0.1]",
    "transition-colors duration-100",
  ].join(" ")

  // ── Overflow detection ──
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const [visibleCount, setVisibleCount] = useState(Infinity)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // All menu items in order: appName, ...appMenus, 窗口, 帮助
  // appName is index 0, app menus are 1..N, 窗口 is N+1, 帮助 is N+2
  const totalMenuItems = 1 + appConfig.menus.length + 2 // appName + appMenus + 窗口 + 帮助

  const calcVisible = useCallback(() => {
    const left = leftRef.current
    const right = rightRef.current
    if (!left || !right) return

    const containerWidth = window.innerWidth - right.offsetWidth - 8 // 8px padding
    // Logo button is always visible, measure from after it
    const logoBtn = left.children[0] as HTMLElement
    const logoWidth = logoBtn ? logoBtn.offsetWidth : 30
    let usedWidth = logoWidth
    const moreButtonWidth = 36 // approximate width of "..." button

    let count = 0
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const w = el.offsetWidth
      const remaining = containerWidth - usedWidth
      // If this is the last item and it fits, no need for more button space
      if (i === itemRefs.current.length - 1 && w <= remaining) {
        count++
        break
      }
      // Otherwise reserve space for more button
      if (w <= remaining - moreButtonWidth) {
        usedWidth += w
        count++
      } else {
        break
      }
    }
    setVisibleCount(count)
  }, [totalMenuItems])

  useEffect(() => {
    calcVisible()
    const ro = new ResizeObserver(calcVisible)
    if (leftRef.current) ro.observe(leftRef.current)
    window.addEventListener('resize', calcVisible)
    return () => { ro.disconnect(); window.removeEventListener('resize', calcVisible) }
  }, [calcVisible])

  // Recalc when app menus change
  useEffect(() => { calcVisible() }, [appConfig.menus, calcVisible])

  const closeAllMenus = () => {
    setWindowMenuOpen(false)
    setHelpMenuOpen(false)
    setAppMenuOpenStates({})
    setMoreMenuOpen(false)
  }

  const handleMenuHover = (openFn: (v: boolean) => void) => {
    if (anyMenuOpen.current) {
      closeAllMenus()
      setTopMenuOpen(false)
      setTimeout(() => openFn(true), 0)
    }
  }

  const handleAppMenuHover = (label: string) => {
    if (anyMenuOpen.current) {
      closeAllMenus()
      setTopMenuOpen(false)
      setTimeout(() => setAppMenuOpenStates({ [label]: true }), 0)
    }
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[1.5625rem] flex items-center justify-between px-[0.375rem] text-[0.8125rem] z-50 select-none"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(50px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(50px) saturate(1.8)',
        boxShadow: '0 0.5px 0 rgba(0,0,0,0.1), inset 0 0.5px 0 rgba(255,255,255,0.25)',
      }}
    >
      {/* 左侧菜单区 */}
      <div className="flex items-center h-full overflow-hidden" ref={leftRef}>
        {/* Logo */}
        <DropdownMenu open={topMenuOpen} onOpenChange={setTopMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={() => { closeAllMenus(); setTopMenuOpen(!topMenuOpen) }}
              onMouseEnter={() => handleMenuHover(setTopMenuOpen)}
              className="flex items-center justify-center w-[1.875rem] h-[1.125rem] rounded-[0.25rem] hover:bg-black/[0.06] active:bg-black/[0.1] transition-colors duration-100 shrink-0"
            >
              <svg className="w-[0.8125rem] h-[1rem] text-black/80" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V5zm3-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5zm5 14v2H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-2v-2h-4z"/>
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" sideOffset={5} className={menuContentClass}>
            <DropdownMenuItem onClick={() => { openWindow('about'); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.aboutThisMachine')}
            </DropdownMenuItem>
            <div className={menuDividerClass} />
            <DropdownMenuItem onClick={() => { openWindow('settings'); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.systemSettings')}<span className={shortcutClass}>⌘,</span>
            </DropdownMenuItem>
            <div className={menuDividerClass} />
            <DropdownMenuItem className={`${menuItemClass} opacity-40`} disabled>
              {t('menu.apple.sleep')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { dispatchMenuAction('system.restart'); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.restart')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { dispatchMenuAction('system.shutdown'); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.shutdown')}
            </DropdownMenuItem>
            <div className={menuDividerClass} />
            <DropdownMenuItem onClick={() => { logout(); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.lockScreen')}<span className={shortcutClass}>⌃⌘Q</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { logout(); setTopMenuOpen(false) }} className={menuItemClass}>
              {t('menu.apple.logout')}<span className={shortcutClass}>⇧⌘Q</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 菜单项：appName + appMenus + 窗口 + 帮助 */}
        {(() => {
          // Build all menu items as a flat list
          const allItems: { key: string; render: (visible: boolean) => React.ReactNode; renderInMore: () => React.ReactNode }[] = []
          let refIdx = 0

          // appName (index 0)
          const appNameIdx = refIdx++
          allItems.push({
            key: 'appName',
            render: (visible) => (
              <span
                key="appName"
                ref={el => { itemRefs.current[appNameIdx] = el }}
                className="px-[0.5625rem] h-[1.125rem] flex items-center font-semibold text-black/90 text-[0.84375rem] tracking-[-0.01em] shrink-0 whitespace-nowrap"
                style={visible ? undefined : { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
              >
                {appName}
              </span>
            ),
            renderInMore: () => (
              <DropdownMenuItem key="appName-more" className={`${menuItemClass} font-semibold`} disabled>
                {appName}
              </DropdownMenuItem>
            ),
          })

          // App menus
          for (const menu of appConfig.menus) {
            const idx = refIdx++
            const label = menu.label
            allItems.push({
              key: `app-${label}`,
              render: (visible) => (
                <DropdownMenu
                  key={`app-${label}`}
                  open={!!appMenuOpenStates[label]}
                  onOpenChange={(open) => setAppMenuOpenStates(prev => ({ ...prev, [label]: open }))}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      ref={el => { itemRefs.current[idx] = el }}
                      onClick={() => {
                        closeAllMenus()
                        setTopMenuOpen(false)
                        setAppMenuOpenStates({ [label]: !appMenuOpenStates[label] })
                      }}
                      onMouseEnter={() => handleAppMenuHover(label)}
                      className={`${menuBtnBase} shrink-0 whitespace-nowrap`}
                      style={visible ? undefined : { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
                    >{label}</button>
                  </DropdownMenuTrigger>
                  {visible && (
                    <DropdownMenuContent side="bottom" align="start" sideOffset={5} className={menuContentClass}>
                      {menu.items.map((item, i) => (
                        <div key={i}>
                          <DropdownMenuItem
                            disabled={item.disabled}
                            onClick={() => {
                              if (item.action) dispatchMenuAction(item.action)
                              setAppMenuOpenStates({})
                            }}
                            className={item.disabled ? `${menuItemClass} opacity-40` : menuItemClass}
                          >
                            {item.label}
                            {item.shortcut && <span className={shortcutClass}>{item.shortcut}</span>}
                          </DropdownMenuItem>
                          {item.dividerAfter && <div className={menuDividerClass} />}
                        </div>
                      ))}
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>
              ),
              renderInMore: () => (
                <div key={`more-app-${label}`}>
                  <div className="px-3 py-[0.1875rem] text-[0.6875rem] text-black/35 font-medium">{label}</div>
                  {menu.items.map((item, i) => (
                    <div key={i}>
                      <DropdownMenuItem
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.action) dispatchMenuAction(item.action)
                          setMoreMenuOpen(false)
                        }}
                        className={item.disabled ? `${menuItemClass} opacity-40` : menuItemClass}
                      >
                        {item.label}
                        {item.shortcut && <span className={shortcutClass}>{item.shortcut}</span>}
                      </DropdownMenuItem>
                      {item.dividerAfter && <div className={menuDividerClass} />}
                    </div>
                  ))}
                  <div className={menuDividerClass} />
                </div>
              ),
            })
          }

          // 窗口
          const windowIdx = refIdx++
          allItems.push({
            key: 'window',
            render: (visible) => (
              <DropdownMenu key="window" open={windowMenuOpen} onOpenChange={setWindowMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    ref={el => { itemRefs.current[windowIdx] = el }}
                    onClick={() => { closeAllMenus(); setTopMenuOpen(false); setWindowMenuOpen(!windowMenuOpen) }}
                    onMouseEnter={() => handleMenuHover(setWindowMenuOpen)}
                    className={`${menuBtnBase} shrink-0 whitespace-nowrap`}
                    style={visible ? undefined : { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
                  >{t('menu.window.title')}</button>
                </DropdownMenuTrigger>
                {visible && (
                  <DropdownMenuContent side="bottom" align="start" sideOffset={5} className={menuContentClass}>
                    <DropdownMenuItem
                      className={activeWindow ? menuItemClass : `${menuItemClass} opacity-40`}
                      disabled={!activeWindow}
                      onClick={() => { if (activeWindow) { dispatchMenuAction('minimize'); setWindowMenuOpen(false) } }}
                    >
                      {t('menu.window.minimize')}<span className={shortcutClass}>⌘M</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={activeWindow ? menuItemClass : `${menuItemClass} opacity-40`}
                      disabled={!activeWindow}
                      onClick={() => { if (activeWindow) { dispatchMenuAction('zoom'); setWindowMenuOpen(false) } }}
                    >
                      {t('menu.window.zoom')}
                    </DropdownMenuItem>
                    <div className={menuDividerClass} />
                    {windows.length > 0 && (
                      <>
                        <div className="px-3 py-[0.1875rem] text-[0.6875rem] text-black/35 font-medium">{t('menu.window.openWindows')}</div>
                        {windows.map(win => (
                          <DropdownMenuItem
                            key={win.id}
                            className={menuItemClass}
                            onClick={() => { activateWindow(win.id); setWindowMenuOpen(false) }}
                          >
                            <span className="flex items-center gap-2">
                              {win.isActive && !win.isMinimized && (
                                <svg className="w-[0.625rem] h-[0.625rem] text-black/60" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                                </svg>
                              )}
                              {(!win.isActive || win.isMinimized) && <span className="w-[0.625rem]" />}
                              {win.title}{win.isMinimized ? t('menu.window.minimizedSuffix') : ''}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                )}
              </DropdownMenu>
            ),
            renderInMore: () => (
              <div key="more-window">
                <div className="px-3 py-[0.1875rem] text-[0.6875rem] text-black/35 font-medium">{t('menu.window.title')}</div>
                <DropdownMenuItem
                  className={activeWindow ? menuItemClass : `${menuItemClass} opacity-40`}
                  disabled={!activeWindow}
                  onClick={() => { if (activeWindow) { dispatchMenuAction('minimize'); setMoreMenuOpen(false) } }}
                >
                  {t('menu.window.minimize')}<span className={shortcutClass}>⌘M</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={activeWindow ? menuItemClass : `${menuItemClass} opacity-40`}
                  disabled={!activeWindow}
                  onClick={() => { if (activeWindow) { dispatchMenuAction('zoom'); setMoreMenuOpen(false) } }}
                >
                  {t('menu.window.zoom')}
                </DropdownMenuItem>
                {windows.length > 0 && (
                  <>
                    <div className={menuDividerClass} />
                    {windows.map(win => (
                      <DropdownMenuItem
                        key={win.id}
                        className={menuItemClass}
                        onClick={() => { activateWindow(win.id); setMoreMenuOpen(false) }}
                      >
                        {win.title}{win.isMinimized ? t('menu.window.minimizedSuffix') : ''}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <div className={menuDividerClass} />
              </div>
            ),
          })

          // 帮助
          const helpIdx = refIdx++
          allItems.push({
            key: 'help',
            render: (visible) => (
              <DropdownMenu key="help" open={helpMenuOpen} onOpenChange={setHelpMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    ref={el => { itemRefs.current[helpIdx] = el }}
                    onClick={() => { closeAllMenus(); setTopMenuOpen(false); setHelpMenuOpen(!helpMenuOpen) }}
                    onMouseEnter={() => handleMenuHover(setHelpMenuOpen)}
                    className={`${menuBtnBase} shrink-0 whitespace-nowrap`}
                    style={visible ? undefined : { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
                  >{t('menu.help.title')}</button>
                </DropdownMenuTrigger>
                {visible && (
                  <DropdownMenuContent side="bottom" align="start" sideOffset={5} className={menuContentClass}>
                    <div className="px-2 py-[0.3125rem]">
                      <div className="flex items-center gap-2 px-2 py-[0.25rem] bg-black/[0.04] rounded-[0.375rem] border border-black/[0.06]">
                        <Search className="w-[0.75rem] h-[0.75rem] text-black/30 shrink-0" />
                        <span className="text-[0.8125rem] text-black/30">{t('menu.help.search')}</span>
                      </div>
                    </div>
                    <div className={menuDividerClass} />
                    <DropdownMenuItem onClick={() => { openWindow('about'); setHelpMenuOpen(false) }} className={menuItemClass}>
                      {t('menu.help.aboutWebOS')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                )}
              </DropdownMenu>
            ),
            renderInMore: () => (
              <div key="more-help">
                <div className="px-3 py-[0.1875rem] text-[0.6875rem] text-black/35 font-medium">{t('menu.help.title')}</div>
                <DropdownMenuItem onClick={() => { openWindow('about'); setMoreMenuOpen(false) }} className={menuItemClass}>
                  {t('menu.help.aboutWebOS')}
                </DropdownMenuItem>
              </div>
            ),
          })

          // Initialize refs array length
          itemRefs.current.length = refIdx

          const visibleItems = allItems.slice(0, visibleCount)
          const overflowItems = allItems.slice(visibleCount)
          // Hidden items still need to render (invisibly) so we can measure them
          const hiddenItems = allItems.slice(visibleCount)

          return (
            <>
              {visibleItems.map(item => item.render(true))}
              {hiddenItems.map(item => item.render(false))}
              {overflowItems.length > 0 && (
                <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={() => { closeAllMenus(); setTopMenuOpen(false); setMoreMenuOpen(!moreMenuOpen) }}
                      onMouseEnter={() => {
                        if (anyMenuOpen.current) {
                          closeAllMenus()
                          setTopMenuOpen(false)
                          setTimeout(() => setMoreMenuOpen(true), 0)
                        }
                      }}
                      className={`${menuBtnBase} shrink-0`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start" sideOffset={5} className={menuContentClass}>
                    {overflowItems.map(item => item.renderInMore())}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )
        })()}
      </div>

      {/* 右侧状态栏 */}
      <div className="flex items-center h-full gap-[0.125rem] shrink-0" ref={rightRef}>
        <TaskIndicator />
        <button className={statusBtnClass}>
          <Volume2 className="w-[0.875rem] h-[0.875rem] text-black/70" strokeWidth={1.8} />
        </button>
        <button className={statusBtnClass}>
          <Wifi className="w-[0.875rem] h-[0.875rem] text-black/70" strokeWidth={2} />
        </button>
        <button className={statusBtnClass} onClick={() => setSpotlightOpen(true)}>
          <Search className="w-[0.8125rem] h-[0.8125rem] text-black/70" strokeWidth={2} />
        </button>
        <button className={statusBtnClass}>
          <svg className="w-[0.875rem] h-[0.875rem] text-black/70" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="1.2" fillOpacity="0.85" />
            <rect x="9" y="1" width="6" height="6" rx="1.2" fillOpacity="0.55" />
            <rect x="1" y="9" width="6" height="6" rx="1.2" fillOpacity="0.55" />
            <rect x="9" y="9" width="6" height="6" rx="1.2" fillOpacity="0.85" />
          </svg>
        </button>
        <button className="flex items-center h-[1.125rem] px-[0.5rem] rounded-[0.25rem] hover:bg-black/[0.06] active:bg-black/[0.1] transition-colors duration-100 gap-[0.375rem]">
          <span className="text-[0.8125rem] text-black/80 font-medium tabular-nums whitespace-nowrap">
            {formattedTime}
          </span>
        </button>
      </div>
    </div>
  )
}

export default TopMenuBar
