import { useState } from "react"
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
}

export function ExtractPasswordDialog({ open, onOpenChange, fileName, onConfirm }: ExtractPasswordDialogProps) {
  const [password, setPassword] = useState("")

  const handleConfirm = () => {
    onConfirm(password)
    setPassword("")
    onOpenChange(false)
  }

  const handleCancel = () => {
    setPassword("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent draggable className="rounded-2xl border border-white/30 bg-white/15 backdrop-blur-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">需要密码</DialogTitle>
          <DialogDescription className="text-sm text-slate-700">
            压缩包已加密，请输入密码以解压
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="truncate font-medium">{fileName}</span>
          </div>
          <input
            type="password"
            className="w-full h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="请输入解压密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password.trim()) {
                handleConfirm()
              }
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
            取消
          </Button>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-blue-500/80 hover:bg-blue-500 border-blue-400/50 text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!password.trim()}
            onClick={handleConfirm}
          >
            <Unlock className="h-4 w-4 mr-2" />
            解压
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
