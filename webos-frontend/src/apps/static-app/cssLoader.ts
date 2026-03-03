// Reference-counted CSS loader for static apps.
// Same appId across multiple windows only loads CSS once.
// When all windows close, CSS is disabled (not removed) for instant re-enable.

interface CSSEntry {
  links: HTMLLinkElement[]
  refCount: number
}

const cssRegistry = new Map<string, CSSEntry>()

/**
 * Load CSS files for a static app. Resolves when all <link> elements have loaded.
 * If already loaded/disabled for this appId, just bumps the reference count and re-enables.
 */
export function loadAppCSS(appId: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return Promise.resolve()

  const existing = cssRegistry.get(appId)
  if (existing) {
    existing.refCount++
    // Re-enable if previously disabled
    for (const link of existing.links) {
      link.disabled = false
    }
    return Promise.resolve()
  }

  const links: HTMLLinkElement[] = []
  const promises: Promise<void>[] = []

  for (const path of paths) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `/webapps/${appId}/${path}`
    link.setAttribute('data-static-app', appId)

    const p = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve()
      link.onerror = () => reject(new Error(`Failed to load CSS: ${path}`))
    })

    document.head.appendChild(link)
    links.push(link)
    promises.push(p)
  }

  cssRegistry.set(appId, { links, refCount: 1 })

  return Promise.all(promises).then(() => {})
}

/**
 * Decrement reference count for an app's CSS.
 * Disables <link> elements when no more windows reference them (keeps in DOM for fast re-enable).
 */
export function unloadAppCSS(appId: string): void {
  const entry = cssRegistry.get(appId)
  if (!entry) return

  entry.refCount--
  if (entry.refCount <= 0) {
    entry.refCount = 0
    for (const link of entry.links) {
      link.disabled = true
    }
  }
}
