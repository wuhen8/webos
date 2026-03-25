import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { getAppsForExtension, getDefaultAppForExtension } from '@/config/fileAssociationRegistry'
import { appRegistry, getDynamicApps } from '@/config/appRegistry'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWindowStore } from '@/stores/windowStore'
import { useCurrentProcess } from '@/hooks/useCurrentProcess'
import { useToast } from '@/hooks/use-toast'
import { useEditorStore } from '@/apps/editor/store'
import * as Icons from 'lucide-react'

export default function OpenWithDialogContent({ windowId }: { windowId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { procState } = useCurrentProcess(windowId)
  const findOrCreateEditorWindow = useEditorStore((s) => s.findOrCreateEditorWindow)
  const file = procState as { ext: string; fileName: string; path: string }
  const ext = (file.ext || '') as string

  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [setAsDefault, setSetAsDefault] = useState(false)

  const appIds = getAppsForExtension(ext)
  const currentDefault = getDefaultAppForExtension(ext)
  const allApps = { ...getDynamicApps(), ...appRegistry }

  const handleOpen = () => {
    if (!selectedApp) return

    if (setAsDefault) {
      useSettingsStore.getState().setFileDefaultApp(ext, selectedApp)
      toast({ title: t('apps.fileManager.openWith.defaultSet'), description: t('apps.fileManager.openWith.defaultSetDescription', { ext }) })
    }

    findOrCreateEditorWindow(
      { name: file.fileName, path: file.path, extension: ext, isDir: false, size: 0, modifiedTime: '' } as any,
      { forceApp: selectedApp },
    ).then(res => {
      if (!res.ok && res.message) toast({ title: t('apps.fileManager.openWith.openFailed'), description: res.message, variant: "destructive" })
    })

    useWindowStore.getState().closeWindow(windowId, true)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="text-sm text-slate-500">{t('apps.fileManager.openWith.title', { name: file.fileName })}</div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        {appIds.map(appId => {
          const config = allApps[appId]
          if (!config) return null

          const assoc = config.fileAssociations?.[0]
          const IconComponent = assoc?.icon ? (Icons as any)[assoc.icon] : (Icons as any)[config.icon || 'FileCode']
          const isDefault = appId === currentDefault

          return (
            <div
              key={appId}
              onClick={() => setSelectedApp(appId)}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                selectedApp === appId
                  ? 'bg-purple-50 border-2 border-purple-500'
                  : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
              }`}
            >
              {IconComponent && <IconComponent className="h-8 w-8 text-purple-600 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{assoc?.label || config.name}</div>
                {isDefault && <div className="text-xs text-slate-500">{t('apps.fileManager.openWith.currentDefault')}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center space-x-2 pt-2 border-t">
        <input
          type="checkbox"
          id="set-default"
          checked={setAsDefault}
          onChange={(e) => setSetAsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-purple-600"
        />
        <label htmlFor="set-default" className="text-sm cursor-pointer">
          {t('apps.fileManager.openWith.alwaysUse', { ext })}
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => useWindowStore.getState().closeWindow(windowId, true)}>{t('apps.fileManager.openWith.cancel')}</Button>
        <Button size="sm" onClick={handleOpen} disabled={!selectedApp}>{t('apps.fileManager.openWith.open')}</Button>
      </div>
    </div>
  )
}
