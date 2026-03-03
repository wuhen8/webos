import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import type { ServiceConfig, PortMapping, VolumeMount, EnvVar } from "./composeUtils"

const inputClass =
  "w-full px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
const smallInputClass =
  "px-2 py-1 text-[0.6875rem] bg-white/70 border border-slate-200 rounded-md outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
const labelClass = "text-[0.6875rem] font-medium text-slate-600 mb-1 block"

interface ServiceFormProps {
  svc: ServiceConfig
  sIdx: number
  serviceCount: number
  serviceNames: string[]
  updateService: (idx: number, patch: Partial<ServiceConfig>) => void
  removeService: (idx: number) => void
}

export function ServiceForm({ svc, sIdx, serviceCount, serviceNames, updateService, removeService }: ServiceFormProps) {
  const addPort = () => updateService(sIdx, { ports: [...svc.ports, { host: "", container: "", protocol: "tcp" }] })
  const updatePort = (pIdx: number, patch: Partial<PortMapping>) => updateService(sIdx, { ports: svc.ports.map((p, i) => (i === pIdx ? { ...p, ...patch } : p)) })
  const removePort = (pIdx: number) => updateService(sIdx, { ports: svc.ports.filter((_, i) => i !== pIdx) })

  const addVolume = () => updateService(sIdx, { volumes: [...svc.volumes, { type: "bind", host: "", container: "", mode: "rw" }] })
  const updateVolume = (vIdx: number, patch: Partial<VolumeMount>) => updateService(sIdx, { volumes: svc.volumes.map((v, i) => (i === vIdx ? { ...v, ...patch } : v)) })
  const removeVolume = (vIdx: number) => updateService(sIdx, { volumes: svc.volumes.filter((_, i) => i !== vIdx) })

  const addEnv = () => updateService(sIdx, { environment: [...svc.environment, { key: "", value: "" }] })
  const updateEnv = (eIdx: number, patch: Partial<EnvVar>) => updateService(sIdx, { environment: svc.environment.map((e, i) => (i === eIdx ? { ...e, ...patch } : e)) })
  const removeEnv = (eIdx: number) => updateService(sIdx, { environment: svc.environment.filter((_, i) => i !== eIdx) })

  return (
    <div className="bg-white/80 rounded-lg border border-slate-150 overflow-hidden">
      {/* Service Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-50/80 cursor-pointer hover:bg-slate-100/60 transition-colors"
        onClick={() => updateService(sIdx, { collapsed: !svc.collapsed })}
      >
        <div className="flex items-center gap-2">
          {svc.collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          <span className="text-[0.75rem] font-medium text-slate-700">{svc.name || `服务 ${sIdx + 1}`}</span>
          {svc.image && <span className="text-[0.625rem] text-slate-400 ml-1">{svc.image}</span>}
        </div>
        {serviceCount > 1 && (
          <button onClick={(e) => { e.stopPropagation(); removeService(sIdx) }} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Service Body */}
      {!svc.collapsed && (
        <div className="px-3 py-3 space-y-3">
          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>服务名 <span className="text-red-400">*</span></label>
              <input type="text" value={svc.name} onChange={(e) => {
                const newName = e.target.value
                const patch: Partial<ServiceConfig> = { name: newName }
                if (!svc.containerName || svc.containerName === svc.name) {
                  patch.containerName = newName
                }
                updateService(sIdx, patch)
              }} placeholder="web" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>镜像 <span className="text-red-400">*</span></label>
              <input type="text" value={svc.image} onChange={(e) => updateService(sIdx, { image: e.target.value })} placeholder="nginx:latest" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>容器名</label>
              <input type="text" value={svc.containerName} onChange={(e) => updateService(sIdx, { containerName: e.target.value })} placeholder="可选" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>重启策略</label>
              <select value={svc.restart} onChange={(e) => updateService(sIdx, { restart: e.target.value })} className={inputClass}>
                <option value="no">no</option>
                <option value="always">always</option>
                <option value="unless-stopped">unless-stopped</option>
                <option value="on-failure">on-failure</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>命令覆盖</label>
              <input type="text" value={svc.command} onChange={(e) => updateService(sIdx, { command: e.target.value })} placeholder="可选" className={inputClass} />
            </div>
          </div>

          {/* Ports */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass}>端口映射</span>
              <button onClick={addPort} className="text-[0.625rem] text-blue-500 hover:text-blue-600">+ 添加</button>
            </div>
            {svc.ports.map((p, pIdx) => (
              <div key={pIdx} className="flex items-center gap-2 mb-1.5">
                <input type="text" value={p.host} onChange={(e) => updatePort(pIdx, { host: e.target.value })} placeholder="主机端口" className={`${smallInputClass} w-24`} />
                <span className="text-[0.625rem] text-slate-400">:</span>
                <input type="text" value={p.container} onChange={(e) => updatePort(pIdx, { container: e.target.value })} placeholder="容器端口" className={`${smallInputClass} w-24`} />
                <select value={p.protocol} onChange={(e) => updatePort(pIdx, { protocol: e.target.value })} className={`${smallInputClass} w-16`}>
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
                <button onClick={() => removePort(pIdx)} className="p-0.5 text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>

          {/* Volumes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass}>卷挂载</span>
              <button onClick={addVolume} className="text-[0.625rem] text-blue-500 hover:text-blue-600">+ 添加</button>
            </div>
            {svc.volumes.map((v, vIdx) => {
              const isPath = (s: string) => /^[/~.]/.test(s)
              const mismatch = v.host && (
                (v.type === "volume" && isPath(v.host)) ? "看起来像路径，是否应选「目录」？" :
                (v.type === "bind" && v.host && !isPath(v.host)) ? "看起来像卷名，是否应选「卷」？" : ""
              )
              return (
                <div key={vIdx} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <select value={v.type || "bind"} onChange={(e) => updateVolume(vIdx, { type: e.target.value as "bind" | "volume" })} className={`${smallInputClass} w-[4.5rem]`}>
                      <option value="bind">目录</option>
                      <option value="volume">卷</option>
                    </select>
                    <input type="text" value={v.host} onChange={(e) => updateVolume(vIdx, { host: e.target.value })} placeholder={v.type === "volume" ? "卷名" : "主机路径"} className={`${smallInputClass} flex-1 ${mismatch ? "border-amber-300" : ""}`} />
                    <span className="text-[0.625rem] text-slate-400">:</span>
                    <input type="text" value={v.container} onChange={(e) => updateVolume(vIdx, { container: e.target.value })} placeholder="容器路径" className={`${smallInputClass} flex-1`} />
                    <select value={v.mode} onChange={(e) => updateVolume(vIdx, { mode: e.target.value })} className={`${smallInputClass} w-14`}>
                      <option value="rw">rw</option>
                      <option value="ro">ro</option>
                    </select>
                    <button onClick={() => removeVolume(vIdx)} className="p-0.5 text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {mismatch && <div className="text-[0.5625rem] text-amber-500 mt-0.5 ml-[5rem]">{mismatch}</div>}
                </div>
              )
            })}
          </div>

          {/* Environment */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass}>环境变量</span>
              <button onClick={addEnv} className="text-[0.625rem] text-blue-500 hover:text-blue-600">+ 添加</button>
            </div>
            {svc.environment.map((e, eIdx) => (
              <div key={eIdx} className="flex items-center gap-2 mb-1.5">
                <input type="text" value={e.key} onChange={(ev) => updateEnv(eIdx, { key: ev.target.value })} placeholder="KEY" className={`${smallInputClass} w-36`} />
                <span className="text-[0.625rem] text-slate-400">=</span>
                <input type="text" value={e.value} onChange={(ev) => updateEnv(eIdx, { value: ev.target.value })} placeholder="value" className={`${smallInputClass} flex-1`} />
                <button onClick={() => removeEnv(eIdx)} className="p-0.5 text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>

          {/* Networks & Depends On */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>网络（逗号分隔）</label>
              <input type="text" value={svc.networks.join(", ")}
                onChange={(e) => updateService(sIdx, { networks: e.target.value.split(",").map((n) => n.trim()).filter(Boolean) })}
                placeholder="default, backend" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>依赖服务（逗号分隔）</label>
              <input type="text" value={svc.dependsOn.join(", ")}
                onChange={(e) => updateService(sIdx, { dependsOn: e.target.value.split(",").map((n) => n.trim()).filter((n) => n && serviceNames.includes(n) && n !== svc.name) })}
                placeholder={serviceNames.filter((n) => n !== svc.name).join(", ") || "无其他服务"} className={inputClass} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
