import { useState } from "react"
import { Search, Trash2, Plus, Eye } from "lucide-react"
import type { DockerNetwork, DockerContainer } from "./types"

interface NetworksPanelProps {
  networks: DockerNetwork[]
  containers: DockerContainer[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  onRemove: (id: string) => void
  onCreate: (name: string, driver: string) => void
  onInspect: (id: string, name: string) => void
}

const BUILTIN_NETWORKS = ["bridge", "host", "none"]

export function NetworksPanel({ networks, containers, searchQuery, setSearchQuery, onRemove, onCreate, onInspect }: NetworksPanelProps) {
  const [createName, setCreateName] = useState("")
  const [createDriver, setCreateDriver] = useState("bridge")

  const handleCreate = () => {
    const name = createName.trim()
    if (!name) return
    onCreate(name, createDriver)
    setCreateName("")
    setCreateDriver("bridge")
  }

  const filtered = networks.filter((n) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return n.name?.toLowerCase().includes(q) || n.id?.toLowerCase().includes(q) || n.driver?.toLowerCase().includes(q)
  })

  // Build a map: network name -> container names
  const networkContainers = new Map<string, string[]>()
  for (const c of containers) {
    if (!c.networks) continue
    for (const netName of c.networks.split(",")) {
      const trimmed = netName.trim()
      if (!trimmed) continue
      const list = networkContainers.get(trimmed) || []
      list.push(c.name)
      networkContainers.set(trimmed, list)
    }
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索网络名、ID 或驱动..."
            className="w-full pl-8 pr-3 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="网络名称"
            className="w-32 px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
          />
          <select value={createDriver} onChange={(e) => setCreateDriver(e.target.value)}
            className="px-2 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all">
            <option value="bridge">bridge</option>
            <option value="overlay">overlay</option>
            <option value="macvlan">macvlan</option>
            <option value="ipvlan">ipvlan</option>
          </select>
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
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">驱动</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">范围</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">子网</th>
              <th className="px-3 py-2 text-left text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider">容器</th>
              <th className="px-3 py-2 text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider" style={{ width: 70 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((net) => {
              const isBuiltin = BUILTIN_NETWORKS.includes(net.name)
              const linked = networkContainers.get(net.name) || []
              return (
                <tr key={net.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-1.5 text-slate-700 font-medium truncate max-w-[10rem]">
                    {net.name}
                    {isBuiltin && <span className="ml-1.5 px-1 py-0.5 bg-slate-100 text-slate-400 rounded text-[0.5625rem]">内置</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 font-mono">{net.shortId}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[0.625rem] font-medium">{net.driver}</span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">{net.scope}</td>
                  <td className="px-3 py-1.5 text-slate-500 font-mono">{net.subnet || "-"}</td>
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
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onInspect(net.id, net.name)} className="p-0.5 text-slate-300 hover:text-blue-500 transition-colors rounded hover:bg-blue-50" title="详情">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {!isBuiltin && (
                        <button onClick={() => onRemove(net.id)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded hover:bg-red-50" title="删除">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400 text-[0.75rem]">
                  {searchQuery ? "没有匹配的网络" : "暂无网络"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
