import { useState, useMemo } from "react"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import type { FileInfo } from "@/types"
import type { SortField, SortDirection } from "./types"

const SORT_STORAGE_KEY = "fm:sortPreference"

function loadSortPreference(): { field: SortField; direction: SortDirection } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.field && parsed.direction) return parsed
    }
  } catch {}
  return { field: "name", direction: "asc" }
}

function saveSortPreference(field: SortField, direction: SortDirection) {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field, direction }))
}

export function useFileSort(files: FileInfo[]) {
  const [sortField, setSortField] = useState<SortField>(() => loadSortPreference().field)
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => loadSortPreference().direction)

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => {
        const next = prev === "asc" ? "desc" : "asc"
        saveSortPreference(field, next)
        return next
      })
    } else {
      setSortField(field)
      setSortDirection("asc")
      saveSortPreference(field, "asc")
    }
  }

  const sortedFiles = useMemo(() => {
    if (!files || files.length === 0) return files
    return [...files].sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      let cmp = 0
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          break
        case "size":
          cmp = a.size - b.size
          break
        case "modifiedTime":
          cmp = new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime()
          break
        case "extension":
          cmp = (a.name.split(".").pop() ?? "").localeCompare(b.name.split(".").pop() ?? "", undefined, { sensitivity: "base" })
          break
      }
      return sortDirection === "asc" ? cmp : -cmp
    })
  }, [files, sortField, sortDirection])

  return { sortField, sortDirection, sortedFiles, handleSortClick }
}

export function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
  return sortDirection === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-slate-700" />
    : <ArrowDown className="h-3.5 w-3.5 text-slate-700" />
}
