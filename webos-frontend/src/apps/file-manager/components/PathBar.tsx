import { ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"

interface PathBarProps {
  currentPath: string
  activeNodeId: string
  editPath: boolean
  pathInput: string
  pathInputRef: React.RefObject<HTMLInputElement>
  setEditPath: (v: boolean) => void
  setPathInput: (v: string) => void
  navigateTo: (path: string) => void
  handleNavigateNode: (nodeId: string, path: string) => void
}

export function PathBar({
  currentPath, activeNodeId, editPath, pathInput, pathInputRef,
  setEditPath, setPathInput, navigateTo, handleNavigateNode,
}: PathBarProps) {
  return (
    <div className="flex items-center h-7 px-3 bg-white/30 backdrop-blur-xl border-t border-slate-200/60 text-xs text-slate-600 overflow-hidden shrink-0">
      {editPath ? (
        <Input
          ref={pathInputRef}
          autoFocus
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => setEditPath(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = pathInput.trim() || "/"
              const colonIdx = val.indexOf(":")
              if (colonIdx > 0) {
                const nodeId = val.substring(0, colonIdx)
                const path = val.substring(colonIdx + 1) || "/"
                if (nodeId !== activeNodeId) handleNavigateNode(nodeId, path)
                else navigateTo(path)
              } else {
                navigateTo(val)
              }
              setEditPath(false)
            }
            if (e.key === 'Escape') setEditPath(false)
          }}
          className="h-5 px-1 flex-1 min-w-0 text-xs bg-white/60 border-white/40 rounded"
        />
      ) : (
        <div className="flex items-center cursor-text min-w-0 overflow-hidden" onClick={() => { setEditPath(true); setPathInput(activeNodeId + ":" + currentPath) }}>
          <span className="text-slate-500 font-mono whitespace-nowrap px-0.5">{activeNodeId}:</span>
          <button onClick={(e) => { e.stopPropagation(); navigateTo("/") }} className="hover:text-blue-600 hover:underline whitespace-nowrap px-0.5">/</button>
          {currentPath.split("/").filter(Boolean).map((segment: string, index: number, arr: string[]) => {
            const segmentPath = "/" + arr.slice(0, index + 1).join("/")
            return (
              <span key={segmentPath} className="flex items-center">
                <ChevronRight className="h-3 w-3 text-slate-400 mx-0.5 flex-shrink-0" />
                <button
                  onClick={(e) => { e.stopPropagation(); navigateTo(segmentPath) }}
                  className={`hover:text-blue-600 hover:underline whitespace-nowrap px-0.5 ${
                    index === arr.length - 1 ? "font-medium text-slate-800" : ""
                  }`}
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
