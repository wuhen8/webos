import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from 'react-i18next'
import { RefreshCw, Save, Loader2, Check, FileText, Code2 } from "lucide-react"
import { exec, fsService } from "@/lib/services"
import { SettingsIcon } from "./SettingsIcon"
import FmEdit from "@/components/FmEdit"

type SharingProtocol = 'smb' | 'webdav' | 'ftp' | 'nfs' | 'dlna'

const NODE_ID = 'local_1'

const sharingServiceMap: Record<SharingProtocol, string> = {
  smb: "smbd", webdav: "webdav", ftp: "vsftpd", nfs: "nfs-server", dlna: "minidlna",
}
const sharingLabels: Record<SharingProtocol, string> = {
  smb: "SMB / Samba", webdav: "WebDAV", ftp: "FTP", nfs: "NFS", dlna: "DLNA",
}
const sharingDescs: Record<SharingProtocol, string> = {
  smb: 'apps.settings.sharing.protocols.smb.desc',
  webdav: 'apps.settings.sharing.protocols.webdav.desc',
  ftp: 'apps.settings.sharing.protocols.ftp.desc',
  nfs: 'apps.settings.sharing.protocols.nfs.desc',
  dlna: 'apps.settings.sharing.protocols.dlna.desc',
}
const configPaths: Record<SharingProtocol, string> = {
  smb: "/etc/samba/smb.conf", webdav: "/etc/webdav/config.yml", ftp: "/etc/vsftpd.conf", nfs: "/etc/exports", dlna: "/etc/minidlna.conf",
}
const configLanguages: Record<SharingProtocol, string> = {
  smb: 'ini', webdav: 'yaml', ftp: 'ini', nfs: 'plaintext', dlna: 'ini',
}

// ---- Config parsers & appliers ----

function parseSmbConf(raw: string) {
  const get = (key: string, def: string) => {
    const m = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)`, 'mi'))
    return m ? m[1].trim() : def
  }
  const shareBlock = raw.match(/\[share\][^[]*/s)?.[0] || ''
  const sharePath = shareBlock.match(/path\s*=\s*(.+)/m)?.[1]?.trim() || "/srv/samba/share"
  const allowGuest = /guest\s+ok\s*=\s*yes/i.test(shareBlock)
  return { workgroup: get("workgroup", "WORKGROUP"), serverString: get("server string", "WebOS SMB"), sharePath, allowGuest }
}
function applySmbConf(raw: string, cfg: ReturnType<typeof parseSmbConf>) {
  let out = raw
  const setGlobal = (key: string, val: string) => {
    const re = new RegExp(`^(\\s*${key}\\s*=\\s*)(.+)`, 'mi')
    if (re.test(out)) out = out.replace(re, `$1${val}`)
  }
  setGlobal('workgroup', cfg.workgroup)
  setGlobal('server string', cfg.serverString)
  out = out.replace(/(\[share\][^[]*?path\s*=\s*)(.+)/ms, `$1${cfg.sharePath}`)
  out = out.replace(/(\[share\][^[]*?guest\s+ok\s*=\s*)(\w+)/mis, `$1${cfg.allowGuest ? 'yes' : 'no'}`)
  return out
}
const defaultSmbConf = `[global]
   workgroup = WORKGROUP
   server string = WebOS SMB
   security = user
   map to guest = Bad User
   log file = /var/log/samba/%m.log
   max log size = 50

[share]
   path = /srv/samba/share
   browseable = yes
   writable = yes
   guest ok = no
   create mask = 0664
   directory mask = 0775
`

function parseFtpConf(raw: string) {
  const get = (key: string, def: string) => { const m = raw.match(new RegExp(`^${key}=(.+)`, 'm')); return m ? m[1].trim() : def }
  const getBool = (key: string, def: boolean) => { const m = raw.match(new RegExp(`^${key}=(YES|NO)`, 'mi')); return m ? m[1].toUpperCase() === 'YES' : def }
  return { port: get("listen_port", "21"), sharePath: get("local_root", "/srv/ftp"), anonymousEnable: getBool("anonymous_enable", false), passiveMinPort: get("pasv_min_port", "30000"), passiveMaxPort: get("pasv_max_port", "31000") }
}
function applyFtpConf(raw: string, cfg: ReturnType<typeof parseFtpConf>) {
  let out = raw
  const set = (key: string, val: string) => { const re = new RegExp(`^(${key}=)(.+)`, 'm'); if (re.test(out)) out = out.replace(re, `$1${val}`) }
  set('listen_port', cfg.port); set('local_root', cfg.sharePath); set('anonymous_enable', cfg.anonymousEnable ? 'YES' : 'NO')
  set('pasv_min_port', cfg.passiveMinPort); set('pasv_max_port', cfg.passiveMaxPort)
  return out
}
const defaultFtpConf = `listen=YES\nlisten_ipv6=NO\nanonymous_enable=NO\nlocal_enable=YES\nwrite_enable=YES\nlocal_root=/srv/ftp\nlisten_port=21\npasv_enable=YES\npasv_min_port=30000\npasv_max_port=31000\n`

function parseNfsExports(raw: string) {
  const line = raw.split('\n').find(l => l.trim() && !l.startsWith('#')) || ''
  const m = line.match(/^(\S+)\s+(\S+)\((.+)\)/)
  return { exportPath: m?.[1] || "/srv/nfs", allowedHosts: m?.[2] || "192.168.0.0/16", options: m?.[3] || "rw,sync,no_subtree_check" }
}
function applyNfsExports(raw: string, cfg: ReturnType<typeof parseNfsExports>) {
  const lines = raw.split('\n'); const idx = lines.findIndex(l => l.trim() && !l.startsWith('#'))
  const newLine = `${cfg.exportPath} ${cfg.allowedHosts}(${cfg.options})`
  if (idx >= 0) lines[idx] = newLine; else lines.push(newLine)
  return lines.join('\n')
}
const defaultNfsExports = `/srv/nfs 192.168.0.0/16(rw,sync,no_subtree_check)\n`

function parseDlnaConf(raw: string) {
  const get = (key: string, def: string) => { const m = raw.match(new RegExp(`^${key}=(.+)`, 'm')); return m ? m[1].trim() : def }
  return { mediaDir: get("media_dir", "/srv/media"), friendlyName: get("friendly_name", "WebOS DLNA"), inotify: get("inotify", "yes") === "yes" }
}
function applyDlnaConf(raw: string, cfg: ReturnType<typeof parseDlnaConf>) {
  let out = raw
  const set = (key: string, val: string) => { const re = new RegExp(`^(${key}=)(.+)`, 'm'); if (re.test(out)) out = out.replace(re, `$1${val}`) }
  set('media_dir', cfg.mediaDir); set('friendly_name', cfg.friendlyName); set('inotify', cfg.inotify ? 'yes' : 'no')
  return out
}
const defaultDlnaConf = `media_dir=/srv/media\nfriendly_name=WebOS DLNA\ninotify=yes\ndb_dir=/var/cache/minidlna\nlog_dir=/var/log/minidlna\n`

function parseWebdavConf(raw: string) {
  const get = (key: string, def: string) => { const m = raw.match(new RegExp(`^\\s*${key}:\\s*(.+)`, 'm')); return m ? m[1].trim() : def }
  return { port: get("port", "8088"), sharePath: get("dir", "/srv/webdav"), authRequired: get("auth", "true") === "true" }
}
function applyWebdavConf(raw: string, cfg: ReturnType<typeof parseWebdavConf>) {
  let out = raw
  const set = (key: string, val: string) => { const re = new RegExp(`^(\\s*${key}:\\s*)(.+)`, 'm'); if (re.test(out)) out = out.replace(re, `$1${val}`) }
  set('port', cfg.port); set('dir', cfg.sharePath); set('auth', String(cfg.authRequired))
  return out
}
const defaultWebdavConf = `port: 8088\ndir: /srv/webdav\nauth: true\nmodify: true\n`

// ---- Type & registry ----
type SharingConfig = {
  smb: ReturnType<typeof parseSmbConf>; webdav: ReturnType<typeof parseWebdavConf>
  ftp: ReturnType<typeof parseFtpConf>; nfs: ReturnType<typeof parseNfsExports>; dlna: ReturnType<typeof parseDlnaConf>
}
const defaultFormConfig: SharingConfig = {
  smb: { workgroup: "WORKGROUP", sharePath: "/srv/samba/share", allowGuest: false, serverString: "WebOS SMB" },
  webdav: { port: "8088", sharePath: "/srv/webdav", authRequired: true },
  ftp: { port: "21", sharePath: "/srv/ftp", anonymousEnable: false, passiveMinPort: "30000", passiveMaxPort: "31000" },
  nfs: { exportPath: "/srv/nfs", allowedHosts: "192.168.0.0/16", options: "rw,sync,no_subtree_check" },
  dlna: { mediaDir: "/srv/media", friendlyName: "WebOS DLNA", inotify: true },
}
const defaultRawConfigs: Record<SharingProtocol, string> = {
  smb: defaultSmbConf, webdav: defaultWebdavConf, ftp: defaultFtpConf, nfs: defaultNfsExports, dlna: defaultDlnaConf,
}
const parsers: Record<SharingProtocol, (raw: string) => any> = {
  smb: parseSmbConf, webdav: parseWebdavConf, ftp: parseFtpConf, nfs: parseNfsExports, dlna: parseDlnaConf,
}
const appliers: Record<SharingProtocol, (raw: string, cfg: any) => string> = {
  smb: applySmbConf, webdav: applyWebdavConf, ftp: applyFtpConf, nfs: applyNfsExports, dlna: applyDlnaConf,
}

// ---- Component ----
export default function SharingTab() {
  const { t } = useTranslation()
  const [activeProto, setActiveProto] = useState<SharingProtocol>('smb')
  const [viewMode, setViewMode] = useState<'form' | 'raw'>('form')
  const [sharingLoading, setSharingLoading] = useState<Record<string, boolean>>({})
  const [sharingStatus, setSharingStatus] = useState<Record<string, boolean>>({
    smb: false, webdav: false, ftp: false, nfs: false, dlna: false,
  })
  const [formConfig, setFormConfig] = useState<SharingConfig>(defaultFormConfig)
  const [rawConfigs, setRawConfigs] = useState<Record<SharingProtocol, string>>({ ...defaultRawConfigs })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [configLoaded, setConfigLoaded] = useState<Record<string, boolean>>({})
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  const loadSharingStatus = useCallback(async () => {
    const status: Record<string, boolean> = {}
    for (const [proto, service] of Object.entries(sharingServiceMap)) {
      try {
        const res = await exec(`systemctl is-active ${service} 2>/dev/null`)
        status[proto] = res.stdout.trim() === "active"
      } catch { status[proto] = false }
    }
    setSharingStatus(status)
  }, [])

  const loadConfig = useCallback(async (proto: SharingProtocol) => {
    try {
      const { content } = await fsService.read(NODE_ID, configPaths[proto])
      setRawConfigs(r => ({ ...r, [proto]: content }))
      setFormConfig(c => ({ ...c, [proto]: parsers[proto](content) }))
    } catch { /* file doesn't exist, keep defaults */ }
    setConfigLoaded(l => ({ ...l, [proto]: true }))
  }, [])

  const saveConfig = useCallback(async () => {
    setSaving(true)
    try {
      let content: string
      if (viewMode === 'raw') { content = rawConfigs[activeProto] }
      else {
        content = appliers[activeProto](rawConfigs[activeProto], formConfig[activeProto])
        setRawConfigs(r => ({ ...r, [activeProto]: content }))
      }
      await fsService.write(NODE_ID, configPaths[activeProto], content)
      if (sharingStatus[activeProto]) await exec(`systemctl restart ${sharingServiceMap[activeProto]}`)
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }, [viewMode, rawConfigs, activeProto, formConfig, sharingStatus])

  const switchToRaw = useCallback(() => {
    const updated = appliers[activeProto](rawConfigs[activeProto], formConfig[activeProto])
    setRawConfigs(r => ({ ...r, [activeProto]: updated }))
    setViewMode('raw')
  }, [activeProto, rawConfigs, formConfig])

  const switchToForm = useCallback(() => {
    setFormConfig(c => ({ ...c, [activeProto]: parsers[activeProto](rawConfigs[activeProto]) }))
    setViewMode('form')
  }, [activeProto, rawConfigs])

  const toggleService = async (proto: SharingProtocol) => {
    const service = sharingServiceMap[proto]
    const isActive = sharingStatus[proto]
    setSharingLoading(l => ({ ...l, [proto]: true }))
    try {
      if (isActive) await exec(`systemctl stop ${service} && systemctl disable ${service}`)
      else await exec(`systemctl enable ${service} && systemctl start ${service}`)
      setSharingStatus(s => ({ ...s, [proto]: !isActive }))
    } catch {}
    setSharingLoading(l => ({ ...l, [proto]: false }))
  }

  useEffect(() => { loadSharingStatus() }, [loadSharingStatus])
  useEffect(() => { if (!configLoaded[activeProto]) loadConfig(activeProto) }, [activeProto, configLoaded, loadConfig])

  const inputClass = "w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100% - 1rem)' }}>
      {/* Header */}
      <div className="flex flex-col items-center mb-5 pt-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg mb-2">
          <SettingsIcon type="sharing" className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{t('apps.settings.sharing.title')}</h1>
      </div>

      {/* Main card */}
      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {/* Protocol tabs */}
        <div className="flex bg-[#ebebed] m-3 mb-0 rounded-lg p-0.5 shrink-0">
          {(Object.keys(sharingLabels) as SharingProtocol[]).map((proto) => (
            <button key={proto} onClick={() => setActiveProto(proto)}
              className={`flex-1 py-1.5 text-[0.6875rem] font-medium rounded-md transition-all ${
                activeProto === proto ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {proto.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Service status bar + actions */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-200/60 shrink-0">
          <div className="flex items-center gap-3">
            {/* Service toggle */}
            <button
              onClick={() => toggleService(activeProto)}
              disabled={sharingLoading[activeProto]}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                sharingLoading[activeProto] ? 'opacity-50 cursor-not-allowed' : ''
              } ${sharingStatus[activeProto] ? "bg-green-500" : "bg-gray-300"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                sharingStatus[activeProto] ? "translate-x-[1.125rem]" : "translate-x-0.5"
              }`} />
            </button>
            <div>
              <span className="text-[0.8125rem] text-gray-900 font-medium">{sharingLabels[activeProto]}</span>
              <span className="text-[0.6875rem] text-gray-400 ml-2">{t(sharingDescs[activeProto])}</span>
            </div>
            {sharingStatus[activeProto] && (
              <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">{t('apps.settings.sharing.running')}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={loadSharingStatus} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {/* View toggle */}
            <div className="flex items-center bg-[#ebebed] rounded-md p-0.5">
              <button onClick={viewMode === 'raw' ? switchToForm : undefined}
                className={`flex items-center gap-1 px-2 py-1 text-[0.625rem] font-medium rounded transition-colors ${
                  viewMode === 'form' ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                <FileText className="w-3 h-3" /> {t('apps.settings.firewall.viewMode.form')}
              </button>
              <button onClick={viewMode === 'form' ? switchToRaw : undefined}
                className={`flex items-center gap-1 px-2 py-1 text-[0.625rem] font-medium rounded transition-colors ${
                  viewMode === 'raw' ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                <Code2 className="w-3 h-3" /> {t('apps.settings.firewall.viewMode.edit')}
              </button>
            </div>
            {/* Save */}
            <button onClick={saveConfig} disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.6875rem] font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {saving ? t('apps.settings.sharing.saving') : saved ? t('apps.settings.sharing.saved') : t('apps.settings.sharing.save')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto">
          {viewMode === 'raw' ? (
            <div className="h-full">
              <FmEdit
                value={rawConfigs[activeProto]}
                onChange={(v) => setRawConfigs(r => ({ ...r, [activeProto]: v || '' }))}
                language={configLanguages[activeProto]}
                theme="vs-dark" fontSize={13}
              />
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {activeProto === 'smb' && (<>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.smb.workgroup')}</label>
                  <input value={formConfig.smb.workgroup} onChange={e => setFormConfig(c => ({ ...c, smb: { ...c.smb, workgroup: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.smb.serviceDescription')}</label>
                  <input value={formConfig.smb.serverString} onChange={e => setFormConfig(c => ({ ...c, smb: { ...c.smb, serverString: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.smb.sharePath')}</label>
                  <input value={formConfig.smb.sharePath} onChange={e => setFormConfig(c => ({ ...c, smb: { ...c.smb, sharePath: e.target.value } }))} className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formConfig.smb.allowGuest} onChange={e => setFormConfig(c => ({ ...c, smb: { ...c.smb, allowGuest: e.target.checked } }))} className="rounded" />
                  <label className="text-[0.8125rem] text-gray-600">{t('apps.settings.firewall.smb.allowGuest')}</label>
                </div>
              </>)}

              {activeProto === 'webdav' && (<>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.webdav.listenPort')}</label>
                  <input value={formConfig.webdav.port} onChange={e => setFormConfig(c => ({ ...c, webdav: { ...c.webdav, port: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.webdav.sharePath')}</label>
                  <input value={formConfig.webdav.sharePath} onChange={e => setFormConfig(c => ({ ...c, webdav: { ...c.webdav, sharePath: e.target.value } }))} className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formConfig.webdav.authRequired} onChange={e => setFormConfig(c => ({ ...c, webdav: { ...c.webdav, authRequired: e.target.checked } }))} className="rounded" />
                  <label className="text-[0.8125rem] text-gray-600">{t('apps.settings.firewall.webdav.authRequired')}</label>
                </div>
              </>)}

              {activeProto === 'ftp' && (<>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.ftp.listenPort')}</label>
                  <input value={formConfig.ftp.port} onChange={e => setFormConfig(c => ({ ...c, ftp: { ...c.ftp, port: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.ftp.sharePath')}</label>
                  <input value={formConfig.ftp.sharePath} onChange={e => setFormConfig(c => ({ ...c, ftp: { ...c.ftp, sharePath: e.target.value } }))} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.ftp.passiveMinPort')}</label>
                    <input value={formConfig.ftp.passiveMinPort} onChange={e => setFormConfig(c => ({ ...c, ftp: { ...c.ftp, passiveMinPort: e.target.value } }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.ftp.passiveMaxPort')}</label>
                    <input value={formConfig.ftp.passiveMaxPort} onChange={e => setFormConfig(c => ({ ...c, ftp: { ...c.ftp, passiveMaxPort: e.target.value } }))} className={inputClass} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formConfig.ftp.anonymousEnable} onChange={e => setFormConfig(c => ({ ...c, ftp: { ...c.ftp, anonymousEnable: e.target.checked } }))} className="rounded" />
                  <label className="text-[0.8125rem] text-gray-600">{t('apps.settings.firewall.ftp.allowAnonymous')}</label>
                </div>
              </>)}

              {activeProto === 'nfs' && (<>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.nfs.exportPath')}</label>
                  <input value={formConfig.nfs.exportPath} onChange={e => setFormConfig(c => ({ ...c, nfs: { ...c.nfs, exportPath: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.nfs.allowedHosts')}</label>
                  <input value={formConfig.nfs.allowedHosts} onChange={e => setFormConfig(c => ({ ...c, nfs: { ...c.nfs, allowedHosts: e.target.value } }))} placeholder={t('apps.settings.firewall.nfs.allowedHostsPlaceholder')} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.nfs.exportOptions')}</label>
                  <input value={formConfig.nfs.options} onChange={e => setFormConfig(c => ({ ...c, nfs: { ...c.nfs, options: e.target.value } }))} className={inputClass} />
                </div>
              </>)}

              {activeProto === 'dlna' && (<>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.dlna.deviceName')}</label>
                  <input value={formConfig.dlna.friendlyName} onChange={e => setFormConfig(c => ({ ...c, dlna: { ...c.dlna, friendlyName: e.target.value } }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">{t('apps.settings.firewall.dlna.mediaDirectory')}</label>
                  <input value={formConfig.dlna.mediaDir} onChange={e => setFormConfig(c => ({ ...c, dlna: { ...c.dlna, mediaDir: e.target.value } }))} className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formConfig.dlna.inotify} onChange={e => setFormConfig(c => ({ ...c, dlna: { ...c.dlna, inotify: e.target.checked } }))} className="rounded" />
                  <label className="text-[0.8125rem] text-gray-600">{t('apps.settings.firewall.dlna.autoWatch')}</label>
                </div>
              </>)}

              <p className="text-[0.6875rem] text-gray-400 pt-2">
                {t('apps.settings.firewall.viewMode.formHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
