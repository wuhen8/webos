import { useWindowStore } from '@/stores/windowStore'
import { useProcessStore } from '@/stores/processStore'

/**
 * Combines the common useWindowStore + useProcessStore lookup into a single hook.
 * Returns { win, process, procState } or nullish values if not found.
 */
export function useCurrentProcess(windowId: string) {
  const win = useWindowStore(s => s.windows.find(w => w.id === windowId))
  const process = useProcessStore(s => win ? s.processes.find(p => p.pid === win.pid) : undefined)
  const procState = (process?.state || {}) as Record<string, any>
  return { win, process, procState }
}
