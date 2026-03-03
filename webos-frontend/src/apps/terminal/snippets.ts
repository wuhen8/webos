import { create } from 'zustand'

const STORAGE_KEY = 'terminal-shell-snippets'

export interface ShellSnippet {
  id: string
  name: string
  command: string
}

// Simple version counter so toolbar re-reads snippets after edits
interface SnippetStore {
  version: number
  bump: () => void
}

export const useSnippetStore = create<SnippetStore>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}))

export function useSnippetVersion() {
  return useSnippetStore((s) => s.version)
}

export function loadSnippets(): ShellSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveSnippets(snippets: ShellSnippet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
  useSnippetStore.getState().bump()
}
