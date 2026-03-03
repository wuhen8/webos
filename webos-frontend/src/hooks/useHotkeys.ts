import { useEffect } from 'react'
import { useWindowStore, useUIStore, useAuthStore } from '@/stores'
import { useEditorStore } from '@/apps/editor/store'
import { registerSystemShortcut } from './useKeyboardDispatcher'

/**
 * Registers all system-level (Layer 1) keyboard shortcuts.
 * These fire regardless of which window is active.
 */
export function useHotkeys() {
  const authPhase = useAuthStore((s) => s.authPhase)

  useEffect(() => {
    if (authPhase !== 'authenticated') return

    const unregisters = buildSystemShortcuts()
    return () => { unregisters.forEach(fn => fn()) }
  }, [authPhase])
}

function buildSystemShortcuts() {
  const {
    windows,
    openWindow,
    activateWindow,
    minimizeWindow,
    closeWindow,
  } = useWindowStore.getState()

  const {
    openNewEditor,
    saveEditorContent,
    formatEditor,
  } = useEditorStore.getState()

  const { closeGlobalMenu } = useUIStore.getState()
  const { logout } = useAuthStore.getState()

  const activeWindow = windows.find(w => w.isActive)

  const unregs: (() => void)[] = []
  const reg = (def: Parameters<typeof registerSystemShortcut>[0]) => {
    unregs.push(registerSystemShortcut(def))
  }

  // ⌘, — Open Settings
  reg({ key: ',', meta: true, action: () => openWindow('settings') })

  // ⌘N — New window (context-dependent)
  reg({
    key: 'n', meta: true,
    action: () => {
      const aw = useWindowStore.getState().windows.find(w => w.isActive)
      if (!aw || aw.type === 'fileManager') {
        openWindow('fileManager', { forceNew: true })
      } else if (aw.type === 'terminal') {
        openWindow('terminal', { forceNew: true })
      } else if (aw.type === 'editor') {
        openNewEditor()
      } else {
        openWindow('fileManager', { forceNew: true })
      }
    },
  })

  // ⌘W — Close active window
  reg({
    key: 'w', meta: true,
    action: () => {
      const aw = useWindowStore.getState().windows.find(w => w.isActive)
      if (aw) { closeGlobalMenu(); closeWindow(aw.id) }
    },
  })

  // ⌘M — Minimize active window
  reg({
    key: 'm', meta: true,
    action: () => {
      const aw = useWindowStore.getState().windows.find(w => w.isActive)
      if (aw) minimizeWindow(aw.id)
    },
  })

  // ⌘S — Save (editor only)
  reg({
    key: 's', meta: true, global: true,
    action: () => {
      const aw = useWindowStore.getState().windows.find(w => w.isActive)
      if (aw?.type === 'editor') saveEditorContent(aw.id)
    },
  })

  // ⇧⌥F — Format code (editor only)
  reg({
    key: 'f', shift: true, alt: true, global: true,
    action: () => {
      const aw = useWindowStore.getState().windows.find(w => w.isActive)
      if (aw?.type === 'editor') formatEditor(aw.id)
    },
  })

  // ⌃⌘Q — Lock screen
  reg({ key: 'q', meta: true, ctrl: true, global: true, action: () => logout() })

  // ⇧⌘Q — Logout
  reg({ key: 'q', meta: true, shift: true, global: true, action: () => logout() })

  // Escape — Close context menu
  reg({
    key: 'escape',
    action: () => {
      const el = document.activeElement
      if (el?.closest('[data-file-manager-content]')) return
      useUIStore.getState().closeGlobalMenu()
    },
  })

  // ⌘K — Open Spotlight search
  reg({
    key: 'k', meta: true, global: true,
    action: () => {
      const { spotlightOpen, setSpotlightOpen } = useUIStore.getState()
      setSpotlightOpen(!spotlightOpen)
    },
  })

  // ⌘` — Cycle through windows
  reg({
    key: '`', meta: true,
    action: () => {
      const ws = useWindowStore.getState().windows
      const visible = ws.filter(w => !w.isMinimized)
      if (visible.length < 2) return
      const sorted = [...visible].sort((a, b) => b.zIndex - a.zIndex)
      const next = sorted[1]
      if (next) activateWindow(next.id)
    },
  })

  // F4 — Toggle Launchpad
  reg({
    key: 'f4', global: true,
    action: () => {
      const { launchpadOpen, setLaunchpadOpen } = useUIStore.getState()
      setLaunchpadOpen(!launchpadOpen)
    },
  })

  return unregs
}
