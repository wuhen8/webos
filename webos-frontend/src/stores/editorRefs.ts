// Mutable refs shared between stores and components.
// These are NOT reactive Zustand state — they are plain mutable objects
// used for editor wrap state and drag state.

export const wrapStateRef: Record<string, boolean> = {}
export const dragTabRef: { current: { windowId: string; fromIndex: number } | null } = { current: null }
export const fmDragTabRef: { current: { windowId: string; fromIndex: number } | null } = { current: null }
export const terminalDragTabRef: { current: { windowId: string; fromIndex: number } | null } = { current: null }
