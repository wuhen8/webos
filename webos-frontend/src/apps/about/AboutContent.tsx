import { useState, useEffect } from "react"
import { Monitor, Github } from "lucide-react"
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
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-slate-800">
          <Monitor className="h-6 w-6" />
          <span className="text-sm font-medium">WebOS</span>
        </div>
        <div className="text-xs text-slate-700">版本 {version}</div>
        <a
          href="https://github.com/wuhen8/webos"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 hover:underline transition-colors"
        >
          <Github className="h-3.5 w-3.5" />
          <span>GitHub</span>
        </a>
      </div>
    </div>
  )
}

export default AboutContent
