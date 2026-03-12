import { useState, useEffect, useCallback } from "react"
import {
  ShieldCheck, ShieldAlert, ShieldX,
  Check, X, Trash2, RefreshCw, Clock, MapPin, Settings2,
  Plus, Network,
} from "lucide-react"
import { request } from "@/stores/webSocketStore"

interface IPRecord {
  id: number; ip: string; status: string; location: string
  note: string; expiresAt: number; createdAt: number; updatedAt: number
}
interface CIDRRecord {
  id: number; cidr: string; note: string; autoAdded: boolean; createdAt: number
}

export default function IPGuardTab() {
  const [records, setRecords] = useState<IPRecord[]>([])
  const [cidrs, setCidrs] = useState<CIDRRecord[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [defaultTTL, setDefaultTTL] = useState(604800)
  const [customTTLHours, setCustomTTLHours] = useState("24")
  const [showAddCIDR, setShowAddCIDR] = useState(false)
  const [showCustomTTL, setShowCustomTTL] = useState(false)
  const [newCIDR, setNewCIDR] = useState("")
  const [newCIDRNote, setNewCIDRNote] = useState("")

  const loadRecords = useCallback(async () => {
    try { setRecords(await request("ip_guard.list", {}) || []) } catch {}
  }, [])
  const loadCIDRs = useCallback(async () => {
    try { setCidrs(await request("ip_guard.cidr_list", {}) || []) } catch {}
  }, [])

  const approveIP = async (id: number) => {
    try { await request("ip_guard.approve", { id, ttl: defaultTTL > 0 ? defaultTTL : 0 }); loadRecords() } catch (e: any) { alert(e?.message || "放行失败") }
  }
  const rejectIP = async (id: number) => {
    try { await request("ip_guard.reject", { id }); loadRecords() } catch (e: any) { alert(e?.message || "拒绝失败") }
  }
  const removeIP = async (id: number) => {
    try { await request("ip_guard.remove", { id }); loadRecords() } catch (e: any) { alert(e?.message || "删除失败") }
  }
  const addCIDR = async () => {
    if (!newCIDR.trim()) return
    try {
      await request("ip_guard.cidr_add", { cidr: newCIDR.trim(), note: newCIDRNote.trim() })
      setNewCIDR(""); setNewCIDRNote(""); setShowAddCIDR(false); loadCIDRs()
    } catch {}
  }
  const removeCIDR = async (id: number) => {
    try { await request("ip_guard.cidr_remove", { id }); loadCIDRs() } catch {}
  }
  const updateDefaultTTL = (v: number) => {
    setDefaultTTL(v)
    request("ip_guard.config_set", { default_ttl: String(v) }).catch(() => {})
  }

  useEffect(() => {
    loadRecords(); loadCIDRs()
    // Load persisted default TTL
    request("ip_guard.config_get", {}).then((cfg: any) => {
      if (cfg?.default_ttl) {
        const v = parseInt(cfg.default_ttl)
        if (!isNaN(v)) {
          setDefaultTTL(v)
          if (v > 0 && ![0, 3600, 21600, 86400, 604800, 2592000].includes(v)) {
            setShowCustomTTL(true)
            setCustomTTLHours(String(Math.round(v / 3600)))
          }
        }
      }
    }).catch(() => {})
    const t = setInterval(() => { loadRecords(); loadCIDRs() }, 5000)
    return () => clearInterval(t)
  }, [loadRecords, loadCIDRs])

  const pending = records.filter(r => r.status === "pending")
  const approved = records.filter(r => r.status === "approved")
  const rejected = records.filter(r => r.status === "rejected")

  const formatTime = (ts: number) => !ts ? "-" : new Date(ts * 1000).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  const formatExpiry = (ts: number) => {
    if (!ts) return "永久"
    const s = ts - Date.now() / 1000
    if (s <= 0) return "已过期"
    const h = Math.floor(s / 3600)
    if (h < 1) return `${Math.floor(s / 60)}分钟后`
    return h < 24 ? `${h}小时后` : `${Math.floor(h / 24)}天后`
  }

  const ttlPresets = [
    { label: "永久", value: 0 }, { label: "1小时", value: 3600 }, { label: "6小时", value: 21600 },
    { label: "24小时", value: 86400 }, { label: "7天", value: 604800 }, { label: "30天", value: 2592000 },
    { label: "自定义", value: -1 },
  ]
  const presetValues = [0, 3600, 21600, 86400, 604800, 2592000]

  return (
    <div className="space-y-4">
      {/* 标题 + 设置按钮 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <div>
              <span className="text-[0.8125rem] text-gray-900 font-medium">IP 访问审批</span>
              <p className="text-[0.6875rem] text-gray-500 mt-0.5">新IP访问面板端口需审批后放行，内网网段自动白名单</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 hover:bg-black/[0.06] rounded-md transition-colors" title="设置">
            <Settings2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* TTL 设置 */}
      {showSettings && (
        <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5"><span className="text-[0.75rem] font-medium text-gray-500 uppercase tracking-wide">审批设置</span></div>
          <div className="px-4 pb-3">
            <div className="bg-white rounded-lg p-3">
              <label className="text-[0.75rem] text-gray-700 font-medium mb-2 block"><Clock className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />默认审批有效期</label>
              <div className="flex flex-wrap gap-1.5">
                {ttlPresets.map(opt => (
                  <button key={opt.value} onClick={() => {
                    if (opt.value === -1) {
                      setShowCustomTTL(true)
                    } else {
                      setShowCustomTTL(false)
                      updateDefaultTTL(opt.value)
                    }
                  }}
                    className={`px-2.5 py-1 text-[0.6875rem] rounded-md font-medium transition-colors ${(opt.value === -1 ? showCustomTTL || (!presetValues.includes(defaultTTL) && defaultTTL > 0) : !showCustomTTL && defaultTTL === opt.value) ? "bg-blue-500 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-gray-200"}`}>{opt.label}</button>
                ))}
              </div>
              {showCustomTTL && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" value={customTTLHours} onChange={(e) => { setCustomTTLHours(e.target.value); const h = parseInt(e.target.value); if (h > 0) updateDefaultTTL(h * 3600) }}
                    className="w-20 h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" min="1" />
                  <span className="text-[0.6875rem] text-gray-500">小时</span>
                </div>
              )}
              <p className="text-[0.6875rem] text-gray-400 mt-2">审批通过的IP在有效期后自动失效。设为"永久"则不过期。</p>
            </div>
          </div>
        </div>
      )}

      {/* 白名单网段 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-500" />
            <span className="text-[0.75rem] font-medium text-gray-700">白名单网段 ({cidrs.length})</span>
          </div>
          <button onClick={() => setShowAddCIDR(!showAddCIDR)} className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] text-blue-500 hover:bg-blue-50 rounded-md transition-colors font-medium">
            <Plus className="w-3.5 h-3.5" />添加
          </button>
        </div>
        {showAddCIDR && (
          <div className="mx-4 mb-3 p-3 bg-white rounded-lg border border-blue-200">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">CIDR 网段</label>
                <input type="text" value={newCIDR} onChange={(e) => setNewCIDR(e.target.value)} placeholder="如 192.168.1.0/24"
                  className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">备注</label>
                <input type="text" value={newCIDRNote} onChange={(e) => setNewCIDRNote(e.target.value)} placeholder="可选，如：办公室网络"
                  className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addCIDR} className="flex-1 py-1.5 text-[0.75rem] bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-medium">添加</button>
              <button onClick={() => setShowAddCIDR(false)} className="px-4 py-1.5 text-[0.75rem] bg-white hover:bg-gray-100 text-gray-600 rounded-md border border-gray-200 transition-colors">取消</button>
            </div>
          </div>
        )}
        {cidrs.length === 0 ? (
          <div className="px-4 pb-4 text-center"><p className="text-[0.75rem] text-gray-400">暂无白名单网段</p></div>
        ) : (
          <div className="px-4 pb-3 space-y-1">
            {cidrs.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[0.75rem] font-mono text-gray-900">{c.cidr}</span>
                  {c.note && <span className="text-[0.6875rem] text-gray-500">{c.note}</span>}
                  {c.autoAdded && <span className="text-[0.6rem] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">自动</span>}
                </div>
                <button onClick={() => removeCIDR(c.id)} className="p-1 hover:bg-red-50 rounded transition-colors" title="移除">
                  <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 待审批 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /><span className="text-[0.75rem] font-medium text-gray-700">待审批 ({pending.length})</span></div>
          <button onClick={loadRecords} className="p-1 hover:bg-black/[0.06] rounded-md transition-colors"><RefreshCw className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>
        {pending.length === 0 ? (
          <div className="px-4 pb-4 text-center"><p className="text-[0.75rem] text-gray-400">暂无待审批的IP</p></div>
        ) : (
          <div className="px-4 pb-3 space-y-1.5">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-amber-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8125rem] font-mono text-gray-900">{r.ip}</span>
                    {r.location && <span className="flex items-center gap-0.5 text-[0.6875rem] text-gray-500"><MapPin className="w-3 h-3" />{r.location}</span>}
                  </div>
                  <span className="text-[0.6875rem] text-gray-400">{formatTime(r.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-3">
                  <button onClick={() => approveIP(r.id)} className="flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"><Check className="w-3 h-3" />放行</button>
                  <button onClick={() => rejectIP(r.id)} className="flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"><X className="w-3 h-3" />拒绝</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已放行 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500" /><span className="text-[0.75rem] font-medium text-gray-700">已放行 ({approved.length})</span></div></div>
        {approved.length === 0 ? (
          <div className="px-4 pb-4 text-center"><p className="text-[0.75rem] text-gray-400">暂无已放行的IP</p></div>
        ) : (
          <div className="px-4 pb-3 space-y-1">
            {approved.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[0.75rem] font-mono text-gray-900">{r.ip}</span>
                  {r.location && <span className="flex items-center gap-0.5 text-[0.6875rem] text-gray-500"><MapPin className="w-3 h-3" />{r.location}</span>}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-[0.6875rem] text-gray-400"><Clock className="w-3 h-3 inline mr-0.5" />{formatExpiry(r.expiresAt)}</span>
                  <button onClick={() => removeIP(r.id)} className="p-1 hover:bg-red-50 rounded transition-colors" title="移除"><Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已拒绝 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5"><div className="flex items-center gap-2"><ShieldX className="w-4 h-4 text-red-400" /><span className="text-[0.75rem] font-medium text-gray-700">已拒绝 ({rejected.length})</span></div></div>
        {rejected.length === 0 ? (
          <div className="px-4 pb-4 text-center"><p className="text-[0.75rem] text-gray-400">暂无已拒绝的IP</p></div>
        ) : (
          <div className="px-4 pb-3 space-y-1">
            {rejected.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[0.75rem] font-mono text-gray-500">{r.ip}</span>
                  {r.location && <span className="flex items-center gap-0.5 text-[0.6875rem] text-gray-400"><MapPin className="w-3 h-3" />{r.location}</span>}
                </div>
                <div className="flex items-center gap-1.5 ml-3">
                  <button onClick={() => approveIP(r.id)} className="px-2 py-0.5 text-[0.6875rem] text-green-600 hover:bg-green-50 rounded transition-colors">放行</button>
                  <button onClick={() => removeIP(r.id)} className="p-1 hover:bg-red-50 rounded transition-colors" title="删除记录"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-[0.75rem] text-blue-700">白名单网段内的IP无需审批即可访问。首次启用时会自动添加本机内网网段。</p>
      </div>
    </div>
  )
}
