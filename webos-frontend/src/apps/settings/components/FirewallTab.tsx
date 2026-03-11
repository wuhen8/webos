import { useState, useEffect, useCallback } from "react"
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  Plus, Trash2, RefreshCw,
} from "lucide-react"
import { exec } from "@/lib/services"
import { SettingsIcon } from "./SettingsIcon"
import IPGuardTab from "./IPGuardTab"

export default function FirewallTab() {
  const [fwAvailable, setFwAvailable] = useState<boolean | null>(null)
  const [fwPolicies, setFwPolicies] = useState<Record<string, string>>({})
  const [fwRules, setFwRules] = useState<Record<string, any[]>>({})
  const [fwRuleCount, setFwRuleCount] = useState(0)
  const [fwLoading, setFwLoading] = useState(false)
  const [fwActiveChain, setFwActiveChain] = useState("INPUT")
  const [fwShowAdd, setFwShowAdd] = useState(false)
  const [fwNewRule, setFwNewRule] = useState({
    chain: "INPUT", action: "ACCEPT", protocol: "tcp", source: "", port: "", position: "append", comment: "",
  })
  const [fwTab, setFwTab] = useState<"filter" | "nat" | "guard">("filter")
  const [natRules, setNatRules] = useState<Record<string, any[]>>({})
  const [natPolicies, setNatPolicies] = useState<Record<string, string>>({})
  const [natActiveChain, setNatActiveChain] = useState("PREROUTING")
  const [natShowAdd, setNatShowAdd] = useState(false)
  const [ipForwardEnabled, setIpForwardEnabled] = useState(false)
  const [natNewRule, setNatNewRule] = useState({
    type: "dnat", protocol: "tcp", srcAddr: "", dstAddr: "", dstPort: "", toAddr: "", outIface: "",
  })

  const parseIptablesRules = (chain: string, stdout: string) => {
    const rules: any[] = []
    const lines = stdout.split("\n")
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const fields = line.split(/\s+/)
      if (fields.length < 10) continue
      const num = parseInt(fields[0])
      if (!num) continue
      const inIface = fields[5], outIface = fields[6]
      const rule: any = { chain, num, target: fields[3], protocol: fields[4], source: fields[8], destination: fields[9], port: "", extra: "" }
      const extra = fields.slice(10).join(" ")
      const dptMatch = extra.match(/dpts?:(\S+)/)
      if (dptMatch) rule.port = dptMatch[1]
      rule.extra = extra

      // 生成人类可读描述
      const descParts: string[] = []
      const commentMatch = extra.match(/\/\*\s*(.+?)\s*\*\//)
      if (commentMatch) {
        descParts.push(commentMatch[1])
      } else {
        if (inIface !== '*') descParts.push(`接口: ${inIface}`)
        if (outIface !== '*') descParts.push(`出接口: ${outIface}`)
        if (extra.includes('ctstate RELATED,ESTABLISHED')) descParts.push('已建立的连接')
        else if (extra.includes('ctstate')) { const m = extra.match(/ctstate\s+(\S+)/); if (m) descParts.push(`状态: ${m[1]}`) }
      }
      rule.desc = descParts.join(' | ') || ''
      rules.push(rule)
    }
    return rules
  }

  const parsePolicyFromOutput = (stdout: string): string => {
    const match = stdout.match(/policy (\w+)/)
    return match ? match[1] : "UNKNOWN"
  }

  const loadFirewallStatus = useCallback(async () => {
    try {
      const { exitCode } = await exec("iptables --version")
      if (exitCode !== 0) { setFwAvailable(false); return }
      setFwAvailable(true)
      const policies: Record<string, string> = {}
      let ruleCount = 0
      for (const chain of ["INPUT", "FORWARD", "OUTPUT"]) {
        const res = await exec(`iptables -L ${chain} -n --line-numbers -v`)
        policies[chain] = parsePolicyFromOutput(res.stdout)
        const lines = res.stdout.split("\n")
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line && /^\d/.test(line)) ruleCount++
        }
      }
      setFwPolicies(policies)
      setFwRuleCount(ruleCount)
    } catch { setFwAvailable(false) }
  }, [])

  const loadFirewallRules = useCallback(async () => {
    setFwLoading(true)
    try {
      const rulesMap: Record<string, any[]> = {}
      for (const chain of ["INPUT", "FORWARD", "OUTPUT"]) {
        const res = await exec(`iptables -L ${chain} -n --line-numbers -v`)
        rulesMap[chain] = parseIptablesRules(chain, res.stdout)
      }
      setFwRules(rulesMap)
    } catch {}
    setFwLoading(false)
  }, [])

  const loadNatRules = useCallback(async () => {
    try {
      const rulesMap: Record<string, any[]> = {}
      const policiesMap: Record<string, string> = {}
      for (const chain of ["PREROUTING", "POSTROUTING", "OUTPUT"]) {
        const res = await exec(`iptables -t nat -L ${chain} -n --line-numbers -v`)
        rulesMap[chain] = parseIptablesRules(chain, res.stdout)
        policiesMap[chain] = parsePolicyFromOutput(res.stdout)
      }
      setNatRules(rulesMap)
      setNatPolicies(policiesMap)
    } catch {}
  }, [])

  const loadForwardStatus = useCallback(async () => {
    try {
      const res = await exec("cat /proc/sys/net/ipv4/ip_forward")
      setIpForwardEnabled(res.stdout.trim() === "1")
    } catch {}
  }, [])

  const addFirewallRule = async () => {
    const args: string[] = []
    if (fwNewRule.position === "insert") args.push("-I", fwNewRule.chain)
    else args.push("-A", fwNewRule.chain)
    if (fwNewRule.protocol && fwNewRule.protocol !== "all") args.push("-p", fwNewRule.protocol)
    if (fwNewRule.source) args.push("-s", fwNewRule.source)
    if (fwNewRule.port && fwNewRule.protocol !== "all" && fwNewRule.protocol !== "icmp") args.push("--dport", fwNewRule.port)
    args.push("-j", fwNewRule.action)
    if (fwNewRule.comment.trim()) args.push("-m", "comment", "--comment", `"${fwNewRule.comment.trim()}"`)
    try {
      await exec(`iptables ${args.join(" ")}`)
      setFwShowAdd(false)
      setFwNewRule({ chain: "INPUT", action: "ACCEPT", protocol: "tcp", source: "", port: "", position: "append", comment: "" })
      loadFirewallRules(); loadFirewallStatus()
    } catch {}
  }

  const deleteFirewallRule = async (chain: string, num: number) => {
    try { await exec(`iptables -D ${chain} ${num}`); loadFirewallRules(); loadFirewallStatus() } catch {}
  }

  const setFirewallPolicy = async (chain: string, policy: string) => {
    try { await exec(`iptables -P ${chain} ${policy}`); loadFirewallStatus() } catch {}
  }

  const addNatRule = async () => {
    const args: string[] = ["-t", "nat"]
    const type = natNewRule.type.toLowerCase()
    if (type === "dnat") {
      args.push("-A", "PREROUTING")
      if (natNewRule.protocol !== "all") args.push("-p", natNewRule.protocol)
      if (natNewRule.dstAddr) args.push("-d", natNewRule.dstAddr)
      if (natNewRule.dstPort && natNewRule.protocol !== "all") args.push("--dport", natNewRule.dstPort)
      if (natNewRule.srcAddr) args.push("-s", natNewRule.srcAddr)
      args.push("-j", "DNAT", "--to-destination", natNewRule.toAddr)
    } else if (type === "snat") {
      args.push("-A", "POSTROUTING")
      if (natNewRule.protocol !== "all") args.push("-p", natNewRule.protocol)
      if (natNewRule.srcAddr) args.push("-s", natNewRule.srcAddr)
      if (natNewRule.outIface) args.push("-o", natNewRule.outIface)
      args.push("-j", "SNAT", "--to-source", natNewRule.toAddr)
    } else if (type === "masquerade") {
      args.push("-A", "POSTROUTING")
      if (natNewRule.srcAddr) args.push("-s", natNewRule.srcAddr)
      if (natNewRule.outIface) args.push("-o", natNewRule.outIface)
      args.push("-j", "MASQUERADE")
    }
    try {
      await exec(`iptables ${args.join(" ")}`)
      setNatShowAdd(false)
      setNatNewRule({ type: "dnat", protocol: "tcp", srcAddr: "", dstAddr: "", dstPort: "", toAddr: "", outIface: "" })
      loadNatRules()
    } catch {}
  }

  const deleteNatRule = async (chain: string, num: number) => {
    try { await exec(`iptables -t nat -D ${chain} ${num}`); loadNatRules() } catch {}
  }

  const toggleIpForward = async () => {
    const val = ipForwardEnabled ? "0" : "1"
    try { await exec(`sysctl -w net.ipv4.ip_forward=${val}`); setIpForwardEnabled(!ipForwardEnabled) } catch {}
  }

  useEffect(() => {
    loadFirewallStatus(); loadFirewallRules(); loadNatRules(); loadForwardStatus()
  }, [loadFirewallStatus, loadFirewallRules, loadNatRules, loadForwardStatus])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="firewall" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">防火墙</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">管理 iptables 防火墙规则</p>
      </div>

      {fwAvailable === false ? (
        <div className="bg-[#f5f5f7] rounded-xl p-6 text-center">
          <ShieldX className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[0.875rem] font-medium text-gray-700 mb-1">iptables 不可用</p>
          <p className="text-[0.75rem] text-gray-500">请确认系统已安装 iptables 且服务以 root 权限运行</p>
        </div>
      ) : (
        <>
          {/* 状态概览 */}
          <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                <span className="text-[0.8125rem] text-gray-900 font-medium">防火墙状态</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.75rem] text-gray-500">{fwRuleCount} 条规则</span>
                <button onClick={() => { loadFirewallStatus(); loadFirewallRules(); loadNatRules(); loadForwardStatus() }} className="p-1 hover:bg-black/[0.06] rounded-md transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${fwLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Filter / NAT / IP审批 切换 */}
          <div className="flex bg-[#f5f5f7] rounded-xl overflow-hidden mt-4 p-1">
            <button onClick={() => setFwTab("filter")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "filter" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>过滤规则</button>
            <button onClick={() => setFwTab("nat")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "nat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>NAT 转发</button>
            <button onClick={() => setFwTab("guard")} className={`flex-1 py-2 text-[0.8125rem] font-medium rounded-lg transition-all ${fwTab === "guard" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>IP 审批</button>
          </div>

          {fwTab === "filter" && (
            <>
              {/* 默认策略 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-2.5">
                  <span className="text-[0.75rem] font-medium text-gray-500 uppercase tracking-wide">默认策略</span>
                </div>
                {["INPUT", "FORWARD", "OUTPUT"].map((chain, idx) => (
                  <div key={chain}>
                    {idx > 0 && <div className="h-px bg-gray-200 ml-4" />}
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-[0.8125rem] text-gray-900">{chain}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setFirewallPolicy(chain, "ACCEPT")} className={`px-2.5 py-1 text-[0.6875rem] rounded-md font-medium transition-colors ${fwPolicies[chain] === "ACCEPT" ? "bg-green-500 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>ACCEPT</button>
                        <button onClick={() => setFirewallPolicy(chain, "DROP")} className={`px-2.5 py-1 text-[0.6875rem] rounded-md font-medium transition-colors ${fwPolicies[chain] === "DROP" ? "bg-red-500 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>DROP</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 规则列表 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {["INPUT", "FORWARD", "OUTPUT"].map((chain) => (
                        <button key={chain} onClick={() => setFwActiveChain(chain)} className={`px-3 py-1 text-[0.6875rem] font-medium transition-colors ${fwActiveChain === chain ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{chain}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => { setFwNewRule(r => ({ ...r, chain: fwActiveChain })); setFwShowAdd(true) }} className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] text-blue-500 hover:bg-blue-50 rounded-md transition-colors font-medium">
                    <Plus className="w-3.5 h-3.5" />添加规则
                  </button>
                </div>

                {/* 添加规则表单 */}
                {fwShowAdd && (
                  <div className="mx-4 mb-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">动作</label>
                        <select value={fwNewRule.action} onChange={(e) => setFwNewRule(r => ({ ...r, action: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="ACCEPT">ACCEPT（允许）</option><option value="DROP">DROP（丢弃）</option><option value="REJECT">REJECT（拒绝）</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">协议</label>
                        <select value={fwNewRule.protocol} onChange={(e) => setFwNewRule(r => ({ ...r, protocol: e.target.value }))} className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option><option value="all">ALL</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">源地址</label>
                        <input type="text" value={fwNewRule.source} onChange={(e) => setFwNewRule(r => ({ ...r, source: e.target.value }))} placeholder="留空表示所有" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">端口</label>
                        <input type="text" value={fwNewRule.port} onChange={(e) => setFwNewRule(r => ({ ...r, port: e.target.value }))} placeholder="如 80 或 8000:9000" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.6875rem] text-gray-500 mb-0.5 block">备注</label>
                        <input type="text" value={fwNewRule.comment} onChange={(e) => setFwNewRule(r => ({ ...r, comment: e.target.value }))} placeholder="可选，如：放行 HTTP" className="w-full h-7 px-2 text-[0.75rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2 pb-0.5">
                          <label className="text-[0.6875rem] text-gray-500">插入位置</label>
                          <select value={fwNewRule.position} onChange={(e) => setFwNewRule(r => ({ ...r, position: e.target.value }))} className="h-7 px-2 text-[0.6875rem] bg-[#f5f5f7] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="append">追加到末尾</option><option value="insert">插入到开头</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addFirewallRule} className="flex-1 py-1.5 text-[0.75rem] bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-medium">添加</button>
                      <button onClick={() => setFwShowAdd(false)} className="px-4 py-1.5 text-[0.75rem] bg-white hover:bg-gray-100 text-gray-600 rounded-md border border-gray-200 transition-colors">取消</button>
                    </div>
                  </div>
                )}

                {/* 规则表格 */}
                <div className="px-4 pb-3">
                  {fwLoading ? (
                    <div className="py-8 text-center text-[0.8125rem] text-gray-400">加载中...</div>
                  ) : (fwRules[fwActiveChain] || []).length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-[0.8125rem] text-gray-400">暂无规则</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[2rem_3.75rem_3rem_1fr_1fr_3.75rem_1fr_2rem] gap-1 px-2 py-1 text-[0.625rem] text-gray-400 font-medium uppercase tracking-wider">
                        <span>#</span><span>动作</span><span>协议</span><span>源地址</span><span>目标地址</span><span>端口</span><span>备注</span><span></span>
                      </div>
                      {(fwRules[fwActiveChain] || []).map((rule: any) => (
                        <div key={`${rule.chain}-${rule.num}`} className="grid grid-cols-[2rem_3.75rem_3rem_1fr_1fr_3.75rem_1fr_2rem] gap-1 px-2 py-1.5 bg-white rounded-lg items-center text-[0.75rem]">
                          <span className="text-gray-400">{rule.num}</span>
                          <span className={`font-medium ${rule.target === 'ACCEPT' ? 'text-green-600' : rule.target === 'DROP' ? 'text-red-600' : rule.target === 'REJECT' ? 'text-orange-600' : 'text-gray-600'}`}>{rule.target}</span>
                          <span className="text-gray-600">{rule.protocol}</span>
                          <span className="text-gray-700 truncate" title={rule.source}>{rule.source}</span>
                          <span className="text-gray-700 truncate" title={rule.destination}>{rule.destination}</span>
                          <span className="text-gray-600">{rule.port || '-'}</span>
                          <span className="text-gray-400 truncate text-[0.6875rem]" title={rule.desc || rule.extra}>{rule.desc || '-'}</span>
                          <button onClick={() => deleteFirewallRule(rule.chain, rule.num)} className="p-0.5 hover:bg-red-50 rounded transition-colors" title="删除规则">
                            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-[0.75rem] text-amber-700">防火墙规则修改即时生效，请谨慎操作。修改 DROP 策略可能导致远程连接断开。</p>
              </div>
            </>
          )}

          {fwTab === "nat" && (
            <>
              {/* === NAT 转发 === */}
              {/* IP 转发开关 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-[0.8125rem] text-gray-900 font-medium">IP 转发</span>
                    <p className="text-[0.6875rem] text-gray-500 mt-0.5">NAT 转发需要开启内核 IP 转发 (ip_forward)</p>
                  </div>
                  <button onClick={toggleIpForward} className={`relative w-10 h-6 rounded-full transition-colors ${ipForwardEnabled ? "bg-green-500" : "bg-gray-300"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ipForwardEnabled ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>

              {/* NAT 规则列表 */}
              <div className="bg-[#f5f5f7] rounded-xl overflow-hidden mt-4">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {["PREROUTING", "POSTROUTING"].map((chain) => (
                      <button key={chain} onClick={() => setNatActiveChain(chain)} className={`px-3 py-1 text-[0.6875rem] font-medium transition-colors ${natActiveChain === chain ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{chain}</button>
                    ))}
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
                  {(natRules[natActiveChain] || []).length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-[0.8125rem] text-gray-400">暂无 NAT 规则</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[2rem_4.5rem_3rem_1fr_1fr_2rem] gap-1 px-2 py-1 text-[0.625rem] text-gray-400 font-medium uppercase tracking-wider">
                        <span>#</span><span>动作</span><span>协议</span><span>源/目标</span><span>转发详情</span><span></span>
                      </div>
                      {(natRules[natActiveChain] || []).map((rule: any) => (
                        <div key={`${rule.chain}-${rule.num}`} className="grid grid-cols-[2rem_4.5rem_3rem_1fr_1fr_2rem] gap-1 px-2 py-1.5 bg-white rounded-lg items-center text-[0.75rem]">
                          <span className="text-gray-400">{rule.num}</span>
                          <span className={`font-medium ${rule.target === 'DNAT' ? 'text-blue-600' : rule.target === 'SNAT' ? 'text-purple-600' : rule.target === 'MASQUERADE' ? 'text-green-600' : 'text-gray-600'}`}>{rule.target}</span>
                          <span className="text-gray-600">{rule.protocol}</span>
                          <span className="text-gray-700 truncate text-[0.6875rem]" title={`${rule.source} → ${rule.destination}`}>{rule.source} → {rule.destination}</span>
                          <span className="text-gray-600 truncate text-[0.6875rem]" title={rule.extra}>{rule.port ? `port:${rule.port} ` : ''}{rule.extra}</span>
                          <button onClick={() => deleteNatRule(rule.chain, rule.num)} className="p-0.5 hover:bg-red-50 rounded transition-colors" title="删除规则">
                            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                          </button>
                        </div>
                      ))}
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
                <p className="text-[0.75rem] text-amber-700">NAT 转发需要开启 IP 转发。同网段转发还需确保 FORWARD 链允许相关流量通过。</p>
              </div>
            </>
          )}

          {fwTab === "guard" && <IPGuardTab />}
        </>
      )}
    </div>
  )
}
