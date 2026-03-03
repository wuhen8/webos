import { useState } from "react"
import { Search, Trash2, Download } from "lucide-react"
import type { DockerImage } from "./types"
import { formatBytes, formatTimeSince } from "./types"

interface ImagesPanelProps {
  images: DockerImage[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  onRemove: (id: string) => void
  onPull: (imageName: string) => void
}

export function ImagesPanel({ images, searchQuery, setSearchQuery, onRemove, onPull }: ImagesPanelProps) {
  const [pullInput, setPullInput] = useState("")

  const handlePull = () => {
    const name = pullInput.trim()
    if (!name) return
    onPull(name)
    setPullInput("")
  }

  const filtered = images.filter((img) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return img.repository?.toLowerCase().includes(q) || img.tag?.toLowerCase().includes(q) || img.id?.toLowerCase().includes(q)
  })

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索镜像名、标签或 ID..."
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={pullInput}
            onChange={(e) => setPullInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePull()}
            placeholder="nginx:latest"
            className="w-48 px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          <button
            onClick={handlePull}
            disabled={!pullInput.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            拉取
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">仓库</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">标签</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">大小</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
              <th className="px-3 py-2 text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider" style={{ width: 50 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((img, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-1.5 text-slate-700 font-medium truncate max-w-[12.5rem]">{img.repository}</td>
                <td className="px-3 py-1.5">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[0.625rem] font-medium">{img.tag}</span>
                </td>
                <td className="px-3 py-1.5 text-slate-500 font-mono">{img.shortId}</td>
                <td className="px-3 py-1.5 text-slate-500">{formatBytes(img.size)}</td>
                <td className="px-3 py-1.5 text-slate-400">{formatTimeSince(img.createdAt)}</td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => onRemove(img.id)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded hover:bg-red-50" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {searchQuery ? "没有匹配的镜像" : "暂无镜像"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
