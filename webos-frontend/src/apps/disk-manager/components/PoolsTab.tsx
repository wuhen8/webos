import { useState, useEffect } from "react"
import { useTranslation } from 'react-i18next'
import { Plus, ChevronDown, ChevronRight, HardDrive, AlertTriangle, Check, ArrowLeft, ArrowRight, Layers, Trash2, Info, Shield, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/stores/uiStore"
import { exec } from "@/lib/services"
import type { DiskInfo, LVMVolumeGroup, MountPointInfo, OSType, CreatePoolWizardState } from "../types"
import {
  formatBytes, formatPercent, deriveStoragePools, classifyDiskStatus,
  getFilesystemOptions, buildCreatePoolWithRAIDCommands,
  buildDeleteVolumeCommands, buildDeletePoolCommands,
  getRaidLevelsLocalized,
} from "../utils"

interface Props {
  disks: DiskInfo[]
  volumeGroups: LVMVolumeGroup[]
  mountPoints: MountPointInfo[]
  osType: OSType
  execCmd: (cmd: string, msg: string) => Promise<void>
}

function progressColor(p: number) { return p >= 80 ? "bg-red-500" : p >= 60 ? "bg-amber-500" : "bg-emerald-500" }
function progressBg(p: number) { return p >= 80 ? "bg-red-100" : p >= 60 ? "bg-amber-100" : "bg-emerald-100" }

const SYSTEM_MOUNTS = new Set(["/", "/boot", "/boot/efi", "/home", "/var", "/usr", "/tmp", "/snap", "/opt", "/srv"])
function calcCapacity(selectedDevices: string[], raidLevel: string, disks: DiskInfo[], t: (key: string, options?: Record<string, any>) => string) {
  const sizes = selectedDevices.map((dev) => disks.find((d) => d.device === dev)?.size || 0)
  const total = sizes.reduce((a, b) => a + b, 0)
  if (sizes.length === 0) return { total: 0, usable: 0, faultTolerance: "" }
  const minSize = Math.min(...sizes)
  const n = sizes.length
  switch (raidLevel) {
    case "0": return { total, usable: total, faultTolerance: t('apps.diskManager.pools.capacity.noFaultTolerance') }
    case "1": return { total, usable: minSize, faultTolerance: t('apps.diskManager.pools.capacity.allowFailures', { count: n - 1 }) }
    case "5": return { total, usable: minSize * (n - 1), faultTolerance: t('apps.diskManager.pools.capacity.allowFailures', { count: 1 }) }
    case "6": return { total, usable: minSize * (n - 2), faultTolerance: t('apps.diskManager.pools.capacity.allowFailures', { count: 2 }) }
    case "10": return { total, usable: minSize * Math.floor(n / 2), faultTolerance: t('apps.diskManager.pools.capacity.allowOnePerMirrorGroup') }
    default: return { total, usable: total, faultTolerance: "" }
  }
}

function suggestRAIDLevel(count: number): string {
  if (count >= 3) return "5"
  if (count === 2) return "1"
  return "0"
}

function isSystemVG(vg: LVMVolumeGroup | undefined): boolean {
  if (!vg) return false
  return (vg.lvs || []).some((lv) => {
    if (!lv.mountPoint) return false
    // Exact match or starts with a system path (e.g. /var/log)
    return SYSTEM_MOUNTS.has(lv.mountPoint) || [...SYSTEM_MOUNTS].some((m) => m !== "/" && lv.mountPoint.startsWith(m + "/"))
  })
}

export function PoolsTab({ disks, volumeGroups, osType, execCmd }: Props) {
  const { t } = useTranslation()
  const raidLevels = getRaidLevelsLocalized(t)
  const stepLabels = [
    t('apps.diskManager.pools.wizard.steps.selectDisks'),
    t('apps.diskManager.pools.wizard.steps.raidConfig'),
    t('apps.diskManager.pools.wizard.steps.poolConfig'),
    t('apps.diskManager.pools.wizard.steps.filesystem'),
    t('apps.diskManager.pools.wizard.steps.confirm'),
  ]
  const [expandedPool, setExpandedPool] = useState<string | null>(null)
  const [wizard, setWizard] = useState<CreatePoolWizardState | null>(null)
  const [addDiskPool, setAddDiskPool] = useState<string | null>(null)
  const [addDiskSelected, setAddDiskSelected] = useState<string[]>([])
  const [addDiskRaidLevel, setAddDiskRaidLevel] = useState<string | null>(null)
  // Map of md device -> RAID level (e.g. "/dev/md0" -> "raid5")
  const [raidLevelMap, setRaidLevelMap] = useState<Record<string, string>>({})

  const pools = deriveStoragePools(volumeGroups, disks)
  const availableDisks = disks.filter((d) => classifyDiskStatus(d, volumeGroups).status === "available")
  const { options: fsOptions, defaultFs } = getFilesystemOptions(osType)

  // Query RAID levels for all md PVs
  useEffect(() => {
    const mdDevices: string[] = []
    for (const vg of volumeGroups) {
      for (const pv of (vg.pvs || [])) {
        if (pv.device.match(/\/dev\/md\d+/) && !mdDevices.includes(pv.device)) {
          mdDevices.push(pv.device)
        }
      }
    }
    if (mdDevices.length === 0) { setRaidLevelMap({}); return }
    const cmd = mdDevices.map((d) => `echo "${d}:$(mdadm --detail ${d} 2>/dev/null | grep 'Raid Level' | awk '{print $NF}')"`).join(" && ")
    exec(cmd).then(({ stdout }: { stdout: string }) => {
      if (!stdout) return
      const map: Record<string, string> = {}
      for (const line of stdout.trim().split("\n")) {
        const [dev, level] = line.split(":")
        if (dev && level) map[dev.trim()] = level.trim()
      }
      setRaidLevelMap(map)
    }).catch(() => {})
  }, [volumeGroups])

  const startWizard = () => setWizard({
    step: 1, selectedDevices: [], useRAID: true, raidLevel: "1", arrayName: "md0",
    poolName: "pool_data", lvName: "lv_data", fsType: defaultFs, mountPoint: "/mnt/storage",
  })

  const toggleWizardDisk = (device: string) => {
    if (!wizard) return
    const sel = wizard.selectedDevices.includes(device)
      ? wizard.selectedDevices.filter((d) => d !== device)
      : [...wizard.selectedDevices, device]
    setWizard({ ...wizard, selectedDevices: sel })
  }

  const canGoNext = (): boolean => {
    if (!wizard) return false
    switch (wizard.step) {
      case 1: return wizard.selectedDevices.length >= 1
      case 2: return !!wizard.arrayName
      case 3: return !!wizard.poolName && !!wizard.lvName
      case 4: return !!wizard.fsType && !!wizard.mountPoint
      default: return false
    }
  }

  // ==================== Wizard ====================

  const renderWizard = () => {
    if (!wizard) return null
    const cap = calcCapacity(wizard.selectedDevices, wizard.raidLevel, disks, t)

    return (
      <div className="bg-white/60 rounded-xl border border-slate-200/60 p-4">
        {/* Step bar */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto">
          {stepLabels.map((label, i) => {
            const s = i + 1
            return (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.625rem] font-medium ${
                  wizard.step === s ? "bg-blue-500 text-white" : wizard.step > s ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                }`}>{wizard.step > s ? <Check className="w-3 h-3" /> : s}</div>
                <span className={`text-[0.6875rem] ${wizard.step === s ? "text-slate-800 font-medium" : "text-slate-400"}`}>{label}</span>
                {i < 4 && <div className="w-6 h-px bg-slate-200" />}
              </div>
            )
          })}
          <div className="flex-1" />
          <button onClick={() => setWizard(null)} className="text-[0.75rem] text-slate-400 hover:text-slate-600 shrink-0">{t('common.cancel')}</button>
        </div>

        {/* Step 1: Select disks */}
        {wizard.step === 1 && (
          <div>
            <p className="text-[0.75rem] text-slate-500 mb-3">{t('apps.diskManager.pools.wizard.selectDisksDescription')}</p>
            {availableDisks.length === 0 ? (
              <p className="text-[0.75rem] text-slate-400 py-4 text-center">{t('apps.diskManager.pools.wizard.noAvailableDisks')}</p>
            ) : (
              <div className="space-y-2">
                {availableDisks.map((disk, i) => (
                  <label key={disk.device || `wd-${i}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    wizard.selectedDevices.includes(disk.device) ? "border-blue-300 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}>
                    <input type="checkbox" checked={wizard.selectedDevices.includes(disk.device)} onChange={() => toggleWizardDisk(disk.device)} className="rounded" />
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <div className="flex-1">
                      <div className="text-[0.75rem] font-medium text-slate-700 font-mono">{disk.device}</div>
                      <div className="text-[0.6875rem] text-slate-400">{disk.model || t('apps.diskManager.advanced.common.unknownModel')} · {formatBytes(disk.size)}{disk.transport ? ` · ${disk.transport}` : ""}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {wizard.selectedDevices.length > 0 && (
              <div className="mt-3 text-[0.6875rem] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                {t('apps.diskManager.pools.wizard.selectedSummary', {
                  count: wizard.selectedDevices.length,
                  size: formatBytes(wizard.selectedDevices.reduce((s, dev) => s + (disks.find((d) => d.device === dev)?.size || 0), 0)),
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: RAID config */}
        {wizard.step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-2">{t('apps.diskManager.pools.wizard.raidLevel')}</label>
              <div className="space-y-2">
                {raidLevels.map((level: ReturnType<typeof getRaidLevelsLocalized>[number]) => {
                  const n = wizard.selectedDevices.length
                  const disabled = n < level.minDisks
                  const recommended = level.value === suggestRAIDLevel(n)
                  const levelCap = calcCapacity(wizard.selectedDevices, level.value, disks, t)
                  // fault tolerance display
                  const faultCount = level.value === "0" ? 0 : level.value === "1" ? n - 1 : level.value === "5" ? 1 : level.value === "6" ? 2 : Math.floor(n / 2)
                  return (
                    <label key={level.value} className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                      disabled ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50/30" :
                      wizard.raidLevel === level.value ? "border-blue-300 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" name="raidLevel" value={level.value} checked={wizard.raidLevel === level.value}
                          disabled={disabled} onChange={() => setWizard({ ...wizard, raidLevel: level.value })} className="text-blue-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[0.75rem] font-medium text-slate-700">{level.label}</span>
                            <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{level.short}</span>
                            {recommended && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{t('apps.diskManager.pools.wizard.recommended')}</span>}
                            {disabled && <span className="text-[0.5625rem] text-red-400">{t('apps.diskManager.pools.wizard.minDisksRequired', { count: level.minDisks })}</span>}
                          </div>
                          <div className="text-[0.6875rem] text-slate-400 mt-0.5">{level.desc}</div>
                          {!disabled && (
                            <div className="flex items-center gap-4 mt-1.5 text-[0.6875rem]">
                              <span className="text-slate-500">{t('apps.diskManager.pools.wizard.usable')}: <span className="text-slate-700 font-medium">{formatBytes(levelCap.usable)}</span></span>
                              <span className="text-slate-500">{t('apps.diskManager.pools.wizard.faultTolerance')}: <span className={faultCount > 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                {faultCount > 0 ? t('apps.diskManager.pools.capacity.allowFailures', { count: faultCount }) : t('apps.diskManager.pools.capacity.noFaultTolerance')}
                              </span></span>
                              <span className="text-slate-500">{t('apps.diskManager.pools.wizard.efficiency')}: <span className="text-slate-700">{cap.total > 0 ? ((levelCap.usable / cap.total) * 100).toFixed(0) : 0}%</span></span>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Array name */}
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-1">{t('apps.diskManager.pools.wizard.arrayName')}</label>
              <input type="text" value={wizard.arrayName} onChange={(e) => setWizard({ ...wizard, arrayName: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                placeholder="md0" className="w-full text-[0.75rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 font-mono" />
              <div className="text-[0.625rem] text-slate-400 mt-1">{t('apps.diskManager.pools.wizard.arrayPath', { name: wizard.arrayName || 'md0' })}</div>
            </div>

            {/* Capacity summary */}
            <div className="bg-blue-50/50 rounded-lg border border-blue-100 p-3">
              <div className="flex items-center gap-2 text-[0.6875rem] text-blue-700 mb-1"><Info className="w-3.5 h-3.5" />{t('apps.diskManager.pools.wizard.capacitySummary')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[0.75rem]">
                <div><span className="text-slate-500">{t('apps.diskManager.pools.wizard.raw')}: </span><span className="text-slate-700 font-medium">{formatBytes(cap.total)}</span></div>
                <div><span className="text-slate-500">{t('apps.diskManager.pools.wizard.usable')}: </span><span className="text-slate-700 font-medium">{formatBytes(cap.usable)}</span></div>
                <div><span className="text-slate-500">{t('apps.diskManager.pools.wizard.redundancy')}: </span><span className="text-slate-700">{formatBytes(cap.total - cap.usable)}</span></div>
                <div><span className="text-slate-500">{t('apps.diskManager.pools.wizard.faultTolerance')}: </span><span className={cap.faultTolerance.includes(t('apps.diskManager.pools.capacity.noFaultTolerance')) ? "text-red-500 font-medium" : "text-emerald-600 font-medium"}>{cap.faultTolerance}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Pool config */}
        {wizard.step === 3 && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[0.6875rem] text-slate-500 mb-2">{t('apps.diskManager.pools.wizard.storageArchitecture')}</div>
              <div className="flex items-center gap-2 text-[0.6875rem] flex-wrap">
                <span className="px-2 py-1 rounded bg-slate-200 text-slate-600">{t('apps.diskManager.pools.wizard.diskCount', { count: wizard.selectedDevices.length })}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">{raidLevels.find((l: ReturnType<typeof getRaidLevelsLocalized>[number]) => l.value === wizard.raidLevel)?.label} · {formatBytes(cap.usable)}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-purple-100 text-purple-700">{t('apps.diskManager.pools.wizard.lvmVolumeGroup')}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">{t('apps.diskManager.pools.wizard.logicalVolume')}</span>
              </div>
            </div>
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-1">{t('apps.diskManager.pools.wizard.volumeGroupName')}</label>
              <input type="text" value={wizard.poolName} onChange={(e) => setWizard({ ...wizard, poolName: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                placeholder="pool_data" className="w-full text-[0.75rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300" />
            </div>
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-1">{t('apps.diskManager.pools.wizard.logicalVolumeName')}</label>
              <input type="text" value={wizard.lvName} onChange={(e) => setWizard({ ...wizard, lvName: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                placeholder="lv_data" className="w-full text-[0.75rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300" />
              <div className="text-[0.625rem] text-slate-400 mt-1">{t('apps.diskManager.pools.wizard.logicalVolumePath', { poolName: wizard.poolName || 'pool_data', lvName: wizard.lvName || 'lv_data' })}</div>
            </div>
          </div>
        )}

        {/* Step 4: Filesystem */}
        {wizard.step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-1">{t('apps.diskManager.pools.wizard.filesystem')}</label>
              <div className="space-y-1.5">
                {fsOptions.map((fs) => {
                  const fsDesc: Record<string, string> = {
                    ext4: t('apps.diskManager.pools.wizard.filesystemDescriptions.ext4'),
                    xfs: t('apps.diskManager.pools.wizard.filesystemDescriptions.xfs'),
                    btrfs: t('apps.diskManager.pools.wizard.filesystemDescriptions.btrfs'),
                    zfs: t('apps.diskManager.pools.wizard.filesystemDescriptions.zfs'),
                    fat32: t('apps.diskManager.pools.wizard.filesystemDescriptions.fat32'),
                    exfat: t('apps.diskManager.pools.wizard.filesystemDescriptions.exfat'),
                    ntfs: t('apps.diskManager.pools.wizard.filesystemDescriptions.ntfs'),
                    apfs: t('apps.diskManager.pools.wizard.filesystemDescriptions.apfs'),
                    'hfs+': t('apps.diskManager.pools.wizard.filesystemDescriptions.hfsplus'),
                  }
                  return (
                    <label key={fs} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      wizard.fsType === fs ? "border-blue-300 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="fsType" value={fs} checked={wizard.fsType === fs}
                        onChange={() => setWizard({ ...wizard, fsType: fs })} className="text-blue-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.75rem] font-medium text-slate-700">{fs}</span>
                          {fs === defaultFs && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{t('apps.diskManager.pools.wizard.recommended')}</span>}
                        </div>
                        {fsDesc[fs] && <div className="text-[0.6875rem] text-slate-400">{fsDesc[fs]}</div>}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-[0.75rem] text-slate-500 block mb-1">{t('apps.diskManager.pools.wizard.mountPoint')}</label>
              <input type="text" value={wizard.mountPoint} onChange={(e) => setWizard({ ...wizard, mountPoint: e.target.value })}
                placeholder="/mnt/storage" className="w-full text-[0.75rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 font-mono" />
              <div className="text-[0.625rem] text-slate-400 mt-1">{t('apps.diskManager.pools.wizard.mountPointHint')}</div>
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {wizard.step === 5 && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700 text-[0.75rem] font-medium mb-1"><AlertTriangle className="w-4 h-4" /> {t('apps.diskManager.pools.wizard.dataLossWarningTitle')}</div>
              <p className="text-[0.6875rem] text-amber-600">{t('apps.diskManager.pools.wizard.dataLossWarningDescription')}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[0.6875rem] text-slate-500 mb-2">{t('apps.diskManager.pools.wizard.creationFlow')}</div>
              <div className="flex items-center gap-2 text-[0.6875rem] flex-wrap">
                <span className="px-2 py-1 rounded bg-slate-200 text-slate-600">{t('apps.diskManager.pools.wizard.diskCount', { count: wizard.selectedDevices.length })}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">{raidLevels.find((l: ReturnType<typeof getRaidLevelsLocalized>[number]) => l.value === wizard.raidLevel)?.label}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-purple-100 text-purple-700">LVM ({wizard.poolName})</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">{wizard.fsType}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 font-mono">{wizard.mountPoint}</span>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-[0.75rem]">
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.disks')}</span><span className="text-slate-700 font-mono">{wizard.selectedDevices.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.raid')}</span><span className="text-slate-700">{raidLevels.find((l: ReturnType<typeof getRaidLevelsLocalized>[number]) => l.value === wizard.raidLevel)?.label} · {cap.faultTolerance}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.raidDevice')}</span><span className="text-slate-700 font-mono">/dev/{wizard.arrayName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.volumeGroupAndLogicalVolume')}</span><span className="text-slate-700">{wizard.poolName} / {wizard.lvName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.filesystem')}</span><span className="text-slate-700">{wizard.fsType}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.mountPoint')}</span><span className="text-slate-700 font-mono">{wizard.mountPoint}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-500">{t('apps.diskManager.pools.wizard.summary.rawAndUsableCapacity')}</span>
                <span className="text-slate-700 font-medium">{formatBytes(cap.total)} / {formatBytes(cap.usable)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-5">
          {wizard.step > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setWizard({ ...wizard, step: (wizard.step - 1) as any })}>
              <ArrowLeft className="w-3.5 h-3.5" /> {t('apps.diskManager.pools.wizard.previous')}
            </Button>
          ) : <div />}
          {wizard.step < 5 ? (
            <Button size="sm" disabled={!canGoNext()} onClick={() => {
              if (wizard.step === 1) {
                setWizard({ ...wizard, step: 2, useRAID: true, raidLevel: suggestRAIDLevel(wizard.selectedDevices.length) })
              } else {
                setWizard({ ...wizard, step: (wizard.step + 1) as any })
              }
            }}>
              {t('apps.diskManager.pools.wizard.next')} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => {
              const cmd = buildCreatePoolWithRAIDCommands(wizard.selectedDevices, wizard.raidLevel, wizard.arrayName, wizard.poolName, wizard.lvName, wizard.fsType, wizard.mountPoint)
              useUIStore.getState().showConfirm({
                title: t('apps.diskManager.pools.create.title'),
                description: t('apps.diskManager.pools.create.description', {
                  count: wizard.selectedDevices.length,
                  level: raidLevels.find((l: ReturnType<typeof getRaidLevelsLocalized>[number]) => l.value === wizard.raidLevel)?.label,
                  poolName: wizard.poolName,
                }),
                variant: "destructive",
                onConfirm: () => { execCmd(cmd, t('apps.diskManager.pools.create.success')); setWizard(null) },
              })
            }}>
              {t('apps.diskManager.pools.create.button')}
            </Button>
          )}
        </div>
      </div>
    )
  }

// RAID levels that support online grow (adding disks to expand capacity)
const EXPANDABLE_RAID_LEVELS = new Set(["raid5", "raid6"])

function isRaidExpandable(level: string | null): boolean {
  if (!level) return false
  return EXPANDABLE_RAID_LEVELS.has(level.toLowerCase())
}

  const raidExpandHint = (level: string | null): string => {
    if (!level) return ""
    const l = level.toLowerCase()
    if (l === "raid0") return t('apps.diskManager.pools.expand.hints.raid0')
    if (l === "raid1") return t('apps.diskManager.pools.expand.hints.raid1')
    if (l === "raid10") return t('apps.diskManager.pools.expand.hints.raid10')
    return ""
  }

  // ==================== Add Disk to Pool ====================

  const openAddDisk = async (poolName: string) => {
    setAddDiskPool(poolName)
    setAddDiskSelected([])
    // Use cached RAID level from raidLevelMap
    const vg = volumeGroups.find((v) => v.name === poolName)
    const raidPV = (vg?.pvs || []).find((pv) => pv.device.match(/\/dev\/md\d+/))
    setAddDiskRaidLevel(raidPV ? (raidLevelMap[raidPV.device] || null) : null)
    // If not cached yet, query it
    if (raidPV && !raidLevelMap[raidPV.device]) {
      try {
        const { stdout } = await exec(`mdadm --detail ${raidPV.device} 2>/dev/null | grep "Raid Level" | awk '{print $NF}'`)
        if (stdout) setAddDiskRaidLevel(stdout.trim())
      } catch { /* ignore */ }
    }
  }

  const renderAddDisk = (poolName: string) => {
    if (addDiskPool !== poolName) return null
    const pool = pools.find((p) => p.name === poolName)
    const vg = volumeGroups.find((v) => v.name === poolName)
    const firstLv = pool?.volumes?.[0]
    const raidPV = (vg?.pvs || []).find((pv) => pv.device.match(/\/dev\/md\d+/))

    return (
      <div className="mt-3 p-3 bg-blue-50/50 rounded-lg border border-blue-200/60 space-y-3">
        <p className="text-[0.75rem] text-slate-600">{t('apps.diskManager.pools.expand.selectDisks', { poolName })}</p>

        {raidPV && firstLv && isRaidExpandable(addDiskRaidLevel) && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[0.6875rem]">
            <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-blue-700">
              {t('apps.diskManager.pools.expand.expandableArray', { device: raidPV.device, level: addDiskRaidLevel?.toUpperCase() })}
              <br />{t('apps.diskManager.pools.expand.expandableFlow', { fsType: firstLv.fsType || t('apps.diskManager.pools.expand.filesystemFallback') })}
            </div>
          </div>
        )}

        {raidPV && addDiskRaidLevel && !isRaidExpandable(addDiskRaidLevel) && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[0.6875rem]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-amber-700">
              {t('apps.diskManager.pools.expand.nonExpandableArray', { device: raidPV.device, level: addDiskRaidLevel?.toUpperCase() })}
              <br />{raidExpandHint(addDiskRaidLevel)}
              <br />{t('apps.diskManager.pools.expand.rebuildSuggestion')}
            </div>
          </div>
        )}

        {raidPV && addDiskRaidLevel === null && (
          <div className="text-[0.6875rem] text-slate-400 py-2">{t('apps.diskManager.pools.expand.detectingRaidLevel')}</div>
        )}

        {!raidPV && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[0.6875rem]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-amber-700">{t('apps.diskManager.pools.expand.noRaidDetected')}</div>
          </div>
        )}

        {raidPV && (
          <>
            {availableDisks.length === 0 ? (
              <p className="text-[0.75rem] text-slate-400">{t('apps.diskManager.pools.wizard.noAvailableDisks')}</p>
            ) : (
              <div className="space-y-2">
                {availableDisks.map((disk, i) => (
                  <label key={disk.device || `add-${i}`} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    addDiskSelected.includes(disk.device) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white/60 hover:bg-slate-50"
                  }`}>
                    <input type="checkbox" checked={addDiskSelected.includes(disk.device)}
                      onChange={() => setAddDiskSelected((prev) => prev.includes(disk.device) ? prev.filter((d) => d !== disk.device) : [...prev, disk.device])}
                      className="rounded" />
                    <div className="text-[0.75rem]">
                      <span className="text-slate-700 font-medium font-mono">{disk.device}</span>
                      <span className="text-slate-400 ml-2">{disk.model || t('apps.diskManager.advanced.common.unknownModel')} · {formatBytes(disk.size)}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAddDiskPool(null); setAddDiskSelected([]); setAddDiskRaidLevel(null) }}>{t('common.cancel')}</Button>
              <Button size="sm" disabled={addDiskSelected.length === 0 || !firstLv || !isRaidExpandable(addDiskRaidLevel)} onClick={() => {
                const raidDev = raidPV!.device
                const lvPath = firstLv!.path
                const fs = firstLv!.fsType || "ext4"
                const mp = firstLv!.mountPoint || ""
                const n = addDiskSelected.length

                // Build as a bash script — not && chain — so wait loops work correctly
                const lines: string[] = [
                  `set -e`,
                ]
                for (const dev of addDiskSelected) {
                  lines.push(`wipefs -a ${dev}`)
                  lines.push(`mdadm --add ${raidDev} ${dev}`)
                }
                // Small delay to let recovery register in /proc/mdstat
                lines.push(`sleep 2`)
                // Wait for any recovery/resync triggered by --add to finish
                lines.push(`echo "${t('apps.diskManager.pools.expand.waitRecovery')}"`)
                lines.push(`while grep -qE 'recovery|resync' /proc/mdstat 2>/dev/null; do sleep 5; done`)
                // Now grow
                lines.push(`CURRENT=$(mdadm --detail ${raidDev} | grep "Raid Devices" | awk '{print $NF}')`)
                lines.push(`NEW=$(( CURRENT + ${n} ))`)
                lines.push(`mdadm --grow ${raidDev} --raid-devices=$NEW`)
                // Wait for reshape
                lines.push(`sleep 2`)
                lines.push(`echo "${t('apps.diskManager.pools.expand.waitReshape')}"`)
                lines.push(`while grep -qE 'reshape|resync|recovery' /proc/mdstat 2>/dev/null; do sleep 5; done`)
                // Save config & expand LVM
                lines.push(`mdadm --detail --scan > /etc/mdadm/mdadm.conf 2>/dev/null || mdadm --detail --scan > /etc/mdadm.conf`)
                lines.push(`pvresize ${raidDev}`)
                lines.push(`lvextend -l +100%FREE ${lvPath}`)
                if (fs === "xfs") {
                  lines.push(`xfs_growfs ${lvPath}`)
                } else if (fs === "btrfs") {
                  lines.push(`btrfs filesystem resize max ${mp || lvPath}`)
                } else {
                  lines.push(`resize2fs ${lvPath}`)
                }

                const script = lines.join("\n")
                const cmd = `bash -c '${script.replace(/'/g, "'\\''")}'`

                useUIStore.getState().showConfirm({
                  title: t('apps.diskManager.pools.expand.title'),
                  description: t('apps.diskManager.pools.expand.description', { count: n, raidDev }),
                  variant: "destructive",
                  onConfirm: () => { execCmd(cmd, t('apps.diskManager.pools.expand.success')); setAddDiskPool(null); setAddDiskSelected([]); setAddDiskRaidLevel(null) },
                })
              }}>
                {t('apps.diskManager.pools.expand.button')}
              </Button>
            </div>
          </>
        )}

        {!raidPV && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => { setAddDiskPool(null); setAddDiskSelected([]); setAddDiskRaidLevel(null) }}>{t('apps.diskManager.pools.expand.close')}</Button>
          </div>
        )}
      </div>
    )
  }

  // ==================== Pool List ====================

  return (
    <div className="h-full flex flex-col gap-3 overflow-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.8125rem] font-semibold text-slate-700">{t('apps.diskManager.pools.title')}</h3>
        {!wizard && (
          <Button size="sm" onClick={startWizard} disabled={availableDisks.length === 0}>
            <Plus className="w-3.5 h-3.5" /> {t('apps.diskManager.pools.create.button')}
          </Button>
        )}
      </div>

      {wizard && renderWizard()}

      {pools.length === 0 && !wizard ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-[0.8125rem] text-slate-400">{t('apps.diskManager.pools.empty.title')}</p>
            <p className="text-[0.6875rem] text-slate-300 mt-1">{t('apps.diskManager.pools.empty.description')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => {
            const expanded = expandedPool === pool.name
            const usedPercent = pool.totalSize > 0 ? (pool.usedSpace / pool.totalSize) * 100 : 0
            const vg = volumeGroups.find((v) => v.name === pool.name)
            const raidPV = (vg?.pvs || []).find((pv) => pv.device.match(/\/dev\/md\d+/))
            const systemPool = isSystemVG(vg)

            return (
              <div key={pool.name} className={`rounded-xl border ${systemPool ? "bg-red-50/40 border-red-200/60" : "bg-white/60 border-slate-200/60"}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-xl"
                  onClick={() => setExpandedPool(expanded ? null : pool.name)}>
                  {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <Layers className={`w-4 h-4 ${systemPool ? "text-red-400" : "text-purple-500"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.8125rem] font-medium text-slate-700">{pool.name}</span>
                      {systemPool && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-1"><Lock className="w-2.5 h-2.5" />{t('apps.diskManager.pools.systemVolumeGroup')}</span>}
                      {raidPV && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{raidLevelMap[raidPV.device]?.toUpperCase() || "RAID"} · {raidPV.device}</span>}
                      <span className="text-[0.6875rem] text-slate-400">{t('apps.diskManager.pools.poolSummary', { pvCount: pool.pvCount, lvCount: pool.lvCount })}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`flex-1 h-1.5 rounded-full ${progressBg(usedPercent)}`}>
                        <div className={`h-full rounded-full transition-all ${progressColor(usedPercent)}`} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
                      </div>
                      <span className="text-[0.6875rem] text-slate-500 min-w-[5rem] text-right">
                        {formatBytes(pool.usedSpace)} / {formatBytes(pool.totalSize)}
                      </span>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    {systemPool && (
                      <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-[0.6875rem]">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-red-700">{t('apps.diskManager.pools.systemVolumeGroupWarning')}</div>
                      </div>
                    )}
                    {pool.volumes.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">{t('apps.diskManager.pools.logicalVolumes')}</h4>
                        <div className="space-y-1.5">
                          {pool.volumes.map((vol, i) => (
                            <div key={vol.path || `v-${i}`} className="flex items-center gap-3 text-[0.75rem] bg-slate-50/80 rounded-lg px-3 py-2">
                              <span className="text-slate-700 font-medium min-w-[6rem]">{vol.name}</span>
                              <span className="text-slate-400 font-mono text-[0.6875rem]">{vol.path}</span>
                              <span className="text-slate-400">{vol.fsType || "-"}</span>
                              <span className="text-slate-400 font-mono">{vol.mountPoint || "-"}</span>
                              <div className="flex-1" />
                              <span className="text-slate-600">{formatBytes(vol.size)}</span>
                              {vol.usePercent > 0 && (
                                <span className={`text-[0.6875rem] ${vol.usePercent >= 80 ? "text-red-600" : "text-slate-500"}`}>{formatPercent(vol.usePercent)}</span>
                              )}
                              <button className="text-slate-400 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                disabled={systemPool}
                                onClick={() => {
                                  if (systemPool) return
                                  const cmd = buildDeleteVolumeCommands(vol.path, vol.mountPoint)
                                  useUIStore.getState().showConfirm({
                                    title: t('apps.diskManager.advanced.lvm.deleteVolumeTitle'), variant: "destructive",
                                    description: vol.mountPoint
                                      ? t('apps.diskManager.advanced.lvm.deleteVolumeDescriptionWithMount', { name: vol.name, path: vol.path, mountPoint: vol.mountPoint })
                                      : t('apps.diskManager.advanced.lvm.deleteVolumeDescription', { name: vol.name, path: vol.path }),
                                    onConfirm: () => execCmd(cmd, t('apps.diskManager.advanced.lvm.deleteVolumeSuccess')),
                                  })
                                }}><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pool.memberDisks.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-[0.6875rem] font-medium text-slate-500 mb-2">{t('apps.diskManager.pools.memberDisks')}</h4>
                        <div className="space-y-1.5">
                          {pool.memberDisks.map((md, i) => (
                            <div key={md.device || `md-${i}`} className="flex items-center gap-3 text-[0.75rem] bg-slate-50/80 rounded-lg px-3 py-2">
                              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-700 font-mono">{md.device}</span>
                              <span className="text-slate-400">{md.model || t('apps.diskManager.advanced.common.unknownModel')}</span>
                              <div className="flex-1" />
                              <span className="text-slate-600">{formatBytes(md.size)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      {addDiskPool !== pool.name ? (
                        <>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openAddDisk(pool.name) }}
                            disabled={availableDisks.length === 0 || systemPool}>
                            <Plus className="w-3.5 h-3.5" /> {t('apps.diskManager.pools.addDisk')}
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" disabled={systemPool} onClick={(e) => {
                            if (systemPool) return
                            e.stopPropagation()
                            const lvs = (vg?.lvs || []).map((lv) => ({ path: lv.path, mountPoint: lv.mountPoint || undefined }))
                            const pvDevices = (vg?.pvs || []).map((pv) => pv.device) || []
                            const cmd = buildDeletePoolCommands(pool.name, lvs, pvDevices)
                            useUIStore.getState().showConfirm({
                              title: t('apps.diskManager.pools.delete.title'), variant: "destructive",
                              description: t('apps.diskManager.pools.delete.description', { poolName: pool.name }),
                              onConfirm: () => execCmd(cmd, t('apps.diskManager.pools.delete.success')),
                            })
                          }}>
                            <Trash2 className="w-3.5 h-3.5" /> {t('apps.diskManager.pools.delete.button')}
                          </Button>
                        </>
                      ) : renderAddDisk(pool.name)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
