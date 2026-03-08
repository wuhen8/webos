import { Fragment, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { X, Plus, TerminalSquare, Keyboard } from "lucide-react"
import "@xterm/xterm/css/xterm.css"
import { terminalDragTabRef } from "@/stores"
import { useCurrentProcess } from "@/hooks/useCurrentProcess"
import { useTerminalStore } from "./store"
import { useWebSocketStore } from "@/stores/webSocketStore"
import { terminalService } from "@/lib/services"
import { loadSnippets, useSnippetVersion } from "./snippets"

// Special keys that mobile keyboards don't have
interface QuickAction {
  label: string
  input: string
  tip?: string
}

const KEY_GROUPS: QuickAction[][] = [
  // utility
  [
    { label: 'Tab', input: '\t', tip: '自动补全' },
    { label: 'Esc', input: '\x1b', tip: 'Escape' },
  ],
  // arrows
  [
    { label: '↑', input: '\x1b[A', tip: '上一条命令' },
    { label: '↓', input: '\x1b[B', tip: '下一条命令' },
    { label: '←', input: '\x1b[D', tip: '光标左移' },
    { label: '→', input: '\x1b[C', tip: '光标右移' },
  ],
  // navigation
  [
    { label: 'Home', input: '\x1b[H', tip: '行首' },
    { label: 'End', input: '\x1b[F', tip: '行尾' },
    { label: 'PgUp', input: '\x1b[5~', tip: '向上翻页' },
    { label: 'PgDn', input: '\x1b[6~', tip: '向下翻页' },
  ],
  // symbols
  [
    { label: '/', input: '/', tip: '/' },
    { label: '-', input: '-', tip: '-' },
    { label: '\\', input: '\\', tip: '\\' },
    { label: '|', input: '|', tip: '管道符' },
  ],
]

export interface SingleTerminalHandle {
  sendInput: (data: string) => void
  focus: () => void
  /** Set a modifier that intercepts the next keystroke */
  setModifier: (mod: 'ctrl' | 'alt' | null) => void
}

const TERMINAL_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  selectionForeground: "#ffffff",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#d7ba7d",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
}

interface SingleTerminalProps {
  tabId: string
  visible: boolean
  isWindowActive: boolean
  initialCommand?: string
  onModifierConsumed?: () => void
  /** 底部预留空间（用于工具栏） */
  bottomPadding?: number
}

const SingleTerminal = forwardRef<SingleTerminalHandle, SingleTerminalProps>(function SingleTerminal({ tabId, visible, isWindowActive, initialCommand, onModifierConsumed, bottomPadding = 0 }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sidRef = useRef<string | null>(null)
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(false)

  const modifierRef = useRef<'ctrl' | 'alt' | null>(null)

  useImperativeHandle(ref, () => ({
    sendInput(data: string) {
      if (sidRef.current) {
        terminalService.input(sidRef.current, data)
      }
    },
    focus() {
      xtermRef.current?.focus()
    },
    setModifier(mod: 'ctrl' | 'alt' | null) {
      modifierRef.current = mod
    },
  }))
  const initialCommandSentRef = useRef(false)
  const connected = useWebSocketStore((s) => s.connected)

  const sendResize = useCallback(() => {
    const fitAddon = fitAddonRef.current
    const sid = sidRef.current
    if (!fitAddon || !sid) return
    try {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && dims.cols > 0 && dims.rows > 0) {
      terminalService.resize(sid, dims.cols, dims.rows)
      }
    } catch {}
  }, [])

  const openSession = useCallback(() => {
    const term = xtermRef.current
    if (!term || !mountedRef.current) return
    if (!useWebSocketStore.getState().connected) return

    terminalService.open((sid) => {
      if (!mountedRef.current) {
        // Component unmounted while waiting for response
        terminalService.close(sid)
        return
      }

      // Close previous session if any (handles StrictMode double-mount)
      if (sidRef.current) {
        terminalService.close(sidRef.current)
      }
      // Dispose previous handlers before registering new ones
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      if (dataDisposableRef.current) {
        dataDisposableRef.current.dispose()
        dataDisposableRef.current = null
      }

      sidRef.current = sid

      // Listen for output/exited
      unlistenRef.current = terminalService.onMessage(sid, (type, data) => {
        if (type === 'output' && data) {
          term.write(data)
        } else if (type === 'exited') {
          sidRef.current = null
          term.writeln("\r\n\x1b[90m终端进程已退出。按 Enter 重新打开...\x1b[0m")
        }
      })

      // Send initial resize
      try {
        fitAddonRef.current?.fit()
      } catch {}
      const dims = fitAddonRef.current?.proposeDimensions()
      if (dims && dims.cols > 0 && dims.rows > 0) {
        terminalService.resize(sid, dims.cols, dims.rows)
      }

      // Wire up input
      dataDisposableRef.current = term.onData((input) => {
        if (sidRef.current) {
          const mod = modifierRef.current
          if (mod === 'ctrl' && input.length === 1 && /[a-zA-Z]/.test(input)) {
            const code = input.toUpperCase().charCodeAt(0) - 64
            terminalService.input(sidRef.current, String.fromCharCode(code))
            modifierRef.current = null
            onModifierConsumed?.()
          } else if (mod === 'alt' && input.length === 1) {
            terminalService.input(sidRef.current, '\x1b' + input)
            modifierRef.current = null
            onModifierConsumed?.()
          } else {
            terminalService.input(sidRef.current, input)
          }
        } else if (input === "\r") {
          openSession()
        }
      })

      // Send initial command if provided
      if (initialCommand && !initialCommandSentRef.current) {
        initialCommandSentRef.current = true
        setTimeout(() => {
          if (sidRef.current) {
            terminalService.input(sidRef.current, initialCommand + '\n')
          }
        }, 300)
      }
    })
  }, [])

  // Initialize terminal
  useEffect(() => {
    if (!termRef.current) return
    mountedRef.current = true

    const term = new Terminal({
      fontSize: 13,
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      theme: TERMINAL_THEME,
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: false,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    term.open(termRef.current)

    const initTimer = setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {}
      openSession()
    }, 200)

    return () => {
      clearTimeout(initTimer)
      mountedRef.current = false
      dataDisposableRef.current?.dispose()
      dataDisposableRef.current = null
      unlistenRef.current?.()
      unlistenRef.current = null
      if (sidRef.current) {
        terminalService.close(sidRef.current)
        sidRef.current = null
      }
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [openSession])

  // Handle reconnection: when WS reconnects, old pty is dead, reopen session
  const prevConnected = useRef(connected)
  useEffect(() => {
    if (connected && !prevConnected.current && xtermRef.current) {
      // WS just reconnected
      sidRef.current = null
      xtermRef.current.writeln("\r\n\x1b[90m连接已恢复，正在重新打开终端...\x1b[0m")
      openSession()
    }
    if (!connected && prevConnected.current && xtermRef.current) {
      xtermRef.current.writeln("\r\n\x1b[90m连接已断开...\x1b[0m")
    }
    prevConnected.current = connected
  }, [connected, openSession])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let resizeTimer: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        sendResize()
      }, 100)
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)

    return () => {
      clearTimeout(resizeTimer)
      observer.disconnect()
    }
  }, [sendResize])

  // Focus + refit when becoming visible or window activated
  useEffect(() => {
    if (visible && isWindowActive && xtermRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
        } catch {}
        xtermRef.current?.focus()
      }, 50)
    }
  }, [visible, isWindowActive])

  // Refit when bottom padding changes (toolbar show/hide)
  useEffect(() => {
    if (visible && xtermRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
        } catch {}
      }, 50)
    }
  }, [visible, bottomPadding])

  return (
    <div
      ref={containerRef}
      className="absolute bg-[#1e1e1e] overflow-hidden"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        left: 0,
        right: 0,
        top: 0,
        bottom: bottomPadding,
      }}
    >
      <div ref={termRef} className="h-full w-full" style={{ padding: '0.25rem' }} />
    </div>
  )
})

function QuickActionsBar({ onSend, onModifier, activeModifier, visible }: {
  onSend: (input: string) => void
  onModifier: (mod: 'ctrl' | 'alt' | null) => void
  activeModifier: 'ctrl' | 'alt' | null
  visible: boolean
}) {
  const snippetVer = useSnippetVersion()
  const snippets = loadSnippets()

  const separator = <div className="w-px h-5 bg-white/[0.06] mx-1 shrink-0" />

  return (
    <div
      className="absolute bottom-2 left-0 right-0 flex justify-center z-10 transition-all duration-200 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(0.75rem)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl overflow-x-auto"
        style={{
          background: 'rgba(30,30,30,0.75)',
          backdropFilter: 'blur(40px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
          border: '0.5px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Modifier keys */}
        <button
          onPointerDown={(e) => { e.preventDefault(); onModifier(activeModifier === 'ctrl' ? null : 'ctrl') }}
          className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all shrink-0 ${
            activeModifier === 'ctrl'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-[#9d9d9d] hover:bg-white/10 active:bg-white/15'
          }`}
        >
          Ctrl
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onModifier(activeModifier === 'alt' ? null : 'alt') }}
          className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all shrink-0 ${
            activeModifier === 'alt'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-[#9d9d9d] hover:bg-white/10 active:bg-white/15'
          }`}
        >
          Alt
        </button>
        {separator}
        {/* Key groups */}
        {KEY_GROUPS.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && separator}
            {group.map((k) => (
              <button
                key={k.label}
                onPointerDown={(e) => { e.preventDefault(); onSend(k.input) }}
                title={k.tip}
                className="px-2.5 py-1 text-xs rounded-lg text-[#9d9d9d] hover:bg-white/10 active:bg-white/15 transition-all shrink-0"
              >
                {k.label}
              </button>
            ))}
          </Fragment>
        ))}
        {/* User snippets */}
        {snippets.length > 0 && (
          <>
            {separator}
            {snippets.map((s) => (
              <button
                key={s.id}
                onPointerDown={(e) => { e.preventDefault(); onSend(s.command + '\n') }}
                title={s.command}
                className="px-2.5 py-1 text-xs rounded-lg text-[#4ec9b0] hover:bg-[#4ec9b0]/15 active:bg-[#4ec9b0]/25 transition-all shrink-0 font-mono"
              >
                {s.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

interface TerminalContentProps {
  windowId: string
  isActive: boolean
}

export default function TerminalContent({ windowId, isActive }: TerminalContentProps) {
  const { win, procState: d } = useCurrentProcess(windowId)
  const terminalTabs = (d.terminalTabs || []) as any[]
  const activeTerminalTabIndex = (d.activeTerminalTabIndex as number) ?? 0
  const addTerminalTab = useTerminalStore((s) => s.addTerminalTab)
  const closeTerminalTab = useTerminalStore((s) => s.closeTerminalTab)
  const switchTerminalTab = useTerminalStore((s) => s.switchTerminalTab)
  const reorderTerminalTabs = useTerminalStore((s) => s.reorderTerminalTabs)
  const [showToolbar, setShowToolbar] = useState(false)
  const [activeModifier, setActiveModifier] = useState<'ctrl' | 'alt' | null>(null)
  const dragCounterRef = useRef(0)

  // Keep a ref map for each tab's SingleTerminal handle
  const terminalRefs = useRef<Map<string, SingleTerminalHandle>>(new Map())

  const handleModifier = useCallback((mod: 'ctrl' | 'alt' | null) => {
    setActiveModifier(mod)
    // Propagate to the active terminal's interceptor
    const activeTab = terminalTabs[activeTerminalTabIndex]
    const tabKey = activeTab?.id ?? windowId
    const handle = terminalRefs.current.get(tabKey)
    if (handle) {
      handle.setModifier(mod)
      handle.focus()
    }
  }, [terminalTabs, activeTerminalTabIndex, windowId])

  const handleSendInput = useCallback((input: string) => {
    const activeTab = terminalTabs[activeTerminalTabIndex]
    const tabKey = activeTab?.id ?? windowId
    const handle = terminalRefs.current.get(tabKey)
    if (handle) {
      handle.sendInput(input)
      handle.focus()
    }
  }, [terminalTabs, activeTerminalTabIndex, windowId])

  const handleModifierConsumed = useCallback(() => {
    setActiveModifier(null)
  }, [])

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0

    const jsonData = e.dataTransfer.getData('application/json')
    if (!jsonData) return

    try {
      const raw = JSON.parse(jsonData)
      const items = Array.isArray(raw) ? raw : [raw]
      const paths = items
        .filter((f: any) => f.path)
        .map((f: any) => f.path)

      if (paths.length > 0) {
        handleSendInput(paths.join(' '))
      }
    } catch { /* ignore invalid data */ }
  }, [handleSendInput])

  // Fallback: if no tabs exist (e.g. old window state), show single terminal
  if (terminalTabs.length === 0) {
    return (
      <div
        className="h-full w-full bg-[#1e1e1e] overflow-hidden relative flex flex-col"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex-1 relative">
          <SingleTerminal
            ref={(h) => { if (h) terminalRefs.current.set(windowId, h); else terminalRefs.current.delete(windowId) }}
            tabId={windowId} visible={true} isWindowActive={isActive}
            onModifierConsumed={handleModifierConsumed}
            bottomPadding={showToolbar ? 48 : 0}
          />
          <QuickActionsBar onSend={handleSendInput} onModifier={handleModifier} activeModifier={activeModifier} visible={showToolbar} />
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full w-full flex flex-col bg-[#1e1e1e] overflow-hidden"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Tab bar */}
      <div className="flex items-center h-9 px-2 bg-[#252526] border-b border-[#3c3c3c] overflow-x-auto gap-1 shrink-0">
        {terminalTabs.map((tab: any, index: number) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => {
              terminalDragTabRef.current = { windowId, fromIndex: index }
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", String(index))
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
            }}
            onDrop={(e) => {
              e.preventDefault()
              const dragging = terminalDragTabRef.current
              terminalDragTabRef.current = null
              if (!dragging) return
              if (dragging.windowId !== windowId) return
              if (dragging.fromIndex === index) return
              reorderTerminalTabs(windowId, dragging.fromIndex, index)
            }}
            onDragEnd={() => {
              terminalDragTabRef.current = null
            }}
            onClick={() => switchTerminalTab(windowId, index)}
            className={`group flex items-center gap-1.5 px-3 py-1 min-w-[5rem] max-w-[10rem] cursor-pointer rounded-md transition-all duration-150 ${
              index === activeTerminalTabIndex
                ? "bg-[#1e1e1e] text-[#d4d4d4]"
                : "bg-transparent text-[#808080] hover:bg-[#2d2d2d] hover:text-[#cccccc]"
            }`}
          >
            <TerminalSquare className={`h-3 w-3 flex-shrink-0 ${index === activeTerminalTabIndex ? "text-[#4ec9b0]" : "text-[#808080]"}`} />
            <span className="text-xs font-medium truncate flex-1">{tab.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTerminalTab(windowId, index) }}
              className="opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded p-0.5 transition-all"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => addTerminalTab(windowId)}
          className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-[#2d2d2d] text-[#808080] hover:text-[#cccccc] transition-all"
          title="新建标签页"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowToolbar((v) => !v)}
          className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${
            showToolbar ? 'bg-[#3c3c3c] text-[#4ec9b0]' : 'hover:bg-[#2d2d2d] text-[#808080] hover:text-[#cccccc]'
          }`}
          title={showToolbar ? '隐藏快捷操作栏' : '显示快捷操作栏'}
        >
          <Keyboard className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal panels */}
      <div className="flex-1 relative">
        {terminalTabs.map((tab: any, index: number) => (
          <SingleTerminal
            key={tab.id}
            ref={(h) => { if (h) terminalRefs.current.set(tab.id, h); else terminalRefs.current.delete(tab.id) }}
            tabId={tab.id}
            visible={index === activeTerminalTabIndex}
            isWindowActive={isActive}
            initialCommand={tab.initialCommand}
            onModifierConsumed={handleModifierConsumed}
            bottomPadding={showToolbar ? 48 : 0}
          />
        ))}
        <QuickActionsBar onSend={handleSendInput} onModifier={handleModifier} activeModifier={activeModifier} visible={showToolbar} />
      </div>
    </div>
  )
}
