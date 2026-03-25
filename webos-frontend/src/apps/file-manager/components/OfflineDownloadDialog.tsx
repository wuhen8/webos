import { useState } from "react"
import { useTranslation } from 'react-i18next'
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { fsApi } from "@/lib/storageApi"

interface OfflineDownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeNodeId: string
  currentPath: string
  toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"]
}

export function OfflineDownloadDialog({ open, onOpenChange, activeNodeId, currentPath, toast }: OfflineDownloadDialogProps) {
  const { t } = useTranslation()
  const [urls, setUrls] = useState("")
  const [urlError, setUrlError] = useState("")

  const validateUrls = (text: string) => {
    const lines = text.split('\n').map(u => u.trim()).filter(u => u.length > 0)

    for (let i = 0; i < lines.length; i++) {
      try {
        new URL(lines[i])
      } catch {
        return { valid: false, error: t('apps.fileManager.offlineDownload.invalidUrl', { line: i + 1 }) }
      }
    }

    return { valid: true, error: "" }
  }

  const handleDownload = async () => {
    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0)
    if (urlList.length === 0) return

    const { valid, error } = validateUrls(urls)
    if (!valid) {
      setUrlError(error)
      return
    }

    try {
      await fsApi.offlineDownload(activeNodeId, currentPath, urlList)
      toast({ title: t('apps.fileManager.offlineDownload.started'), description: t('apps.fileManager.offlineDownload.startedDescription', { count: urlList.length }) })
      setUrls("")
      setUrlError("")
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: t('apps.fileManager.offlineDownload.submitFailed'), description: e?.message || t('apps.fileManager.offlineDownload.requestFailed'), variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent draggable className="rounded-2xl border border-white/30 bg-white/15 backdrop-blur-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">{t('apps.fileManager.offlineDownload.title')}</DialogTitle>
          <DialogDescription className="text-sm text-slate-700">{t('apps.fileManager.offlineDownload.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <textarea
            className="w-full h-32 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 p-3 text-sm text-slate-900 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder={"https://example.com/file1.zip\nhttps://example.com/file2.tar.gz"}
            value={urls}
            onChange={(e) => {
              setUrls(e.target.value)
              setUrlError("")
            }}
          />
          {urlError && (
            <div className="text-xs text-red-600 bg-red-50/50 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-red-200/50">
              {urlError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-white/20 hover:bg-white/30 border-white/30 text-slate-900"
            onClick={() => onOpenChange(false)}
          >
            {t('apps.fileManager.offlineDownload.cancel')}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-blue-500/80 hover:bg-blue-500 border-blue-400/50 text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!urls.trim()}
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            {t('apps.fileManager.offlineDownload.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
