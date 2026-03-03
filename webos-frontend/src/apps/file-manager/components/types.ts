import type { FileInfo, ClipboardState } from "@/types"

export type SortField = "name" | "size" | "modifiedTime" | "extension"
export type SortDirection = "asc" | "desc"

export interface FileManagerTabState {
  id: string
  currentPath: string
  history: string[]
  historyIndex: number
  selectedFiles: string[]
  activeNodeId: string
  title: string
}

export interface FileActionsContext {
  files: FileInfo[]
  filesRef: React.MutableRefObject<FileInfo[]>
  selectedFiles: Set<string>
  setSelectedFiles: (sel: Set<string>) => void
  currentPath: string
  activeNodeId: string
  clipboard: ClipboardState | null
  setClipboard: (cb: ClipboardState | null) => void
  loadFiles: () => Promise<void>
  navigateTo: (path: string) => void
  toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"]
  showConfirm: ReturnType<typeof import("@/stores").useUIStore.getState>["showConfirm"]
  closeGlobalMenu: () => void
  findOrCreateEditorWindow: ReturnType<typeof import("@/apps/editor/store").useEditorStore.getState>["findOrCreateEditorWindow"]
  fileInputRef: React.RefObject<HTMLInputElement>
}
