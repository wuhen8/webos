import { useState, useEffect, useRef } from "react"
import { useTranslation } from 'react-i18next'
import { Lock, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface ExtractPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  onConfirm: (password: string) => void
  hasError?: boolean
}

export function ExtractPasswordDialog({ open, onOpenChange, fileName, onConfirm, hasError }: ExtractPasswordDialogProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState("")
  const [shaking, setShaking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // When hasError flips to true, trigger shake + clear
  useEffect(() => {
    if (hasError && open) {
      setShaking(true)
      setPassword("")
      const timer = setTimeout(() => setShaking(false), 500)
      return () => clearTimeout(timer)
    }
  }, [hasError, open])

  // Reset on open
  useEffect(() => {
    if (open) {
      setPassword("")
      setShaking(false)
    }
  }, [open])

  const handleConfirm = () => {
    if (!password.trim()) return
    onConfirm(password)
  }

  const handleCancel = () => {
    setPassword("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent draggable className="rounded-2xl border border-white/30 bg-white/15 backdrop-blur-2xl max-w-md">
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
            20%, 40%, 60%, 80% { transform: translateX(4px); }
          }
          .shake { animation: shake 0.5s ease-in-out; }
        `}</style>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">{t('apps.fileManager.extractDialog.title')}</DialogTitle>
          <DialogDescription className="text-sm text-slate-700">
            {t('apps.fileManager.extractDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="truncate font-medium">{fileName}</span>
          </div>
          <input
            ref={inputRef}
            type="password"
            className={`w-full h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50${shaking ? ' shake' : ''}`}
            placeholder={t('apps.fileManager.extractDialog.placeholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm()
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-white/20 hover:bg-white/30 border-white/30 text-slate-900"
            onClick={handleCancel}
          >
            {t('apps.fileManager.extractDialog.cancel')}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-blue-500/80 hover:bg-blue-500 border-blue-400/50 text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!password.trim()}
            onClick={handleConfirm}
          >
            <Unlock className="h-4 w-4 mr-2" />
            {t('apps.fileManager.extractDialog.extract')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
