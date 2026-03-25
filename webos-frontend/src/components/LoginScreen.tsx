import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores'
import request from '@/lib/request'
import { getServerUrl, setServerUrl } from '@/lib/env'

interface LoginScreenProps {
  onCancel?: () => void
}

export default function LoginScreen({ onCancel }: LoginScreenProps) {
  const { t } = useTranslation()
  const authPhase = useAuthStore((s) => s.authPhase)
  const login = useAuthStore((s) => s.login)
  const [passwordInput, setPasswordInput] = useState("")
  const [shaking, setShaking] = useState(false)
  const [needSetup, setNeedSetup] = useState<boolean | null>(null)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [setupError, setSetupError] = useState("")
  const [serverUrl, setServerUrlInput] = useState(getServerUrl() || window.location.origin)
  const [serverError, setServerError] = useState("")

  const applyServerUrl = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, '')
    // 同源时存空字符串，走相对路径
    const toSave = trimmed === window.location.origin ? '' : trimmed
    setServerUrl(toSave)
    request.defaults.baseURL = toSave ? `${toSave}/api` : '/api'
  }

  const checkAuthStatus = () => {
    setNeedSetup(null)
    setServerError("")
    request.get('/auth/status').then((resp) => {
      setNeedSetup(resp.data?.data?.needSetup ?? false)
      setServerError("")
    }).catch(() => {
      setNeedSetup(false)
      setServerError(t('login.serverUnreachable'))
    })
  }

  useEffect(() => { checkAuthStatus() }, [])

  const handleServerBlur = () => {
    applyServerUrl(serverUrl)
    checkAuthStatus()
  }

  const handleLogin = async () => {
    if (passwordInput.trim()) {
      const success = await login(passwordInput)
      if (success) {
        setPasswordInput("")
      } else {
        setShaking(true)
        setPasswordInput("")
        setTimeout(() => setShaking(false), 500)
      }
    }
  }

  const handleSetupPassword = async () => {
    setSetupError("")
    if (!passwordInput.trim()) {
      setSetupError(t('login.passwordRequired'))
      return
    }
    if (passwordInput !== confirmPassword) {
      setSetupError(t('login.passwordMismatch'))
      return
    }
    const success = await useAuthStore.getState().setupPassword(passwordInput)
    if (success) {
      setPasswordInput("")
      setConfirmPassword("")
    } else {
      setSetupError(t('login.setupFailed'))
    }
  }

  const serverInput = (
    <div className="space-y-1">
      <Input
        placeholder="https://example.com"
        value={serverUrl}
        onChange={(e) => setServerUrlInput(e.target.value)}
        onBlur={handleServerBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') { handleServerBlur(); (e.target as HTMLInputElement).blur() } }}
      />
      {serverError && <div className="text-red-500 text-xs">{serverError}</div>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center" onContextMenu={(e) => e.preventDefault()}>
      {(authPhase === 'checking' || needSetup === null) ? (
        <div className="text-white text-sm">{t('login.checkingStatus')}</div>
      ) : needSetup ? (
        <div className="bg-white/90 rounded-2xl p-6 border border-white/40 w-80 relative">
          {onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-lg mb-3">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="text-slate-800 text-lg font-medium">{t('login.setupTitle')}</div>
            <div className="text-slate-500 text-xs mt-1">{t('login.setupSubtitle')}</div>
          </div>
          <div className="space-y-3">
            {serverInput}
            <Input
              type="password"
              placeholder={t('login.enterPassword')}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t('login.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetupPassword()}
            />
            {setupError && (
              <div className="text-red-500 text-xs text-center">{setupError}</div>
            )}
            <Button
              variant="outline"
              className="rounded-xl bg-white/20 border-white/30 w-full"
              onClick={handleSetupPassword}
            >
              {t('login.setupPasswordAndLogin')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={`bg-white/90 rounded-2xl p-6 border border-white/40 w-80 relative ${shaking ? 'animate-shake' : ''}`}>
          {onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-lg mb-3">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="text-slate-800 text-lg font-medium">{t('login.user')}</div>
          </div>
          <div className="space-y-3">
            {serverInput}
            <Input
              type="password"
              placeholder={t('login.enterPasswordToLogin')}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button
              variant="outline"
              className="rounded-xl bg-white/20 border-white/30 w-full"
              onClick={handleLogin}
            >
              {t('login.login')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
