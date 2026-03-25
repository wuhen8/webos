import { useState, useCallback, useEffect } from "react"
import { useTranslation } from 'react-i18next'
import yaml from "js-yaml"
import FmEdit from "@/components/FmEdit"
import { useSettingsStore } from "@/stores"
import { X, Plus, ChevronDown, ChevronRight, Save, Play, FileText, Code2 } from "lucide-react"
import { type ServiceConfig, newService, parseYamlToForm, buildDocFromForm } from "./components/composeUtils"
import { ServiceForm } from "./components/ServiceForm"

interface ComposeCreatorProps {
  onClose: () => void
  onSubmit: (projectDir: string, yamlContent: string, autoUp: boolean) => Promise<void>
  editMode?: boolean
  initialProjectDir?: string
  initialYaml?: string
}

export default function ComposeCreator({ onClose, onSubmit, editMode, initialProjectDir, initialYaml }: ComposeCreatorProps) {
  const { t } = useTranslation()
  const parsed = initialYaml ? parseYamlToForm(initialYaml) : null
  const dataDir = useSettingsStore((s) => s.dataDir)
  const composeBaseDir = dataDir ? dataDir + '/compose' : ''
  const defaultName = (!editMode && parsed) ? (parsed.services[0]?.name || "") : ""
  const [viewMode, setViewMode] = useState<"form" | "yaml">("form")
  const [projectName, setProjectName] = useState(defaultName)
  const [projectDir, setProjectDir] = useState(initialProjectDir || (defaultName ? composeBaseDir.replace(/\/+$/, "") + "/" + defaultName : ""))
  const [services, setServices] = useState<ServiceConfig[]>(() => {
    if (parsed?.services) return parsed.services
    const svc = newService("web")
    svc.networks = ["webos-network"]
    return [svc]
  })
  const [globalNetworks, setGlobalNetworks] = useState(parsed?.globalNetworks || (editMode ? "" : "webos-network"))
  const [globalVolumes, setGlobalVolumes] = useState(parsed?.globalVolumes || "")
  const [showAdvanced, setShowAdvanced] = useState(!!(parsed?.globalNetworks || parsed?.globalVolumes) || !editMode)
  const [yamlContent, setYamlContent] = useState(initialYaml || "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [fullDoc, setFullDoc] = useState<Record<string, any>>(() => {
    if (initialYaml) { try { return yaml.load(initialYaml) as Record<string, any> || {} } catch { return {} } }
    return {}
  })

  useEffect(() => {
    if (editMode) return
    if (projectName.trim()) setProjectDir(composeBaseDir.replace(/\/+$/, "") + "/" + projectName.trim())
    else setProjectDir("")
  }, [projectName, composeBaseDir, editMode])

  const formToDoc = useCallback(
    () => buildDocFromForm(services, globalNetworks, globalVolumes, fullDoc),
    [services, globalNetworks, globalVolumes, fullDoc],
  )

  const switchToYaml = useCallback(() => {
    const doc = formToDoc()
    setFullDoc(doc)
    setYamlContent(yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false }))
    setViewMode("yaml")
  }, [formToDoc])

  const switchToForm = useCallback(() => {
    if (yamlContent.trim()) {
      const result = parseYamlToForm(yamlContent)
      setFullDoc(result.fullDoc)
      setServices(result.services)
      setGlobalNetworks(result.globalNetworks)
      setGlobalVolumes(result.globalVolumes)
      setShowAdvanced(!!(result.globalNetworks || result.globalVolumes))
    }
    setViewMode("form")
  }, [yamlContent])

  const getFinalYaml = (): string => {
    if (viewMode === "yaml") return yamlContent
    return yaml.dump(formToDoc(), { lineWidth: 120, noRefs: true, sortKeys: false })
  }

  const updateService = (idx: number, patch: Partial<ServiceConfig>) => {
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const removeService = (idx: number) => {
    setServices((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (autoUp: boolean) => {
    if (!projectDir.trim()) { setError(t('apps.docker.creator.errors.projectDirRequired')); return }
    const finalYaml = getFinalYaml()
    if (!finalYaml.trim()) { setError(t('apps.docker.creator.errors.yamlRequired')); return }
    setSubmitting(true); setError("")
    try {
      if (autoUp) { onSubmit(projectDir.trim(), finalYaml, true); onClose(); return }
      await onSubmit(projectDir.trim(), finalYaml, false)
      onClose()
    } catch (err: any) { setError(err?.message || t('apps.docker.creator.errors.createFailed')) }
    finally { setSubmitting(false) }
  }

  const inputClass = "w-full px-2.5 py-1.5 text-[0.75rem] bg-white/70 border border-slate-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-300"
  const labelClass = "text-[0.6875rem] font-medium text-slate-600 mb-1 block"
  const btnPrimary = "flex items-center gap-1.5 px-3 py-1.5 text-[0.75rem] font-medium rounded-lg transition-colors"
  const serviceNames = services.map((s) => s.name).filter(Boolean)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[92%] h-[90%] bg-gradient-to-b from-slate-50 to-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white/80">
          <div className="flex items-center gap-3">
            <span className="text-[0.8125rem] font-semibold text-slate-800">
              {editMode ? t('apps.docker.creator.title.edit') : t('apps.docker.creator.title.create')}
            </span>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button onClick={viewMode === "yaml" ? switchToForm : undefined}
                className={`flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors ${viewMode === "form" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <FileText className="w-3 h-3" /> {t('apps.docker.creator.view.form')}
              </button>
              <button onClick={viewMode === "form" ? switchToYaml : undefined}
                className={`flex items-center gap-1 px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors ${viewMode === "yaml" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Code2 className="w-3 h-3" /> YAML
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 text-[0.6875rem] text-red-600 bg-red-50 border border-red-100 rounded-lg">{error}</div>
        )}

        {/* Visual Form */}
        {viewMode === "form" && (
          <div className="flex-1 overflow-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('apps.docker.creator.projectName')}</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={t('apps.docker.creator.projectNamePlaceholder')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('apps.docker.creator.projectDir')} <span className="text-red-400">*</span></label>
                <input type="text" value={projectDir} onChange={(e) => setProjectDir(e.target.value)}
                  placeholder={`${composeBaseDir}/my-project`} readOnly={editMode}
                  className={`${inputClass}${editMode ? " bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.75rem] font-semibold text-slate-700">{t('apps.docker.creator.services')}</span>
                <button onClick={() => setServices((prev) => [...prev, { ...newService(""), networks: ["webos-network"] }])}
                  className="flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors">
                  <Plus className="w-3 h-3" /> {t('apps.docker.creator.addService')}
                </button>
              </div>
              <div className="space-y-3">
                {services.map((svc, sIdx) => (
                  <ServiceForm key={sIdx} svc={svc} sIdx={sIdx} serviceCount={services.length}
                    serviceNames={serviceNames} updateService={updateService} removeService={removeService} />
                ))}
              </div>
            </div>

            <div>
              <button onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-500 hover:text-slate-700 transition-colors">
                {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {t('apps.docker.creator.advanced')}
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className={labelClass}>{t('apps.docker.creator.globalNetworks')}</label>
                    <input type="text" value={globalNetworks} onChange={(e) => setGlobalNetworks(e.target.value)} placeholder={t('apps.docker.creator.globalNetworksPlaceholder')} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('apps.docker.creator.globalVolumes')}</label>
                    <input type="text" value={globalVolumes} onChange={(e) => setGlobalVolumes(e.target.value)} placeholder={t('apps.docker.creator.globalVolumesPlaceholder')} className={inputClass} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* YAML Editor */}
        {viewMode === "yaml" && (
          <div className="flex-1 overflow-hidden flex flex-col px-5 py-4">
            <div className="text-[0.6875rem] text-slate-500 mb-2">{t('apps.docker.creator.yamlHint')}</div>
            <div className="flex-1 rounded-lg overflow-hidden border border-slate-200">
              <FmEdit value={yamlContent} onChange={(value) => setYamlContent(value || "")} language="yaml" theme="vs-dark" fontSize={13} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white/80">
          <button onClick={onClose} className={`${btnPrimary} text-slate-600 bg-slate-100 hover:bg-slate-200`}>{t('apps.docker.creator.actions.cancel')}</button>
          <div className="flex items-center gap-2">
            <button onClick={() => handleSubmit(false)} disabled={submitting} className={`${btnPrimary} text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50`}>
              <Save className="w-3.5 h-3.5" /> {t('apps.docker.creator.actions.saveOnly')}
            </button>
            <button onClick={() => handleSubmit(true)} disabled={submitting} className={`${btnPrimary} text-white bg-green-500 hover:bg-green-600 disabled:opacity-50`}>
              <Play className="w-3.5 h-3.5" /> {t('apps.docker.creator.actions.saveAndStart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
