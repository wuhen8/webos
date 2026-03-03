import { useMemo } from 'react'
import { getApiBase } from '@/lib/env'

interface WebviewContentProps {
  src: string
  reloadKey: number
  /** If true, bypass the proxy and load the URL directly in the iframe */
  direct?: boolean
}

/**
 * Determines whether a URL is an external http(s) URL that should go through
 * the server-side proxy to avoid CSP / X-Frame-Options blocking.
 */
function shouldProxy(url: string): boolean {
  if (!url) return false
  // Only proxy http/https URLs
  if (!/^https?:\/\//i.test(url)) return false
  try {
    const u = new URL(url)
    // Don't proxy URLs pointing at our own backend (same origin)
    if (u.hostname === window.location.hostname) return false
    // Don't proxy S3 presigned URLs (they contain X-Amz-Signature or similar)
    if (u.searchParams.has('X-Amz-Signature') || u.searchParams.has('X-Amz-Credential')) return false
    // Don't proxy blob/data URLs
    if (u.protocol === 'blob:' || u.protocol === 'data:') return false
  } catch {
    return false
  }
  return true
}

function buildProxiedUrl(url: string): string {
  return `${getApiBase()}/proxy?url=${encodeURIComponent(url)}`
}

export default function WebviewContent({ src, reloadKey, direct }: WebviewContentProps) {
  const finalSrc = useMemo(() => {
    if (direct || !shouldProxy(src)) return src
    return buildProxiedUrl(src)
  }, [src, direct, reloadKey])

  return (
    <iframe
      key={reloadKey}
      src={finalSrc}
      className="w-full h-full border-none"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      allow="clipboard-read; clipboard-write"
    />
  )
}
