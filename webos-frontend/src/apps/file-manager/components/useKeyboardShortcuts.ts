import { useEffect, useRef } from "react"
import { registerWindowShortcuts, type ShortcutDef } from "@/hooks/useKeyboardDispatcher"
import type { FileInfo, ClipboardState } from "@/types"

interface KeyboardShortcutsOptions {
  windowId: string
  isActive: boolean
  files: FileInfo[]
  selectedFiles: Set<string>
  clipboard: ClipboardState | null
  setSelectedFiles: (sel: Set<string>) => void
  setClipboard: (cb: ClipboardState | null) => void
  goBack: () => void
  goForward: () => void
  handleFileDoubleClick: (file: FileInfo) => void
  confirmDelete: (files: FileInfo[]) => void
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => void
  startRename: (file: FileInfo) => void
}

export function useKeyboardShortcuts(opts: KeyboardShortcutsOptions) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const { windowId, isActive } = opts

  useEffect(() => {
    // Only the active tab registers shortcuts
    if (!isActive) return

    const shortcuts: ShortcutDef[] = [
      // ⌘[ or Alt+Left — Go back
      { key: '[', meta: true, action: () => optsRef.current.goBack() },
      { key: 'arrowleft', alt: true, action: () => optsRef.current.goBack() },
      // ⌘] or Alt+Right — Go forward
      { key: ']', meta: true, action: () => optsRef.current.goForward() },
      { key: 'arrowright', alt: true, action: () => optsRef.current.goForward() },
      // ⌘A — Select all
      {
        key: 'a', meta: true,
        action: () => {
          const { files, setSelectedFiles } = optsRef.current
          if (files.length > 0) setSelectedFiles(new Set(files.map(f => f.path)))
        },
      },
      // ⌘C — Copy
      {
        key: 'c', meta: true,
        action: () => {
          const { selectedFiles, handleCopy } = optsRef.current
          if (selectedFiles.size > 0) handleCopy()
        },
      },
      // ⌘X — Cut
      {
        key: 'x', meta: true,
        action: () => {
          const { selectedFiles, handleCut } = optsRef.current
          if (selectedFiles.size > 0) handleCut()
        },
      },
      // ⌘V — Paste
      {
        key: 'v', meta: true,
        action: () => {
          const { clipboard, handlePaste } = optsRef.current
          if (clipboard) handlePaste()
        },
      },
      // Delete — Delete selected
      {
        key: 'delete',
        action: () => {
          const { files, selectedFiles, confirmDelete } = optsRef.current
          if (selectedFiles.size > 0) confirmDelete(files.filter(f => selectedFiles.has(f.path)))
        },
      },
      // Enter — Open selected file
      {
        key: 'enter',
        action: () => {
          const { files, selectedFiles, handleFileDoubleClick } = optsRef.current
          if (selectedFiles.size === 1) {
            const f = files.find(f => selectedFiles.has(f.path))
            if (f) handleFileDoubleClick(f)
          }
        },
      },
      // F2 — Rename
      {
        key: 'f2',
        action: () => {
          const { files, selectedFiles, startRename } = optsRef.current
          if (selectedFiles.size === 1) {
            const f = files.find(f => selectedFiles.has(f.path))
            if (f) startRename(f)
          }
        },
      },
      // Escape — Clear selection / clipboard
      {
        key: 'escape',
        action: () => {
          const { selectedFiles, clipboard, setSelectedFiles, setClipboard } = optsRef.current
          if (selectedFiles.size > 0) setSelectedFiles(new Set())
          if (clipboard) setClipboard(null)
        },
      },
    ]

    const unregister = registerWindowShortcuts(windowId, shortcuts)
    return unregister
  }, [windowId, isActive])
}
