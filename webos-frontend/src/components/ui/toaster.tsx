import { AnimatePresence, motion } from "framer-motion"
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { ToastVariant } from "@/hooks/use-toast"

function getIcon(variant: ToastVariant = "default") {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    case "destructive":
      return <AlertCircle className="h-5 w-5 text-red-500" />
    default:
      return <Info className="h-5 w-5 text-blue-500" />
  }
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-8 right-3 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-[22rem] w-full">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="pointer-events-auto group relative"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.16),0_0_0_0.5px_rgba(0,0,0,0.06)]">
              {/* Glass background */}
              <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl backdrop-saturate-150" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-white/20" />

              {/* Content */}
              <div className="relative flex items-start gap-3 px-3.5 py-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(t.variant)}
                </div>
                <div className="flex-1 min-w-0">
                  {t.title && (
                    <p className="text-[13px] font-semibold text-gray-900 leading-tight">
                      {t.title}
                    </p>
                  )}
                  {t.description && (
                    <p className="text-[12px] text-gray-500 leading-snug mt-0.5 line-clamp-2">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-0.5 -mr-1 p-0.5 rounded-full hover:bg-black/5"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>

              {/* Auto-dismiss progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/[0.03]">
                <motion.div
                  className={`h-full ${
                    t.variant === "destructive"
                      ? "bg-red-400/40"
                      : t.variant === "success"
                        ? "bg-green-400/40"
                        : "bg-blue-400/40"
                  }`}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 4, ease: "linear" }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
