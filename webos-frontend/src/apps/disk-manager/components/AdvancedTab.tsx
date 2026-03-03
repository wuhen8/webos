import { useState } from "react"
import { HardDrive, ChevronDown, ChevronRight, Plus, Trash2, Activity, AlertTriangle, CheckCircle2, XCircle, Loader2, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { exec } from "@/lib/services"
import { useUIStore } from "@/stores/uiStore"
import type { DiskInfo, LVMVolumeGroup, MountPointInfo, OSType, SmartInfo, RAIDArray } from "../types"
import {
  formatBytes, formatPercent, formatHours, classifyDiskStatus, getFilesystemOptions,
  buildCreateVolumeCommands, buildExpandVolumeCommands, buildDeleteVolumeCommands, buildDeletePoolCommands,
  parseSmartJSON, smartAttrStatus,
  raidLevels, parseRAIDArrays,
  buildCreateRAIDCommands, buildStopRAIDCommands, buildAddDiskToRAIDCommands,
  buildRemoveDiskFromRAIDCommands, buildCheckRAIDCommands, buildRepairRAIDCommands,
} from "../utils"

type SubTab = "disks" | "lvm" | "smart" | "raid"

interface Props {
  disks: DiskInfo[]
  osType: OSType
  volumeGroups: LVMVolumeGroup[]
  mountPoints: MountPointInfo[]
  onFormat: (device: string, fsType: string, label: string) => void
  onCreatePartition: (device: string, size: string, fsType: string) => void
  onDeletePartition: (device: string) => void
  onMountPartition: (device: string, mountPoint: string, fsType: string, persist: boolean, uuid: string) => void
  onUnmountPartition: (device: string, mountPoint: string, removeFstab: boolean) => void
  execCmd: (cmd: string, msg: string) => Promise<void>
}

const statusLabels: Record<string, { text: string; cls: string }> = {
  "system-disk": { text: "系统盘", cls: "bg-blue-100 text-blue-700" },
  "in-pool": { text: "存储池", cls: "bg-purple-100 text-purple-700" },
  "has-partitions": { text: "有分区", cls: "bg-amber-100 text-amber-700" },
  "available": { text: "可用", cls: "bg-emerald-100 text-emerald-700" },
}

// ==================== Disks Sub-Tab ====================

function DisksSection({ disks, volumeGroups, osType, onFormat, onCreatePartition, onDeletePartition, onMountPartition, onUnmountPartition }: Omit<Props, "execCmd" | "mountPoints">) {
  const [expandedDisk, setExpandedDisk] = useState<string | null>(null)
  const [formatDevice, setFormatDevice] = useState<string | null>(null)
  const [formatFs, setFormatFs] = useState("")
  const [formatLabel, setFormatLabel] = useState("")
  const [mountDevice, setMountDevice] = useState<string | null>(null)
  const [mountPoint, setMountPoint] = useState("")
  const [mountPersist, setMountPersist] = useState(false)
  const [partDevice, setPartDevice] = useState<string | null>(null)
  const [partSize, setPartSize] = useState("100%")
  const [partFs, setPartFs] = useState("ext4")

  const { options: fsOptions, defaultFs } = getFilesystemOptions(osType)

  return (
    <div className="space-y-2">
      {disks.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-[0.75rem]">未检测到磁盘</div>
      ) : (
        disks.map((disk) => {
          const { status, poolName } = classifyDiskStatus(disk, volumeGroups)
          const label = statusLabels[status]
          const expanded = expandedDisk === disk.device

          return (
            <div key={disk.device} className="bg-white/60 rounded-xl border border-slate-200/60">
              {/* Disk Header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-xl"
                onClick={() => setExpandedDisk(expanded ? null : disk.device)}
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <HardDrive className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8125rem] font-medium text-slate-700 font-mono">{disk.device}</span>
                    <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full font-medium ${label.cls}`}>
                      {label.text}{poolName ? ` (${poolName})` : ""}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-slate-400 truncate">
                    {disk.model || "未知型号"} · {formatBytes(disk.size)}{disk.transport ? ` · ${disk.transport}` : ""}
                  </div>
                </div>
              </div>

              {/* Expanded: Partitions + Actions */}
              {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  {/* Partitions */}
                  {disk.partitions?.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">分区</h4>
                      <div className="space-y-1.5">
                        {disk.partitions.map((part, i) => (
                          <div key={part.device || `part-${i}`} className="bg-slate-50/80 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3 text-[0.75rem]">
                              <span className="text-slate-700 font-mono font-medium">{part.device}</span>
                              <span className="text-slate-400">{part.fsType || "-"}</span>
                              <span className="text-slate-400">{formatBytes(part.size)}</span>
                              {part.mountPoint && <span className="text-slate-400 font-mono">{part.mountPoint}</span>}
                              {part.usePercent > 0 && <span className="text-slate-500">{formatPercent(part.usePercent)}</span>}
                              <div className="flex-1" />
                              <div className="flex items-center gap-1">
                                {/* Format */}
                                <button
                                  className="text-[0.6875rem] text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50"
                                  onClick={() => { setFormatDevice(formatDevice === part.device ? null : part.device); setFormatFs(defaultFs); setFormatLabel("") }}
                                >格式化</button>
                                {/* Mount/Unmount */}
                                {part.mountPoint ? (
                                  <button
                                    className="text-[0.6875rem] text-slate-400 hover:text-amber-600 px-1.5 py-0.5 rounded hover:bg-amber-50"
                                    onClick={() => useUIStore.getState().showConfirm({
                                      title: "卸载分区",
                                      description: `确定卸载 ${part.device} (${part.mountPoint})？`,
                                      onConfirm: () => onUnmountPartition(part.device, part.mountPoint, false),
                                    })}
                                  >卸载</button>
                                ) : (
                                  <button
                                    className="text-[0.6875rem] text-slate-400 hover:text-emerald-600 px-1.5 py-0.5 rounded hover:bg-emerald-50"
                                    onClick={() => { setMountDevice(mountDevice === part.device ? null : part.device); setMountPoint(""); setMountPersist(false) }}
                                  >挂载</button>
                                )}
                                {/* Delete */}
                                <button
                                  className="text-[0.6875rem] text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
                                  onClick={() => useUIStore.getState().showConfirm({
                                    title: "删除分区",
                                    description: `确定删除分区 ${part.device}？所有数据将丢失！`,
                                    variant: 'destructive',
                                    onConfirm: () => onDeletePartition(part.device),
                                  })}
                                ><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>

                            {/* Format inline form */}
                            {formatDevice === part.device && (
                              <div className="mt-2 flex items-center gap-2 text-[0.75rem]">
                                <select value={formatFs} onChange={(e) => setFormatFs(e.target.value)}
                                  className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem]">
                                  {fsOptions.map((fs) => <option key={fs} value={fs}>{fs}</option>)}
                                </select>
                                <input type="text" value={formatLabel} onChange={(e) => setFormatLabel(e.target.value)}
                                  placeholder="卷标(可选)" className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] w-24" />
                                <Button size="sm" variant="destructive" className="h-7 text-[0.6875rem]" onClick={() => {
                                  useUIStore.getState().showConfirm({
                                    title: "格式化分区",
                                    description: `确定将 ${part.device} 格式化为 ${formatFs}？所有数据将丢失！`,
                                    variant: 'destructive',
                                    onConfirm: () => { onFormat(part.device, formatFs, formatLabel); setFormatDevice(null) },
                                  })
                                }}>格式化</Button>
                                <button className="text-slate-400 hover:text-slate-600 text-[0.6875rem]" onClick={() => setFormatDevice(null)}>取消</button>
                              </div>
                            )}

                            {/* Mount inline form */}
                            {mountDevice === part.device && (
                              <div className="mt-2 flex items-center gap-2 text-[0.75rem]">
                                <input type="text" value={mountPoint} onChange={(e) => setMountPoint(e.target.value)}
                                  placeholder="/mnt/xxx" className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] w-32 font-mono" />
                                <label className="flex items-center gap-1 text-[0.6875rem] text-slate-500">
                                  <input type="checkbox" checked={mountPersist} onChange={(e) => setMountPersist(e.target.checked)} className="rounded" />
                                  写入 fstab
                                </label>
                                <Button size="sm" className="h-7 text-[0.6875rem]" disabled={!mountPoint} onClick={() => {
                                  onMountPartition(part.device, mountPoint, part.fsType, mountPersist, part.uuid)
                                  setMountDevice(null)
                                }}>挂载</Button>
                                <button className="text-slate-400 hover:text-slate-600 text-[0.6875rem]" onClick={() => setMountDevice(null)}>取消</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disk-level actions */}
                  {status === "available" && (
                    <div className="mt-3">
                      {partDevice !== disk.device ? (
                        <Button variant="outline" size="sm" onClick={() => { setPartDevice(disk.device); setPartSize("100%"); setPartFs(defaultFs) }}>
                          <Plus className="w-3.5 h-3.5" /> 创建分区
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-[0.75rem]">
                          <span className="text-slate-500">大小:</span>
                          <input type="text" value={partSize} onChange={(e) => setPartSize(e.target.value)}
                            className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] w-20" />
                          <select value={partFs} onChange={(e) => setPartFs(e.target.value)}
                            className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem]">
                            {fsOptions.map((fs) => <option key={fs} value={fs}>{fs}</option>)}
                          </select>
                          <Button size="sm" className="h-7 text-[0.6875rem]" onClick={() => {
                            useUIStore.getState().showConfirm({
                              title: "创建分区",
                              description: `将在 ${disk.device} 上创建 GPT 分区表并创建分区，磁盘数据将被清除。`,
                              variant: 'destructive',
                              onConfirm: () => { onCreatePartition(disk.device, partSize, partFs); setPartDevice(null) },
                            })
                          }}>创建</Button>
                          <button className="text-slate-400 hover:text-slate-600 text-[0.6875rem]" onClick={() => setPartDevice(null)}>取消</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ==================== LVM Sub-Tab ====================

function LVMSection({ volumeGroups, osType, execCmd }: Pick<Props, "volumeGroups" | "osType" | "execCmd">) {
  const [expandedVG, setExpandedVG] = useState<string | null>(null)
  const [createLV, setCreateLV] = useState<string | null>(null)
  const [lvName, setLvName] = useState("")
  const [lvSize, setLvSize] = useState("100%FREE")
  const [lvFs, setLvFs] = useState("")
  const [lvMount, setLvMount] = useState("")
  const [expandLV, setExpandLV] = useState<string | null>(null)
  const [expandSize, setExpandSize] = useState("+100%FREE")

  const { options: fsOptions, defaultFs } = getFilesystemOptions(osType)

  return (
    <div className="space-y-2">
      {volumeGroups.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-[0.75rem]">暂无 LVM 卷组</div>
      ) : (
        volumeGroups.map((vg) => {
          const expanded = expandedVG === vg.name
          return (
            <div key={vg.name} className="bg-white/60 rounded-xl border border-slate-200/60">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-xl"
                onClick={() => setExpandedVG(expanded ? null : vg.name)}
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8125rem] font-medium text-slate-700">{vg.name}</span>
                    <span className="text-[0.6875rem] text-slate-400">{vg.pvCount} PV · {vg.lvCount} LV</span>
                  </div>
                  <div className="text-[0.6875rem] text-slate-400">
                    总计 {formatBytes(vg.size)} · 空闲 {formatBytes(vg.free)}
                  </div>
                </div>
              </div>

              {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  {/* PVs */}
                  <div className="mt-3">
                    <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">物理卷 (PV)</h4>
                    <div className="space-y-1">
                      {(vg.pvs || []).map((pv, i) => (
                        <div key={pv.device || `pv-${i}`} className="flex items-center gap-3 text-[0.75rem] bg-slate-50/80 rounded-lg px-3 py-2">
                          <span className="text-slate-700 font-mono">{pv.device}</span>
                          <div className="flex-1" />
                          <span className="text-slate-500">{formatBytes(pv.size)}</span>
                          <span className="text-slate-400">空闲 {formatBytes(pv.free)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* LVs */}
                  <div className="mt-3">
                    <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">逻辑卷 (LV)</h4>
                    <div className="space-y-1">
                      {(vg.lvs || []).map((lv, i) => (
                        <div key={lv.path || `lv-${i}`} className="bg-slate-50/80 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-3 text-[0.75rem]">
                            <span className="text-slate-700 font-medium">{lv.name}</span>
                            <span className="text-slate-400 font-mono text-[0.6875rem]">{lv.path}</span>
                            <span className="text-slate-400">{lv.fsType || "-"}</span>
                            <span className="text-slate-400 font-mono">{lv.mountPoint || "-"}</span>
                            <div className="flex-1" />
                            <span className="text-slate-600">{formatBytes(lv.size)}</span>
                            {lv.usePercent > 0 && <span className="text-slate-500">{formatPercent(lv.usePercent)}</span>}
                            <button
                              className="text-[0.6875rem] text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50"
                              onClick={() => { setExpandLV(expandLV === lv.path ? null : lv.path); setExpandSize("+100%FREE") }}
                            >扩展</button>
                            <button
                              className="text-[0.6875rem] text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
                              onClick={() => {
                                const cmd = buildDeleteVolumeCommands(lv.path, lv.mountPoint)
                                useUIStore.getState().showConfirm({
                                  title: "删除逻辑卷",
                                  description: `确定删除逻辑卷 ${lv.name} (${lv.path})？${lv.mountPoint ? `将卸载 ${lv.mountPoint} 并从 fstab 移除。` : ""}所有数据将丢失！`,
                                  variant: 'destructive',
                                  onConfirm: () => execCmd(cmd, "逻辑卷删除成功"),
                                })
                              }}
                            ><Trash2 className="w-3 h-3" /></button>
                          </div>
                          {expandLV === lv.path && (
                            <div className="mt-2 flex items-center gap-2 text-[0.75rem]">
                              <input type="text" value={expandSize} onChange={(e) => setExpandSize(e.target.value)}
                                placeholder="+100%FREE 或 +10G" className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] w-32" />
                              <Button size="sm" className="h-7 text-[0.6875rem]" onClick={() => {
                                const cmd = buildExpandVolumeCommands(lv.path, expandSize, lv.fsType)
                                useUIStore.getState().showConfirm({
                                  title: "扩展逻辑卷",
                                  description: `将 ${lv.name} 扩展 ${expandSize}`,
                                  onConfirm: () => { execCmd(cmd, "逻辑卷扩展成功"); setExpandLV(null) },
                                })
                              }}>扩展</Button>
                              <button className="text-slate-400 hover:text-slate-600 text-[0.6875rem]" onClick={() => setExpandLV(null)}>取消</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Create LV / Delete VG */}
                  <div className="mt-3 flex items-center gap-2">
                    {createLV !== vg.name ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setCreateLV(vg.name); setLvName(""); setLvSize("100%FREE"); setLvFs(defaultFs); setLvMount("") }}>
                          <Plus className="w-3.5 h-3.5" /> 创建逻辑卷
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => {
                          const lvs = (vg.lvs || []).map((lv) => ({ path: lv.path, mountPoint: lv.mountPoint || undefined }))
                          const pvDevices = (vg.pvs || []).map((pv) => pv.device)
                          const cmd = buildDeletePoolCommands(vg.name, lvs, pvDevices)
                          useUIStore.getState().showConfirm({
                            title: "删除卷组",
                            description: `确定删除卷组 ${vg.name}？将移除所有逻辑卷（${vg.lvCount} 个）和物理卷（${vg.pvCount} 个），所有数据将丢失！`,
                            variant: 'destructive',
                            onConfirm: () => execCmd(cmd, "卷组删除成功"),
                          })
                        }}>
                          <Trash2 className="w-3.5 h-3.5" /> 删除卷组
                        </Button>
                      </>
                    ) : (
                      <div className="bg-blue-50/50 rounded-lg border border-blue-200/60 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[0.6875rem] text-slate-500">名称</label>
                            <input type="text" value={lvName} onChange={(e) => setLvName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                              placeholder="lv_name" className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5" />
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-slate-500">大小</label>
                            <input type="text" value={lvSize} onChange={(e) => setLvSize(e.target.value)}
                              placeholder="100%FREE 或 10G" className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5" />
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-slate-500">文件系统</label>
                            <select value={lvFs} onChange={(e) => setLvFs(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5">
                              {fsOptions.map((fs) => <option key={fs} value={fs}>{fs}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[0.6875rem] text-slate-500">挂载点</label>
                            <input type="text" value={lvMount} onChange={(e) => setLvMount(e.target.value)}
                              placeholder="/mnt/xxx" className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5 font-mono" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-[0.6875rem]" onClick={() => setCreateLV(null)}>取消</Button>
                          <Button size="sm" className="h-7 text-[0.6875rem]" disabled={!lvName || !lvMount} onClick={() => {
                            const cmd = buildCreateVolumeCommands(vg.name, lvName, lvSize, lvFs, lvMount)
                            useUIStore.getState().showConfirm({
                              title: "创建逻辑卷",
                              description: `在 ${vg.name} 中创建逻辑卷 ${lvName} (${lvSize})`,
                              onConfirm: () => { execCmd(cmd, "逻辑卷创建成功"); setCreateLV(null) },
                            })
                          }}>创建</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ==================== S.M.A.R.T Sub-Tab ====================

function SmartSection({ disks }: { disks: DiskInfo[] }) {
  const [selectedDisk, setSelectedDisk] = useState("")
  const [smartInfo, setSmartInfo] = useState<SmartInfo | null>(null)
  const [smartLoading, setSmartLoading] = useState(false)

  const fetchSmart = async (device: string) => {
    setSelectedDisk(device)
    setSmartLoading(true)
    try {
      const { stdout } = await exec(`smartctl -a -j ${device}`)
      if (stdout) {
        setSmartInfo(parseSmartJSON(stdout))
      } else {
        setSmartInfo({ available: false, healthy: false, temperature: 0, powerOnHours: 0, powerCycles: 0, model: "", serial: "", firmware: "", attributes: [] })
      }
    } catch {
      setSmartInfo({ available: false, healthy: false, temperature: 0, powerOnHours: 0, powerCycles: 0, model: "", serial: "", firmware: "", attributes: [] })
    } finally {
      setSmartLoading(false)
    }
  }

  const statusIcon = (s: string) => {
    if (s === "critical") return <XCircle className="w-3.5 h-3.5 text-red-500" />
    if (s === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
  }

  return (
    <div className="space-y-3">
      {/* Disk selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedDisk}
          onChange={(e) => e.target.value && fetchSmart(e.target.value)}
          className="text-[0.75rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300"
        >
          <option value="">选择磁盘...</option>
          {disks.map((d, i) => (
            <option key={d.device || `disk-${i}`} value={d.device}>{d.device} ({d.model || "未知"})</option>
          ))}
        </select>
        {smartLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
      </div>

      {/* Results */}
      {smartInfo && !smartLoading && (
        <div className="bg-white/60 rounded-xl border border-slate-200/60 p-4">
          {!smartInfo.available ? (
            <div className="text-center py-4 text-slate-400 text-[0.75rem]">
              <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              此磁盘不支持 S.M.A.R.T 或数据不可用
            </div>
          ) : (
            <>
              {/* Health overview */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[0.6875rem] text-slate-500">健康状态</div>
                  <div className={`text-[0.8125rem] font-semibold ${smartInfo.healthy ? "text-emerald-600" : "text-red-600"}`}>
                    {smartInfo.healthy ? "健康" : "异常"}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[0.6875rem] text-slate-500">温度</div>
                  <div className="text-[0.8125rem] font-semibold text-slate-700">{smartInfo.temperature}°C</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[0.6875rem] text-slate-500">通电时间</div>
                  <div className="text-[0.8125rem] font-semibold text-slate-700">{formatHours(smartInfo.powerOnHours)}</div>
                </div>
              </div>

              {/* Device info */}
              <div className="grid grid-cols-3 gap-3 mb-4 text-[0.75rem]">
                <div><span className="text-slate-500">型号: </span><span className="text-slate-700">{smartInfo.model}</span></div>
                <div><span className="text-slate-500">序列号: </span><span className="text-slate-700 font-mono">{smartInfo.serial}</span></div>
                <div><span className="text-slate-500">固件: </span><span className="text-slate-700">{smartInfo.firmware}</span></div>
              </div>

              {/* Attributes table */}
              {smartInfo.attributes.length > 0 && (
                <table className="w-full text-[0.6875rem]">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left py-1.5 px-2 font-medium text-slate-500">状态</th>
                      <th className="text-left py-1.5 px-2 font-medium text-slate-500">ID</th>
                      <th className="text-left py-1.5 px-2 font-medium text-slate-500">属性</th>
                      <th className="text-right py-1.5 px-2 font-medium text-slate-500">当前值</th>
                      <th className="text-right py-1.5 px-2 font-medium text-slate-500">最差值</th>
                      <th className="text-right py-1.5 px-2 font-medium text-slate-500">阈值</th>
                      <th className="text-right py-1.5 px-2 font-medium text-slate-500">原始值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smartInfo.attributes.map((attr) => (
                      <tr key={attr.id} className={`border-b border-slate-50 ${
                        attr.status === "critical" ? "bg-red-50/50" : attr.status === "warning" ? "bg-amber-50/50" : ""
                      }`}>
                        <td className="py-1.5 px-2">{statusIcon(attr.status)}</td>
                        <td className="py-1.5 px-2 text-slate-500">{attr.id}</td>
                        <td className="py-1.5 px-2 text-slate-700">{attr.name}</td>
                        <td className="py-1.5 px-2 text-right text-slate-700">{attr.value}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{attr.worst}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{attr.threshold}</td>
                        <td className="py-1.5 px-2 text-right text-slate-700 font-mono">{attr.rawValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== RAID Sub-Tab ====================

function RAIDSection({ disks, osType, execCmd }: Pick<Props, "disks" | "osType" | "execCmd">) {
  const [arrays, setArrays] = useState<RAIDArray[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedArray, setExpandedArray] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [raidLevel, setRaidLevel] = useState("1")
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [arrayName, setArrayName] = useState("md0")
  const [raidFs, setRaidFs] = useState("ext4")
  const [raidMount, setRaidMount] = useState("")
  const [addDiskArray, setAddDiskArray] = useState<string | null>(null)
  const [addDiskDevice, setAddDiskDevice] = useState("")

  const { options: fsOptions } = getFilesystemOptions(osType)

  const fetchArrays = async () => {
    setLoading(true)
    try {
      // Scan all md devices
      const { stdout } = await exec(`cat /proc/mdstat 2>/dev/null && echo "---DETAIL---" && for md in /dev/md*; do [ -b "$md" ] && mdadm --detail "$md" 2>/dev/null; done`)
      if (stdout) {
        const detailPart = stdout.split("---DETAIL---")[1] || ""
        setArrays(parseRAIDArrays(detailPart))
      } else {
        setArrays([])
      }
    } catch {
      setArrays([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount
  useState(() => { fetchArrays() })

  const availableDisks = disks.filter((d) => {
    const { status } = classifyDiskStatus(d, [])
    return status === "available" || status === "has-partitions"
  })

  const selectedLevel = raidLevels.find((l) => l.value === raidLevel)
  const canCreate = selectedDevices.length >= (selectedLevel?.minDisks || 2) && arrayName

  const stateColor = (state: string) => {
    if (state.includes("active") || state.includes("clean")) return "text-emerald-600 bg-emerald-50"
    if (state.includes("degraded")) return "text-amber-600 bg-amber-50"
    if (state.includes("inactive") || state.includes("stopped")) return "text-red-600 bg-red-50"
    return "text-slate-600 bg-slate-50"
  }

  const memberRoleColor = (role: string) => {
    if (role === "active") return "bg-emerald-100 text-emerald-700"
    if (role === "spare") return "bg-blue-100 text-blue-700"
    if (role === "faulty") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-700"
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={fetchArrays} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
          刷新 RAID
        </Button>
        {osType === "linux" && (
          <Button variant="outline" size="sm" onClick={() => { setShowCreate(!showCreate); setSelectedDevices([]); setArrayName("md0"); setRaidLevel("1"); setRaidMount("") }}>
            <Plus className="w-3.5 h-3.5" /> 创建阵列
          </Button>
        )}
      </div>

      {osType !== "linux" && (
        <div className="text-center py-8 text-slate-400 text-[0.75rem]">RAID 管理仅支持 Linux (mdadm)</div>
      )}

      {/* Create RAID form */}
      {showCreate && osType === "linux" && (
        <div className="bg-blue-50/50 rounded-xl border border-blue-200/60 p-4 space-y-3">
          <div className="text-[0.8125rem] font-medium text-slate-700">创建 RAID 阵列</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[0.6875rem] text-slate-500">阵列名称</label>
              <input type="text" value={arrayName} onChange={(e) => setArrayName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="md0" className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5 font-mono" />
            </div>
            <div>
              <label className="text-[0.6875rem] text-slate-500">RAID 级别</label>
              <select value={raidLevel} onChange={(e) => setRaidLevel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5">
                {raidLevels.map((l) => (
                  <option key={l.value} value={l.value}>{l.label} - {l.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[0.6875rem] text-slate-500">文件系统</label>
              <select value={raidFs} onChange={(e) => setRaidFs(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5">
                {fsOptions.map((fs) => <option key={fs} value={fs}>{fs}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[0.6875rem] text-slate-500">挂载点 (可选)</label>
              <input type="text" value={raidMount} onChange={(e) => setRaidMount(e.target.value)}
                placeholder="/mnt/raid" className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem] mt-0.5 font-mono" />
            </div>
          </div>

          {/* Disk selection */}
          <div>
            <label className="text-[0.6875rem] text-slate-500 mb-1 block">
              选择磁盘 (至少 {selectedLevel?.minDisks || 2} 块，已选 {selectedDevices.length})
            </label>
            <div className="space-y-1 max-h-40 overflow-auto">
              {availableDisks.length === 0 ? (
                <div className="text-[0.6875rem] text-slate-400 py-2">无可用磁盘</div>
              ) : (
                availableDisks.map((d) => (
                  <label key={d.device} className="flex items-center gap-2 text-[0.75rem] bg-white/80 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selectedDevices.includes(d.device)}
                      onChange={(e) => setSelectedDevices(e.target.checked ? [...selectedDevices, d.device] : selectedDevices.filter((x) => x !== d.device))}
                      className="rounded" />
                    <span className="font-mono text-slate-700">{d.device}</span>
                    <span className="text-slate-400">{d.model || "未知"}</span>
                    <span className="text-slate-400">{formatBytes(d.size)}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[0.6875rem]" onClick={() => setShowCreate(false)}>取消</Button>
            <Button size="sm" className="h-7 text-[0.6875rem]" disabled={!canCreate} onClick={() => {
              const cmd = buildCreateRAIDCommands(raidLevel, selectedDevices, arrayName, raidFs, raidMount)
              useUIStore.getState().showConfirm({
                title: "创建 RAID 阵列",
                description: `将使用 ${selectedDevices.length} 块磁盘创建 ${selectedLevel?.label} 阵列 /dev/${arrayName}。所选磁盘数据将被清除！`,
                variant: "destructive",
                onConfirm: () => { execCmd(cmd, "RAID 阵列创建成功"); setShowCreate(false) },
              })
            }}>创建</Button>
          </div>
        </div>
      )}

      {/* Array list */}
      {osType === "linux" && arrays.map((arr) => {
        const expanded = expandedArray === arr.device
        return (
          <div key={arr.device} className="bg-white/60 rounded-xl border border-slate-200/60">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-xl"
              onClick={() => setExpandedArray(expanded ? null : arr.device)}
            >
              {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <Shield className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.8125rem] font-medium text-slate-700 font-mono">{arr.device}</span>
                  <span className="text-[0.6875rem] text-slate-400">{arr.level}</span>
                  <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full font-medium ${stateColor(arr.state)}`}>{arr.state}</span>
                </div>
                <div className="text-[0.6875rem] text-slate-400">
                  {formatBytes(arr.size)} · {arr.activeDevices}/{arr.totalDevices} 设备
                  {arr.failedDevices > 0 && <span className="text-red-500 ml-1">· {arr.failedDevices} 故障</span>}
                  {arr.syncPercent != null && arr.syncPercent > 0 && <span className="text-blue-500 ml-1">· {arr.syncAction} {arr.syncPercent.toFixed(1)}%</span>}
                  {arr.mountPoint && <span className="ml-1">· {arr.mountPoint}</span>}
                </div>
              </div>
            </div>

            {expanded && (
              <div className="px-4 pb-4 border-t border-slate-100">
                {/* Sync progress */}
                {arr.syncPercent != null && arr.syncPercent > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-[0.6875rem] text-slate-500 mb-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {arr.syncAction} 进度: {arr.syncPercent.toFixed(1)}%
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${arr.syncPercent}%` }} />
                    </div>
                  </div>
                )}

                {/* Members */}
                <div className="mt-3">
                  <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">成员磁盘</h4>
                  <div className="space-y-1">
                    {arr.members.map((m, i) => (
                      <div key={m.device || `m-${i}`} className="flex items-center gap-3 text-[0.75rem] bg-slate-50/80 rounded-lg px-3 py-2">
                        <span className="text-slate-700 font-mono">{m.device}</span>
                        <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full font-medium ${memberRoleColor(m.role)}`}>{m.role}</span>
                        <span className="text-slate-400 text-[0.6875rem]">{m.state}</span>
                        <div className="flex-1" />
                        {m.role === "faulty" && (
                          <button className="text-[0.6875rem] text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50"
                            onClick={() => {
                              const cmd = buildRemoveDiskFromRAIDCommands(arr.device, m.device)
                              useUIStore.getState().showConfirm({
                                title: "移除故障盘",
                                description: `从 ${arr.device} 中移除故障磁盘 ${m.device}`,
                                onConfirm: () => execCmd(cmd, "故障盘已移除"),
                              })
                            }}>移除</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Add disk */}
                  {addDiskArray !== arr.device ? (
                    <Button variant="outline" size="sm" onClick={() => { setAddDiskArray(arr.device); setAddDiskDevice("") }}>
                      <Plus className="w-3.5 h-3.5" /> 添加磁盘
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select value={addDiskDevice} onChange={(e) => setAddDiskDevice(e.target.value)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-[0.6875rem]">
                        <option value="">选择磁盘...</option>
                        {availableDisks.filter((d) => !arr.members.some((m) => m.device === d.device)).map((d) => (
                          <option key={d.device} value={d.device}>{d.device} ({formatBytes(d.size)})</option>
                        ))}
                      </select>
                      <Button size="sm" className="h-7 text-[0.6875rem]" disabled={!addDiskDevice} onClick={() => {
                        const cmd = buildAddDiskToRAIDCommands(arr.device, addDiskDevice)
                        useUIStore.getState().showConfirm({
                          title: "添加磁盘到 RAID",
                          description: `将 ${addDiskDevice} 添加到 ${arr.device}`,
                          onConfirm: () => { execCmd(cmd, "磁盘已添加"); setAddDiskArray(null) },
                        })
                      }}>添加</Button>
                      <button className="text-slate-400 hover:text-slate-600 text-[0.6875rem]" onClick={() => setAddDiskArray(null)}>取消</button>
                    </div>
                  )}

                  {/* Check */}
                  <Button variant="outline" size="sm" onClick={() => {
                    const cmd = buildCheckRAIDCommands(arr.device)
                    execCmd(cmd, "RAID 检查已启动")
                  }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> 检查
                  </Button>

                  {/* Repair */}
                  {arr.state.includes("degraded") && (
                    <Button variant="outline" size="sm" onClick={() => {
                      const cmd = buildRepairRAIDCommands(arr.device)
                      execCmd(cmd, "RAID 修复已启动")
                    }}>
                      <Activity className="w-3.5 h-3.5" /> 修复
                    </Button>
                  )}

                  {/* Stop/Delete */}
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => {
                    const cmd = buildStopRAIDCommands(arr.device, arr.mountPoint)
                    useUIStore.getState().showConfirm({
                      title: "停止 RAID 阵列",
                      description: `确定停止并删除 ${arr.device}？${arr.mountPoint ? `将卸载 ${arr.mountPoint}。` : ""}阵列将被解散！`,
                      variant: "destructive",
                      onConfirm: () => execCmd(cmd, "RAID 阵列已停止"),
                    })
                  }}>
                    <Trash2 className="w-3.5 h-3.5" /> 停止阵列
                  </Button>
                </div>

                {/* Detail info */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-[0.6875rem]">
                  <div><span className="text-slate-500">UUID: </span><span className="text-slate-700 font-mono">{arr.uuid || "-"}</span></div>
                  <div><span className="text-slate-500">文件系统: </span><span className="text-slate-700">{arr.fsType || "-"}</span></div>
                  <div><span className="text-slate-500">挂载点: </span><span className="text-slate-700 font-mono">{arr.mountPoint || "-"}</span></div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {osType === "linux" && !loading && arrays.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-[0.75rem]">未检测到 RAID 阵列</div>
      )}
    </div>
  )
}

// ==================== Main AdvancedTab ====================

export function AdvancedTab(props: Props) {
  const [subTab, setSubTab] = useState<SubTab>("disks")

  const subTabClass = (tab: SubTab) =>
    `px-3 py-1 text-[0.6875rem] font-medium rounded-md transition-all ${
      subTab === tab
        ? "bg-white/70 text-slate-800 shadow-sm"
        : "text-slate-500 hover:text-slate-700 hover:bg-white/30"
    }`

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Sub-tab selector */}
      <div className="flex items-center gap-1 bg-slate-100/60 rounded-lg p-0.5 w-fit">
        <button className={subTabClass("disks")} onClick={() => setSubTab("disks")}>
          <span className="flex items-center gap-1.5"><HardDrive className="w-3 h-3" />磁盘列表</span>
        </button>
        <button className={subTabClass("lvm")} onClick={() => setSubTab("lvm")}>
          <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" />LVM 管理</span>
        </button>
        <button className={subTabClass("smart")} onClick={() => setSubTab("smart")}>
          <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" />S.M.A.R.T</span>
        </button>
        <button className={subTabClass("raid")} onClick={() => setSubTab("raid")}>
          <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" />RAID</span>
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-auto">
        {subTab === "disks" && (
          <DisksSection
            disks={props.disks}
            volumeGroups={props.volumeGroups}
            osType={props.osType}
            onFormat={props.onFormat}
            onCreatePartition={props.onCreatePartition}
            onDeletePartition={props.onDeletePartition}
            onMountPartition={props.onMountPartition}
            onUnmountPartition={props.onUnmountPartition}
          />
        )}
        {subTab === "lvm" && (
          <LVMSection
            volumeGroups={props.volumeGroups}
            osType={props.osType}
            execCmd={props.execCmd}
          />
        )}
        {subTab === "smart" && <SmartSection disks={props.disks} />}
        {subTab === "raid" && <RAIDSection disks={props.disks} osType={props.osType} execCmd={props.execCmd} />}
      </div>
    </div>
  )
}
