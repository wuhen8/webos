import { create } from 'zustand'
import request, { setToken, removeToken } from '@/lib/request'

export type AuthPhase = 'checking' | 'unauthenticated' | 'authenticated'

interface AuthState {
  authPhase: AuthPhase
  /** @deprecated use authPhase !== 'authenticated' */
  locked: boolean
  /** @deprecated use authPhase === 'checking' */
  isCheckingAuth: boolean
  login: (password: string) => Promise<boolean>
  setupPassword: (password: string) => Promise<boolean>
  logout: () => void
  getUserInfo: () => { username: string; avatar: string } | null
  checkAuth: () => void
}

function deriveCompat(phase: AuthPhase) {
  return {
    authPhase: phase,
    locked: phase !== 'authenticated',
    isCheckingAuth: phase === 'checking',
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...deriveCompat('checking'),

  login: async (password: string) => {
    try {
      const resp = await request.post('/login', { password })
      if (resp.data?.data?.token) {
        setToken(resp.data.data.token)
        set(deriveCompat('checking'))
        return true
      }
    } catch {}
    return false
  },

  setupPassword: async (password: string) => {
    try {
      const resp = await request.post('/setup-password', { password })
      const token = resp.data?.data?.token
      if (token) {
        setToken(token)
        set(deriveCompat('checking'))
        return true
      }
    } catch {}
    return false
  },

  logout: () => {
    removeToken()
    localStorage.removeItem('userInfo')
    set(deriveCompat('unauthenticated'))
  },

  getUserInfo: () => {
    try {
      const info = localStorage.getItem('userInfo')
      return info ? JSON.parse(info) : null
    } catch {
      return null
    }
  },

  checkAuth: () => {
    const token = localStorage.getItem('fm_token')
    if (!token) {
      set(deriveCompat('unauthenticated'))
      return
    }
    set(deriveCompat('checking'))
  },
}))

// ── Event-driven bridge from webSocketStore ──

function onWsAuthOk(e: Event) {
  const userInfo = (e as CustomEvent).detail
  if (userInfo) {
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  }
  useAuthStore.setState(deriveCompat('authenticated'))
}

function onWsAuthFail() {
  removeToken()
  localStorage.removeItem('userInfo')
  useAuthStore.setState(deriveCompat('unauthenticated'))
}

window.addEventListener('ws:auth-ok', onWsAuthOk)
window.addEventListener('ws:auth-fail', onWsAuthFail)

// Listen for 401 events
window.addEventListener('auth:unauthorized', () => {
  const { logout } = useAuthStore.getState()
  logout()
})

// Auto-check auth on load
useAuthStore.getState().checkAuth()
