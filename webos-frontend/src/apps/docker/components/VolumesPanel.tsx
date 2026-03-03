import { useState } from "react"
import { Search, Trash2, Plus, Eye } from "lucide-react"
import type { DockerVolume, DockerContainer } from "./types"

interface VolumesPanelProps {
  volumes: DockerVolume[]
  containers: DockerContainer[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  onRemove: (name: string) => void
  onCreate: (name: string, driver: string) => void
  onInspect: (name: string) => void
}

export function VolumesPanel({ volumes, containers, searchQuery, setSearchQuery, onRemove, onCreate, onInspect }: VolumesPanelProps) {
  const [createName, setCreateName] = useState("")
  const [createDriver, setCreateDriver] = useState("")

  const handleCreate = () => {
    const name = createName.trim()
    if (!name) return
    onCreate(name, createDriver.trim())
    setCreateName("")
    setCreateDriver("")
  }

  const filtered = volumes.filter((v) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return v.name?.toLowerCase().includes(q) || v.driver?.toLowerCase().includes(q) || v.mountpoint?.toLowerCase().includes(q)
  })

  // Build a map: volume name -> container names
  const volumeContainers = new Map<string, string[]>()
  for (const c of containers) {
    if (!c.mounts) continue
    for (const m of c.mounts) {
      if (!m.name) continue
      const list = volumeContainers.get(m.name) || []
      list.push(c.name)
      volumeContainers.set(m.name, list)
    }
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索卷名、驱动或挂载点..."
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="卷名称"
            className="w-32 px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          <input
            type="text" value={createDriver} onChange={(e) => setCreateDriver(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="驱动 (默认 local)"
            className="w-36 px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          <button onClick={handleCreate} disabled={!createName.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[0.6875rem] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" />
            创建
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-100 bg-white/50">
        <table className="w-full text-[0.6875rem]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">名称</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">驱动</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">挂载点</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">容器</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
              <th className="px-3 py-2 text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider" style={{ width: 70 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((vol) => {
              const linked = volumeContainers.get(vol.name) || []
              return (
                <tr key={vol.name} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-1.5 text-slate-700 font-medium truncate max-w-[14rem] font-mono">{vol.name}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[0.625rem] font-medium">{vol.driver}</span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 font-mono truncate max-w-[14rem]" title={vol.mountpoint}>{vol.mountpoint}</td>
                  <td className="px-3 py-1.5">
                    {linked.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {linked.map((name) => (
                          <span key={name} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[0.5625rem] font-medium">{name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[0.5625rem]">空闲</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{vol.createdAt ? new Date(vol.createdAt).toLocaleString() : "-"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onInspect(vol.name)} className="p-0.5 text-slate-300 hover:text-blue-500 transition-colors rounded hover:bg-blue-50" title="详情">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onRemove(vol.name)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded hover:bg-red-50" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {searchQuery ? "没有匹配的卷" : "暂无卷"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
