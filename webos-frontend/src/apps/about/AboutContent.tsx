import { useState, useEffect } from "react"
import { Monitor } from "lucide-react"
import { request as wsRequest } from '@/stores/webSocketStore'

function AboutContent() {
  const [version, setVersion] = useState("...")

  useEffect(() => {
    wsRequest('system.check_update', {})
      .then((info: any) => setVersion(info.currentVersion || '未知'))
      .catch(() => setVersion('未知'))
  }, [])

  return (
    <div className="flex items-center justify-center h-full bg-white/15 backdrop-blur-2xl">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-slate-800">
          <Monitor className="h-6 w-6" />
          <span className="text-sm font-medium">WebOS</span>
        </div>
        <div className="text-xs text-slate-700">版本 {version}</div>
      </div>
    </div>
  )
}

export default AboutContent
