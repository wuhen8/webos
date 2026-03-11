import { useState, useEffect, useCallback } from "react"
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  Plus, Trash2, RefreshCw,
} from "lucide-react"
import { request } from "@/stores/webSocketStore"
import { SettingsIcon } from "./SettingsIcon"
import IPGuardTab from "./IPGuardTab"

interface FWRule {
  id: number; table: string; chain: string; ruleSpec: string
  sortOrder: number; comment: string; source: string; createdAt: number
}

export default function FirewallTab() {
  const [fwEnabled, setFwEnabled] = useState(false)
  const [ipGuardEnabled, setIpGuardEnabled] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [fwTab, setFwTab] = useState<"filter" | "nat" | "guard">("filter")

  // Filter rules
  const [filterRules, setFilterRules] = useState<FWRule[]>([])
  const [filterActiveChain, setFilterActiveChain] = useState("INPUT")
  const [filterShowAdd, setFilterShowAdd] = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)
  const [filterNewRule, setFilterNewRule] = useState({
    chain: "INPUT", action: "ACCEPT", protocol: "tcp", source: "", port: "", position: "append", comment: "",
  })

  // NAT rules
  const [natRules, setNatRules] = useState<FWRule[]>([])
  const [natActiveChain, setNatActiveChain] = useState("PREROUTING")
  const [natShowAdd, setNatShowAdd] = useState(false)
  const [natNewRule, setNatNewRule] = useState({
    type: "dnat", protocol: "tcp", srcAddr: "", dstAddr: "", dstPort: "", toAddr: "", outIface: "",
  })

  const loadStatus = useCallback(async () => {
    try {
      const r = await request("firewall.status", {})
      setFwEnabled(r?.enabled ?? false)
      setIpGuardEnabled(r?.ipGuardEnabled ?? false)
    } catch {}
    setStatusLoading(false)
  }, [])

  const loadFilterRules = useCallback(async () => {
    setFilterLoading(true)
    try {
      const rules = await request("firewall.rules.list", { table: "filter" })
      setFilterRules(rules || [])
    } catch {}
    setFilterLoading(false)
  }, [])

  const loadNatRules = useCallback(async () => {
    try {
      const rules = await request("firewall.rules.list", { table: "nat" })
      setNatRules(rules || [])
    } catch {}
  }, [])

  const toggleFirewall = async () => {
    try {
      if (fwEnabled) {
        await request("firewall.disable", {})
        setFwEnabled(false)
        setIpGuardEnabled(false)
      } else {
        await request("firewall.enable", {})
        setFwEnabled(true)
      }
      loadFilterRules(); loadNatRules()
    } catch {}
  }

  const addFilterRule = async () => {
    const specParts: string[] = []
    if (filterNewRule.protocol && filterNewRule.protocol !== "all") specParts.push("-p", filterNewRule.protocol)
    if (filterNewRule.source) specParts.push("-s", filterNewRule.source)
    if (filterNewRule.port && filterNewRule.protocol !== "all" && filterNewRule.protocol !== "icmp") specParts.push("--dport", filterNewRule.port)
    specParts.push("-j", filterNewRule.action)
    try {
      await request("firewall.rules.add", {
        table: "filter",
        chain: filterNewRule.chain,
        ruleSpec: specParts.join(" "),
        comment: filterNewRule.comment.trim(),
        insertFirst: filterNewRule.position === "insert",
      })
      setFilterShowAdd(false)
      setFilterNewRule({ chain: "INPUT", action: "ACCEPT", protocol: "tcp", source: "", port: "", position: "append", comment: "" })
      loadFilterRules()
    } catch {}
  }

  const deleteRule = async (id: number) => {
    try { await request("firewall.rules.remove", { id }); loadFilterRules(); loadNatRules() } catch {}
  }

  const addNatRule = async () => {
    const type = natNewRule.type.toLowerCase()
    let chain = "PREROUTING"
    const specParts: string[] = []
    if (type === "dnat") {
      chain = "PREROUTING"
      if (natNewRule.protocol !== "all") specParts.push("-p", natNewRule.protocol)
      if (natNewRule.dstAddr) specParts.push("-d", natNewRule.dstAddr)
      if (natNewRule.dstPort && natNewRule.protocol !== "all") specParts.push("--dport", natNewRule.dstPort)
      if (natNewRule.srcAddr) specParts.push("-s", natNewRule.srcAddr)
      specParts.push("-j", "DNAT", "--to-destination", natNewRule.toAddr)
    } else if (type === "snat") {
      chain = "POSTROUTING"
      if (natNewRule.protocol !== "all") specParts.push("-p", natNewRule.protocol)
      if (natNewRule.srcAddr) specParts.push("-s", natNewRule.srcAddr)
      if (natNewRule.outIface) specParts.push("-o", natNewRule.outIface)
      specParts.push("-j", "SNAT", "--to-source", natNewRule.toAddr)
    } else if (type === "masquerade") {
      chain = "POSTROUTING"
      if (natNewRule.srcAddr) specParts.push("-s", natNewRule.srcAddr)
      if (natNewRule.outIface) specParts.push("-o", natNewRule.outIface)
      specParts.push("-j", "MASQUERADE")
    }
    try {
      await request("firewall.rules.add", { table: "nat", chain, ruleSpec: specParts.join(" "), comment: "" })
      setNatShowAdd(false)
      setNatNewRule({ type: "dnat", protocol: "tcp", srcAddr: "", dstAddr: "", dstPort: "", toAddr: "", outIface: "" })
      loadNatRules()
    } catch {}
  }

  useEffect(() => {
    loadStatus(); loadFilterRules(); loadNatRules()
  }, [loadStatus, loadFilterRules, loadNatRules])

  // Parse ruleSpec into human-readable parts for display
  const parseRuleSpec = (spec: string) => {
    const parts = spec.split(/\s+/)
    let protocol = "", source = "", port = "", action = "", extra = ""
    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case "-p": protocol = parts[++i] || ""; break
        case "-s": source = parts[++i] || ""; break
        case "-d": extra += `dst:${parts[++i] || ""} `; break
        case "--dport": port = parts[++i] || ""; break
        case "-j": action = parts[++i] || ""; break
        case "--to-destination": case "--to-source": extra += `→ ${parts[++i] || ""} `; break
        case "-o": extra += `out:${parts[++i] || ""} `; break
        case "-m": i++; break // skip module name
        case "--comment": i++; break // skip comment value (we have it separately)
        default: break
      }
    }
    return { protocol: protocol || "all", source: source || "0.0.0.0/0", port, action, extra: extra.trim() }
  }

  const chainFilterRules = filterRules.filter(r => r.chain === filterActiveChain)
  const chainNatRules = natRules.filter(r => r.chain === natActiveChain)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="firewall" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">防火墙</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">统一管理 iptables 防火墙规则，重启自动恢复</p>
      </div>

      {/* 防火墙总开关 */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {fwEnabled ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldX className="w-5 h-5 text-gray-400" />}
            <div>
              <span className="text-[0.8125rem] text-gray-900 font-medium">防火墙</span>
              <p className="text-[0.6875rem] text-gray-500 mt-0.5">{fwEnabled ? "已启用 — 规则持久化，重启自动恢复" : "未启用 — 开启后接管 iptables 规则管理"}</p>
            </div>
          </div>
          <button onClick={toggleFirewall} disabled={statusLoading} className={`relative w-10 h-6 rounded-full transition-colors ${fwEnabled ? "bg-green-500" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fwEnabled ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {!fwEnabled ? (
        <div className="bg-[#f5f5f7] rounded-xl p-6 text-center mt-4">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[0.875rem] font-medium text-gray-700 mb-1">防火墙未启用</p>
          <p className="text-[0.75rem] text-gray-500">开启后可管理过滤规则、NAT 转发和 IP 访问审批，所有规则持久化存储</p>
        </div>
      ) : (
        <>
          {/* Filter / NAT / IP审批 切换 */}
          <div className="flex bg-[#f5f5f7] rounded-xl overflow-hidden mt-4 p-1">
            <button onClick={() => setFwTab("filter")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "filter" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>过滤规则</button>
            <button onClick={() => setFwTab("nat")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "nat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>NAT 转发</button>
            <button onClick={() => setFwTab("guard")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "guard" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>IP 审批</button>
          </div>

          {fwTab === "filter" && (
            <>
              {/* 规则列表 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {["INPUT", "FORWARD", "OUTPUT"].map((chain) => (
                        <button key={chain} onClick={() => setFilterActiveChain(chain)} className={`px-3 py-1 text-[0.6875rem] font-medium transition-colors ${filterActiveChain === chain ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{chain}</button>
                      ))}
                    </div>
                    <button onClick={() => { loadFilterRules() }} className="p-1 hover:bg-black/[0.06] rounded-md transition-colors">
                      <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${filterLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <button onClick={() => { setFilterNewRule(r => ({ ...r, chain: filterActiveChain })); setFilterShowAdd(true) }} className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] text-blue-500 hover:bg-blue-50 rounded-md transition-colors font-medium">
                    <Plus className="w-3.5 h-3.5" />添加规则
                  </button>
                </div>

                {/* 添加规则表单 */}
                {filterShowAdd && (
                  <div className="mx-4 mb-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">动作</label>
                        <select value={filterNewRule.action} onChange={(e) => setFilterNewRule(r => ({ ...r, action: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="ACCEPT">ACCEPT（允许）</option><option value="DROP">DROP（丢弃）</option><option value="REJECT">REJECT（拒绝）</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">协议</label>
                        <select value={filterNewRule.protocol} onChange={(e) => setFilterNewRule(r => ({ ...r, protocol: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option><option value="all">ALL</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">源地址</label>
                        <input type="text" value={filterNewRule.source} onChange={(e) => setFilterNewRule(r => ({ ...r, source: e.target.value }))} placeholder="留空表示所有" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">端口</label>
                        <input type="text" value={filterNewRule.port} onChange={(e) => setFilterNewRule(r => ({ ...r, port: e.target.value }))} placeholder="如 80 或 8000:9000" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">备注</label>
                        <input type="text" value={filterNewRule.comment} onChange={(e) => setFilterNewRule(r => ({ ...r, comment: e.target.value }))} placeholder="可选，如：放行 HTTP" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2 pb-0.5">
                          <label className="text-[0.6875rem] text-gray-500">插入位置</label>
                          <select value={filterNewRule.position} onChange={(e) => setFilterNewRule(r => ({ ...r, position: e.target.value }))} className="h-7 px-2 text-[0.6875rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="append">追加到末尾</option><option value="insert">插入到开头</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addFilterRule} className="flex-1 py-1.5 text-[0.75rem] bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-medium">添加</button>
                      <button onClick={() => setFilterShowAdd(false)} className="px-4 py-1.5 text-[0.75rem] bg-white hover:bg-gray-100 text-gray-600 rounded-md border border-gray-200 transition-colors">取消</button>
                    </div>
                  </div>
                )}

                {/* 规则表格 */}
                <div className="px-4 pb-3">
                  {filterLoading ? (
                    <div className="py-8 text-center text-[0.8125rem] text-gray-400">加载中...</div>
                  ) : chainFilterRules.length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-[0.8125rem] text-gray-400">暂无规则</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[2rem_3.75rem_3rem_1fr_3.75rem_1fr_2rem] gap-1 px-2 py-1 text-[0.625rem] text-gray-400 font-medium uppercase tracking-wider">
                        <span>#</span><span>动作</span><span>协议</span><span>源地址</span><span>端口</span><span>备注</span><span></span>
                      </div>
                      {chainFilterRules.map((rule, idx) => {
                        const p = parseRuleSpec(rule.ruleSpec)
                        return (
                          <div key={rule.id} className="grid grid-cols-[2rem_3.75rem_3rem_1fr_3.75rem_1fr_2rem] gap-1 px-2 py-1.5 bg-white rounded-lg items-center text-[0.75rem]">
                            <span className="text-gray-400">{idx + 1}</span>
                            <span className={`font-medium ${p.action === 'ACCEPT' ? 'text-green-600' : p.action === 'DROP' ? 'text-red-600' : p.action === 'REJECT' ? 'text-orange-600' : 'text-gray-600'}`}>{p.action}</span>
                            <span className="text-gray-600">{p.protocol}</span>
                            <span className="text-gray-700 truncate" title={p.source}>{p.source}</span>
                            <span className="text-gray-600">{p.port || '-'}</span>
                            <span className="text-gray-400 truncate text-[0.6875rem]" title={rule.comment}>{rule.comment || '-'}</span>
                            <button onClick={() => deleteRule(rule.id)} className="p-0.5 hover:bg-red-50 rounded transition-colors" title="删除规则">
                              <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-[0.75rem] text-amber-700">规则持久化存储在数据库中，重启后自动恢复。添加/删除即时生效。</p>
              </div>
            </>
          )}

          {fwTab === "nat" && (
            <>
              {/* NAT 规则列表 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {["PREROUTING", "POSTROUTING"].map((chain) => (
                        <button key={chain} onClick={() => setNatActiveChain(chain)} className={`px-3 py-1 text-[0.6875rem] font-medium transition-colors ${natActiveChain === chain ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{chain}</button>
                      ))}
                    </div>
                    <button onClick={() => loadNatRules()} className="p-1 hover:bg-black/[0.06] rounded-md transition-colors">
                      <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  <button onClick={() => { setNatNewRule(r => ({ ...r, type: natActiveChain === "PREROUTING" ? "dnat" : "masquerade" })); setNatShowAdd(true) }} className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] text-blue-500 hover:bg-blue-50 rounded-md transition-colors font-medium">
                    <Plus className="w-3.5 h-3.5" />添加规则
                  </button>
                </div>

                {/* 添加 NAT 规则表单 */}
                {natShowAdd && (
                  <div className="mx-4 mb-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">类型</label>
                        <select value={natNewRule.type} onChange={(e) => setNatNewRule(r => ({ ...r, type: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="dnat">DNAT（端口转发）</option><option value="snat">SNAT（源地址转换）</option><option value="masquerade">MASQUERADE（动态伪装）</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">协议</label>
                        <select value={natNewRule.protocol} onChange={(e) => setNatNewRule(r => ({ ...r, protocol: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="tcp">TCP</option><option value="udp">UDP</option><option value="all">ALL</option>
                        </select>
                      </div>
                      {natNewRule.type === "dnat" && (
                        <>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">目标端口（本机）</label>
                            <input type="text" value={natNewRule.dstPort} onChange={(e) => setNatNewRule(r => ({ ...r, dstPort: e.target.value }))} placeholder="如 80 或 8080" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">转发到（IP:端口）</label>
                            <input type="text" value={natNewRule.toAddr} onChange={(e) => setNatNewRule(r => ({ ...r, toAddr: e.target.value }))} placeholder="如 192.168.1.100:80" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </>
                      )}
                      {natNewRule.type === "snat" && (
                        <>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">源网段</label>
                            <input type="text" value={natNewRule.srcAddr} onChange={(e) => setNatNewRule(r => ({ ...r, srcAddr: e.target.value }))} placeholder="如 192.168.1.0/24" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">转换为源 IP</label>
                            <input type="text" value={natNewRule.toAddr} onChange={(e) => setNatNewRule(r => ({ ...r, toAddr: e.target.value }))} placeholder="如 10.0.0.1" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </>
                      )}
                      {natNewRule.type === "masquerade" && (
                        <>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">源网段</label>
                            <input type="text" value={natNewRule.srcAddr} onChange={(e) => setNatNewRule(r => ({ ...r, srcAddr: e.target.value }))} placeholder="如 192.168.1.0/24" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">出接口</label>
                            <input type="text" value={natNewRule.outIface} onChange={(e) => setNatNewRule(r => ({ ...r, outIface: e.target.value }))} placeholder="如 eth0" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={addNatRule} className="flex-1 py-1.5 text-[0.75rem] bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-medium">添加</button>
                      <button onClick={() => setNatShowAdd(false)} className="px-4 py-1.5 text-[0.75rem] bg-white hover:bg-gray-100 text-gray-600 rounded-md border border-gray-200 transition-colors">取消</button>
                    </div>
                  </div>
                )}

                {/* NAT 规则表格 */}
                <div className="px-4 pb-3">
                  {chainNatRules.length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-[0.8125rem] text-gray-400">暂无 NAT 规则</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[2rem_4.5rem_3rem_1fr_1fr_2rem] gap-1 px-2 py-1 text-[0.625rem] text-gray-400 font-medium uppercase tracking-wider">
                        <span>#</span><span>动作</span><span>协议</span><span>规则</span><span>备注</span><span></span>
                      </div>
                      {chainNatRules.map((rule, idx) => {
                        const p = parseRuleSpec(rule.ruleSpec)
                        return (
                          <div key={rule.id} className="grid grid-cols-[2rem_4.5rem_3rem_1fr_1fr_2rem] gap-1 px-2 py-1.5 bg-white rounded-lg items-center text-[0.75rem]">
                            <span className="text-gray-400">{idx + 1}</span>
                            <span className={`font-medium ${p.action === 'DNAT' ? 'text-blue-600' : p.action === 'SNAT' ? 'text-purple-600' : p.action === 'MASQUERADE' ? 'text-green-600' : 'text-gray-600'}`}>{p.action}</span>
                            <span className="text-gray-600">{p.protocol}</span>
                            <span className="text-gray-700 truncate text-[0.6875rem]" title={rule.ruleSpec}>{p.source !== "0.0.0.0/0" ? `src:${p.source} ` : ''}{p.port ? `port:${p.port} ` : ''}{p.extra}</span>
                            <span className="text-gray-400 truncate text-[0.6875rem]">{rule.comment || '-'}</span>
                            <button onClick={() => deleteRule(rule.id)} className="p-0.5 hover:bg-red-50 rounded transition-colors" title="删除规则">
                              <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* NAT 使用说明 */}
              <div className="mt-4 bg-[#f5f5f7] rounded-xl p-4">
                <h3 className="text-[0.75rem] font-medium text-gray-700 mb-2">常见用法</h3>
                <div className="space-y-2 text-[0.6875rem] text-gray-500">
                  <div className="flex gap-2"><span className="text-blue-500 font-medium shrink-0">DNAT</span><span>端口转发：将本机端口流量转发到同网段其他 IP，如将 :8080 转发到 192.168.1.100:80</span></div>
                  <div className="flex gap-2"><span className="text-purple-500 font-medium shrink-0">SNAT</span><span>源地址转换：将内网流量的源 IP 替换为指定 IP 出去</span></div>
                  <div className="flex gap-2"><span className="text-green-500 font-medium shrink-0">MASQ</span><span>动态伪装：类似 SNAT 但自动使用出接口 IP，适合动态 IP 场景</span></div>
                </div>
              </div>

              <div className="mt-4 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-[0.75rem] text-amber-700">NAT 规则持久化存储，重启自动恢复。同网段转发还需确保 FORWARD 链允许相关流量通过。</p>
              </div>
            </>
          )}

          {fwTab === "guard" && <IPGuardTab />}
        </>
      )}
    </div>
  )
}
