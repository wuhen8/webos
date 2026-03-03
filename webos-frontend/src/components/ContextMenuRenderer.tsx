import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { resolveIcon } from '@/config/appRegistry'
import type { ContextMenuConfig, ContextMenuContext, ContextMenuEntry, ContextMenuItemConfig } from '@/types'

interface ContextMenuRendererProps {
  config: ContextMenuConfig
  context: ContextMenuContext
  onAction: (action: string, item?: ContextMenuItemConfig) => void
}

const menuItemClass =
  'w-full px-3 py-1.5 text-left text-[0.8125rem] text-slate-800 hover:bg-blue-500 hover:text-white flex items-center gap-2.5 transition-all duration-75 rounded-md cursor-default select-none'
const menuItemDangerClass =
  'w-full px-3 py-1.5 text-left text-[0.8125rem] text-red-600 hover:bg-red-500 hover:text-white flex items-center gap-2.5 transition-all duration-75 rounded-md cursor-default select-none'
const menuDividerClass = 'my-1.5 mx-2 h-px bg-black/10'
const menuIconClass = 'h-4 w-4 opacity-70'

// 条件注册表
const conditionRegistry: Record<string, (ctx: ContextMenuContext) => boolean> = {
  hasClipboard: (ctx) => !!ctx.clipboard,
  multipleSelected: (ctx) => (ctx.selectedCount ?? 0) > 1,
  singleFile: (ctx) => {
    if (!ctx.targetFile || ctx.targetFile.isDir) return false
    return (ctx.selectedCount ?? 0) <= 1
  },
  isArchive: (ctx) => {
    if (!ctx.targetFile || ctx.targetFile.isDir) return false
    const ext = ctx.targetFile.extension?.toLowerCase() || ''
    return ['.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar'].includes(ext)
  },
}

// 模板解析：替换 {{field}} 占位符
function resolveTemplate(template: string, ctx: ContextMenuContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = ctx[key]
    return value !== undefined && value !== null ? String(value) : ''
  })
}

// 条件解析：boolean 直接返回，string 查注册表
function resolveCondition(
  value: boolean | string | undefined,
  ctx: ContextMenuContext,
  fallback = false,
): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  const fn = conditionRegistry[value]
  return fn ? fn(ctx) : fallback
}

function resolveLabel(label: string, ctx: ContextMenuContext): string {
  return label.includes('{{') ? resolveTemplate(label, ctx) : label
}

function isVisible(entry: ContextMenuEntry, ctx: ContextMenuContext): boolean {
  if (entry.visible === undefined) return true
  return resolveCondition(entry.visible, ctx, true)
}

// 子菜单项组件
function SubMenuItem({
  item,
  context,
  onAction,
}: {
  item: ContextMenuItemConfig
  context: ContextMenuContext
  onAction: (action: string, item?: ContextMenuItemConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [subStyle, setSubStyle] = useState<React.CSSProperties>({})

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const handleEnter = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => setOpen(true), 120)
  }, [clearTimer])

  const handleLeave = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => setOpen(false), 200)
  }, [clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  // 计算子菜单位置，避免超出视口
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const subW = 200
    const padding = 8
    const style: React.CSSProperties = { top: -6 }
    if (rect.right + subW + padding > window.innerWidth) {
      style.right = '100%'
      style.marginRight = 2
    } else {
      style.left = '100%'
      style.marginLeft = 2
    }
    setSubStyle(style)
  }, [open])

  const Icon = item.icon ? resolveIcon(item.icon) : null

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className={menuItemClass}>
        {Icon && <Icon className={menuIconClass} />}
        <span className="flex-1">{resolveLabel(item.label, context)}</span>
        <ChevronRight className="h-3.5 w-3.5 opacity-50 ml-auto" />
      </div>
      {open && item.children && (
        <div
          ref={subRef}
          className="absolute z-10 min-w-[11rem] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
          style={subStyle}
        >
          <div className="absolute inset-0 bg-white/60 backdrop-blur-2xl backdrop-saturate-150 rounded-xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-white/10 rounded-xl" />
          <div className="absolute inset-0 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.05),inset_0_0.5px_0_rgba(255,255,255,0.8)]" />
          <div className="relative py-1.5 px-1.5">
            <MenuItems items={item.children} context={context} onAction={onAction} />
          </div>
        </div>
      )}
    </div>
  )
}

// 菜单项列表渲染
function MenuItems({
  items,
  context,
  onAction,
}: {
  items: ContextMenuEntry[]
  context: ContextMenuContext
  onAction: (action: string, item?: ContextMenuItemConfig) => void
}) {
  return (
    <>
      {items.map((entry) => {
        if (!isVisible(entry, context)) return null

        // Divider
        if (entry.type === 'divider') {
          return <div key={entry.id} className={menuDividerClass} />
        }

        // Header
        if (entry.type === 'header') {
          return (
            <div
              key={entry.id}
              className="px-3 py-1.5 text-[0.6875rem] text-slate-500 font-medium border-b border-black/5 mb-1"
            >
              {resolveLabel(entry.label, context)}
            </div>
          )
        }

        // Item with children → submenu
        const item = entry as ContextMenuItemConfig
        if (item.children && item.children.some(child => isVisible(child, context))) {
          return <SubMenuItem key={item.id} item={item} context={context} onAction={onAction} />
        }

        // Regular item
        const Icon = item.icon ? resolveIcon(item.icon) : null
        const isDanger = item.variant === 'danger'
        const showDividerAfter = resolveCondition(item.dividerAfter, context)

        return (
          <div key={item.id}>
            <button
              onClick={() => onAction(item.action, item as ContextMenuItemConfig)}
              className={isDanger ? menuItemDangerClass : menuItemClass}
            >
              {Icon && <Icon className={menuIconClass} />}
              {resolveLabel(item.label, context)}
            </button>
            {showDividerAfter && <div className={menuDividerClass} />}
          </div>
        )
      })}
    </>
  )
}

export default function ContextMenuRenderer({ config, context, onAction }: ContextMenuRendererProps) {
  return <MenuItems items={config.items} context={context} onAction={onAction} />
}
