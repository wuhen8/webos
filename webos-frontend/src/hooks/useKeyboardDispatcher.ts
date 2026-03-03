import { useEffect } from 'react'
import { useWindowStore, useAuthStore } from '@/stores'

// ─── Types ───

export interface ShortcutDef {
  key: string
  meta?: boolean
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
  action: () => void
}

type UnregisterFn = () => void

// ─── Editable guard ───

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.closest('.xterm')) return true
  return false
}

// ─── Key matching (cross-platform) ───

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

function matchShortcut(def: ShortcutDef, e: KeyboardEvent): boolean {
  if (def.key !== e.key.toLowerCase()) return false

  const wantCmd = !!def.meta
  const wantCtrl = !!def.ctrl
  const wantShift = !!def.shift
  const wantAlt = !!def.alt

  if (isMac) {
    if (wantCmd !== e.metaKey) return false
    if (wantCtrl !== e.ctrlKey) return false
  } else {
    if (wantCmd !== e.ctrlKey) return false
    if (wantCtrl) return false
  }
  if (wantShift !== e.shiftKey) return false
  if (wantAlt !== e.altKey) return false
  return true
}

// ─── Registry ───
// System shortcuts: always fire (unless in editable, unless marked global)
// Window shortcuts: only fire for the active window

interface SystemShortcut extends ShortcutDef {
  /** If true, fires even when focus is in an editable element */
  global?: boolean
}

const systemShortcuts: Map<string, SystemShortcut> = new Map()
const windowShortcuts: Map<string, ShortcutDef[]> = new Map()

let systemIdSeq = 0
let windowIdSeq = 0

/**
 * Register a system-level shortcut (Layer 1).
 * These fire regardless of which window is active.
 * Returns an unregister function.
 */
export function registerSystemShortcut(def: SystemShortcut): UnregisterFn {
  const id = `sys_${++systemIdSeq}`
  systemShortcuts.set(id, def)
  return () => { systemShortcuts.delete(id) }
}

/**
 * Register shortcuts scoped to a specific window (Layer 2).
 * These only fire when the window is the active (foreground) window
 * AND focus is NOT in an editable element.
 * Returns an unregister function that removes all shortcuts for this registration.
 */
export function registerWindowShortcuts(windowId: string, defs: ShortcutDef[]): UnregisterFn {
  const id = `win_${++windowIdSeq}`
  // Store with composite key so multiple registrations per window work
  windowShortcuts.set(`${windowId}::${id}`, defs)
  return () => { windowShortcuts.delete(`${windowId}::${id}`) }
}

// ─── Dispatcher core ───

function dispatch(e: KeyboardEvent) {
  const activeEl = document.activeElement
  const inEditable = isEditableElement(activeEl)

  // Layer 1: System shortcuts
  for (const def of systemShortcuts.values()) {
    if (!matchShortcut(def, e)) continue
    // Non-global system shortcuts skip editable elements
    if (!def.global && inEditable) continue
    e.preventDefault()
    e.stopPropagation()
    def.action()
    return
  }

  // Layer 3: If in editable element, let browser handle natively
  if (inEditable) return

  // Layer 2: Active window shortcuts
  const activeWindow = useWindowStore.getState().windows.find(w => w.isActive)
  if (!activeWindow) return

  const prefix = `${activeWindow.id}::`
  for (const [key, defs] of windowShortcuts.entries()) {
    if (!key.startsWith(prefix)) continue
    for (const def of defs) {
      if (!matchShortcut(def, e)) continue
      e.preventDefault()
      e.stopPropagation()
      def.action()
      return
    }
  }
}

// ─── React hook: mounts the single document listener ───

export function useKeyboardDispatcher() {
  const authPhase = useAuthStore((s) => s.authPhase)

  useEffect(() => {
    if (authPhase !== 'authenticated') return

    document.addEventListener('keydown', dispatch, true)
    return () => document.removeEventListener('keydown', dispatch, true)
  }, [authPhase])
}
