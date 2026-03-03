import { create } from 'zustand'
import { request as wsRequest } from '@/stores/webSocketStore'

const LS_KEY = 'fm_preferences_v1'

interface SavedFields {
  dockSize: number
  wallpaperUrl: string | null
  fontSize: number
  editorTheme: 'vs' | 'vs-dark'
  fileDefaultApps: Record<string, string>
}

interface SettingsState extends SavedFields {
  dataDir: string
  _settingsLoaded: boolean
  _skipAutoSave: boolean
  _lastSaved: SavedFields
  setDockSize: (v: number) => void
  setWallpaperUrl: (v: string | null) => void
  setFontSize: (v: number) => void
  setEditorTheme: (v: 'vs' | 'vs-dark') => void
  setFileDefaultApp: (ext: string, appId: string) => void
  removeFileDefaultApp: (ext: string) => void
  resetSettings: () => void
  loadSettings: () => void
  saveSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  dockSize: 56,
  wallpaperUrl: null,
  fontSize: 14,
  editorTheme: 'vs-dark',
  dataDir: '',
  fileDefaultApps: {},
  _settingsLoaded: false,
  _skipAutoSave: true,
  _lastSaved: { dockSize: 56, wallpaperUrl: null, fontSize: 14, editorTheme: 'vs-dark', fileDefaultApps: {} },

  setDockSize: (v) => {
    set({ dockSize: v })
    queueAutoSave()
  },
  setWallpaperUrl: (v) => {
    set({ wallpaperUrl: v })
    queueAutoSave()
  },
  setFontSize: (v) => {
    set({ fontSize: v })
    document.documentElement.style.fontSize = `${v}px`
    queueAutoSave()
  },
  setEditorTheme: (v) => {
    set({ editorTheme: v })
    queueAutoSave()
  },
  setFileDefaultApp: (ext, appId) => {
    const fileDefaultApps = { ...get().fileDefaultApps, [ext.toLowerCase()]: appId }
    set({ fileDefaultApps })
    queueAutoSave()
  },
  removeFileDefaultApp: (ext) => {
    const fileDefaultApps = { ...get().fileDefaultApps }
    delete fileDefaultApps[ext.toLowerCase()]
    set({ fileDefaultApps })
    queueAutoSave()
  },

  resetSettings: () => {
    const defaults = { dockSize: 56, wallpaperUrl: null as string | null, fontSize: 14, editorTheme: 'vs-dark' as const, fileDefaultApps: {} as Record<string, string> }
    set(defaults)
    document.documentElement.style.fontSize = '14px'
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(defaults))
    } catch {}
    wsRequest('preferences_reset', {}).then(() => {
      set({ _lastSaved: { ...defaults } })
    }).catch(() => {})
  },

  loadSettings: () => {
    const state = get()
    if (state._settingsLoaded) return
    if (_skipAutoSaveTimer) clearTimeout(_skipAutoSaveTimer)
    set({ _settingsLoaded: true, _skipAutoSave: true })

    // 迁移旧 key
    const oldKey = 'fm_settings'
    const oldData = localStorage.getItem(oldKey)
    if (oldData && !localStorage.getItem(LS_KEY)) {
      localStorage.setItem(LS_KEY, oldData)
      localStorage.removeItem(oldKey)
    }

    const local = localStorage.getItem(LS_KEY)
    if (local) {
      try {
        const data = JSON.parse(local)
        const initDock = typeof data.dockSize === 'number' ? data.dockSize : 56
        const initFont = typeof data.fontSize === 'number' ? data.fontSize : 14
        const initWall = data.wallpaperUrl || null
        const initTheme = data.editorTheme || 'vs-dark'
        const initFileDefApps = (data.fileDefaultApps && typeof data.fileDefaultApps === 'object') ? data.fileDefaultApps : {}
        set({
          dockSize: initDock,
          fontSize: initFont,
          wallpaperUrl: initWall,
          editorTheme: initTheme,
          fileDefaultApps: initFileDefApps,
          _lastSaved: { dockSize: initDock, wallpaperUrl: initWall, fontSize: initFont, editorTheme: initTheme, fileDefaultApps: initFileDefApps },
        })
        document.documentElement.style.fontSize = `${initFont}px`
      } catch {}
      // 从后端获取 dataDir（只读）
      wsRequest('preferences_get', {}).then((data: any) => {
        if (data?.dataDir) set({ dataDir: data.dataDir })
      }).catch(() => {})
      if (_skipAutoSaveTimer) clearTimeout(_skipAutoSaveTimer)
      _skipAutoSaveTimer = setTimeout(() => {
        set({ _skipAutoSave: false })
      }, 200)
    } else {
      ;(async () => {
        try {
          const data = await wsRequest('preferences_get', {}) || {}
          const initDock = typeof data.dockSize === 'number' ? data.dockSize : 56
          const initFont = typeof data.fontSize === 'number' ? data.fontSize : 14
          const initWall = data.wallpaperUrl || null
          const initTheme = data.editorTheme || 'vs-dark'
          const initFileDefApps = (data.fileDefaultApps && typeof data.fileDefaultApps === 'object') ? data.fileDefaultApps : {}
          set({
            dockSize: initDock,
            fontSize: initFont,
            wallpaperUrl: initWall,
            editorTheme: initTheme,
            dataDir: data.dataDir || '',
            fileDefaultApps: initFileDefApps,
            _lastSaved: { dockSize: initDock, wallpaperUrl: initWall, fontSize: initFont, editorTheme: initTheme, fileDefaultApps: initFileDefApps },
          })
          document.documentElement.style.fontSize = `${initFont}px`
          try {
            localStorage.setItem(LS_KEY, JSON.stringify({ dockSize: initDock, wallpaperUrl: initWall, fontSize: initFont, editorTheme: initTheme, fileDefaultApps: initFileDefApps }))
          } catch {}
        } catch {
          // WS not connected yet — reset flag so it retries when WS connects
          set({ _settingsLoaded: false })
        } finally {
          if (_skipAutoSaveTimer) clearTimeout(_skipAutoSaveTimer)
          _skipAutoSaveTimer = setTimeout(() => {
            set({ _skipAutoSave: false })
          }, 500)
        }
      })()
    }
  },

  saveSettings: () => {
    const { dockSize, wallpaperUrl, fontSize, editorTheme, fileDefaultApps, _lastSaved } = get()
    if (
      _lastSaved.dockSize === dockSize &&
      _lastSaved.wallpaperUrl === wallpaperUrl &&
      _lastSaved.fontSize === fontSize &&
      _lastSaved.editorTheme === editorTheme &&
      JSON.stringify(_lastSaved.fileDefaultApps) === JSON.stringify(fileDefaultApps)
    ) return

    const prefs = { dockSize, wallpaperUrl, fontSize, editorTheme, fileDefaultApps }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs))
    } catch {}
    wsRequest('preferences_save', { prefs })
      .then(() => {
        set({ _lastSaved: { ...prefs } })
      })
      .catch(() => {})
  },
}))

// Debounced auto-save
let _saveTimer: ReturnType<typeof setTimeout> | null = null
let _skipAutoSaveTimer: ReturnType<typeof setTimeout> | null = null
function queueAutoSave() {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    const { _skipAutoSave, saveSettings } = useSettingsStore.getState()
    if (!_skipAutoSave) saveSettings()
  }, 300)
}
