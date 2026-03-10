import { useState } from "react"
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
  const [urls, setUrls] = useState("")
  const [urlError, setUrlError] = useState("")

  const validateUrls = (text: string) => {
    const lines = text.split('\n').map(u => u.trim()).filter(u => u.length > 0)

    for (let i = 0; i < lines.length; i++) {
      try {
        new URL(lines[i])
      } catch {
        return { valid: false, error: `第 ${i + 1} 行：无效的 URL 格式` }
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
      toast({ title: "已开始下载", description: `${urlList.length} 个文件正在后台下载` })
      setUrls("")
      setUrlError("")
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: "提交失败", description: e?.message || "请求失败", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent draggable className="rounded-2xl border border-white/30 bg-white/15 backdrop-blur-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">离线下载</DialogTitle>
          <DialogDescription className="text-sm text-slate-700">输入下载链接，每行一个 URL，文件将下载到当前目录</DialogDescription>
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
            取消
          </Button>
          <Button
            variant="outline"
            className="rounded-xl transition-transform hover:scale-105 active:scale-95 bg-blue-500/80 hover:bg-blue-500 border-blue-400/50 text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!urls.trim()}
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            开始下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
