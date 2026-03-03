import { useEffect, useRef, useState } from 'react'
import { createSDK, type StaticAppSDK } from '@/lib/staticAppSDK'
import { loadAppCSS, unloadAppCSS } from './cssLoader'

// Module cache — same appId only imports once
const moduleCache = new Map<string, Promise<any>>()

// Manifest cache — fetched once per appId
const manifestCache = new Map<string, Promise<{ styles?: string[] }>>()

function loadModule(appId: string): Promise<any> {
  let cached = moduleCache.get(appId)
  if (!cached) {
    cached = import(/* @vite-ignore */ `/webapps/${appId}/main.js`)
    moduleCache.set(appId, cached)
  }
  return cached
}

function fetchManifest(appId: string): Promise<{ styles?: string[] }> {
  let cached = manifestCache.get(appId)
  if (!cached) {
    cached = fetch(`/webapps/${appId}/manifest.json`)
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}))
    manifestCache.set(appId, cached)
  }
  return cached
}

interface StaticAppHostProps {
  appId: string
  windowId: string
  file?: {
    name: string
    path: string
    nodeId?: string
    size?: number
    extension?: string
  }
}

export default function StaticAppHost({ appId, windowId, file }: StaticAppHostProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const mountEl = mountRef.current
    if (!mountEl || mountedRef.current) return

    let unmountFn: (() => void) | null = null
    let cancelled = false

    async function init() {
      try {
        // Fetch manifest and load declared CSS before importing JS
        const manifest = await fetchManifest(appId)
        if (cancelled) return

        if (manifest.styles?.length) {
          await loadAppCSS(appId, manifest.styles)
        }
        if (cancelled) {
          unloadAppCSS(appId)
          return
        }

        const mod = await loadModule(appId)
        if (cancelled) {
          unloadAppCSS(appId)
          return
        }

        const sdk: StaticAppSDK = createSDK(windowId, appId)

        const ctx = {
          container: mountEl!,
          sdk,
          windowId,
          file: file || null,
        }

        const result = mod.mount(ctx)
        if (result && typeof result.then === 'function') {
          await result
        }
        if (cancelled) return

        mountedRef.current = true
        unmountFn = () => {
          try {
            mod.unmount?.(ctx)
          } catch {
            // ignore unmount errors
          }
        }

        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load app')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (unmountFn) unmountFn()
      unloadAppCSS(appId)
      mountedRef.current = false
      if (mountEl) {
        mountEl.innerHTML = ''
      }
    }
  }, [appId, windowId, file])

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-500 text-sm">
        加载失败: {error}
      </div>
    )
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600" />
        </div>
      )}
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{ visibility: loading ? 'hidden' : 'visible' }}
      />
    </div>
  )
}
