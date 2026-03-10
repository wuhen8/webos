import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

interface ProgressDialogProps {
  open: boolean
  title: string
  message?: string
  progress?: number  // 0-1, undefined = indeterminate
  cancellable?: boolean
  onCancel?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export function ProgressDialog({
  open,
  title,
  message,
  progress,
  cancellable = false,
  onCancel,
}: ProgressDialogProps) {
  const pct = progress != null ? Math.round(progress * 100) : null
  const description = message || `${title}，请稍候。`

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && cancellable && onCancel) onCancel() }}>
      <DialogContent
        showClose={false}
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (!cancellable) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (!cancellable) e.preventDefault()
        }}
      >
        <DialogTitle className="text-[0.9375rem] font-semibold text-black/80">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>

        <div className="space-y-4">
          {message && (
            <p className="text-[0.8125rem] text-black/50 truncate">{message}</p>
          )}

          <div className="space-y-2">
            {pct != null ? (
              <>
                <div className="h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[0.75rem] text-black/40 text-right">
                  {pct}%
                </div>
              </>
            ) : (
              <>
                <div className="h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-blue-400/60 animate-indeterminate" />
                </div>
                <div className="text-[0.75rem] text-black/40 text-right">
                  处理中...
                </div>
              </>
            )}
          </div>

          {cancellable && onCancel && (
            <div className="flex justify-end">
              <button
                onClick={onCancel}
                className="h-8 rounded-md px-4 text-[0.8125rem] font-medium text-slate-700 bg-gradient-to-b from-white to-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_0.5px_rgba(0,0,0,0.1)] hover:from-slate-50 hover:to-slate-150 active:from-slate-100 active:to-slate-200 active:scale-[0.98] transition-all duration-150"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
