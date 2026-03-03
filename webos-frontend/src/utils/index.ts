import {
  File,
  Folder,
  FileText,
  FileCode,
  FileJson,
  FileIcon,
  FileVideo,
  FileAudio,
  Archive,
  Image as ImageIcon,
  FileSpreadsheet,
  Presentation,
  Disc,
  FileSymlink,
  FolderSymlink,
  ListVideo,
  ListMusic,
} from "lucide-react"
import type { FileInfo } from "@/types"

// 格式化文件大小
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

// 格式化修改时间
export const formatModifiedTime = (timeStr: string): string => {
  if (!timeStr) return "-"
  try {
    const date = new Date(timeStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  } catch {
    return "-"
  }
}

// 获取文件类型（用于编辑器语法高亮）
export const getFileType = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "plaintext"
  const typeMap: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    html: "html", css: "css", json: "json", xml: "xml", md: "markdown",
    py: "python", go: "go", java: "java", cpp: "cpp", c: "c", h: "c",
    sql: "sql", sh: "shell", yaml: "yaml", yml: "yaml", txt: "plaintext",
  }
  return typeMap[ext] || "plaintext"
}

// 文件图标映射
export const getFileIconConfig = (file: FileInfo) => {
  // 符号链接使用专用图标
  if (file.isSymlink) {
    if (file.isDir) {
      return { icon: FolderSymlink, className: "h-5 w-5 text-blue-400" }
    }
    return { icon: FileSymlink, className: "h-5 w-5 text-slate-400" }
  }
  if (file.isDir) {
    return { icon: Folder, className: "h-5 w-5 text-blue-500" }
  }
  const ext = file.extension.toLowerCase()
  const iconMap: Record<string, { icon: any; className: string }> = {
    ".txt": { icon: FileText, className: "h-5 w-5 text-slate-500" },
    ".md": { icon: FileText, className: "h-5 w-5 text-slate-500" },
    ".js": { icon: FileCode, className: "h-5 w-5 text-amber-500" },
    ".jsx": { icon: FileCode, className: "h-5 w-5 text-amber-500" },
    ".ts": { icon: FileCode, className: "h-5 w-5 text-blue-500" },
    ".tsx": { icon: FileCode, className: "h-5 w-5 text-blue-500" },
    ".html": { icon: FileCode, className: "h-5 w-5 text-orange-500" },
    ".css": { icon: FileCode, className: "h-5 w-5 text-blue-400" },
    ".json": { icon: FileJson, className: "h-5 w-5 text-amber-600" },
    ".py": { icon: FileCode, className: "h-5 w-5 text-emerald-500" },
    ".go": { icon: FileCode, className: "h-5 w-5 text-cyan-500" },
    ".java": { icon: FileCode, className: "h-5 w-5 text-red-500" },
    ".cpp": { icon: FileCode, className: "h-5 w-5 text-blue-600" },
    ".c": { icon: FileCode, className: "h-5 w-5 text-blue-600" },
    ".h": { icon: FileCode, className: "h-5 w-5 text-purple-500" },
    ".jpg": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".jpeg": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".png": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".gif": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".svg": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".webp": { icon: ImageIcon, className: "h-5 w-5 text-purple-500" },
    ".pdf": { icon: FileText, className: "h-5 w-5 text-red-600" },
    ".doc": { icon: FileText, className: "h-5 w-5 text-blue-600" },
    ".docx": { icon: FileText, className: "h-5 w-5 text-blue-600" },
    ".xls": { icon: FileSpreadsheet, className: "h-5 w-5 text-green-600" },
    ".xlsx": { icon: FileSpreadsheet, className: "h-5 w-5 text-green-600" },
    ".csv": { icon: FileSpreadsheet, className: "h-5 w-5 text-green-600" },
    ".ppt": { icon: Presentation, className: "h-5 w-5 text-orange-600" },
    ".pptx": { icon: Presentation, className: "h-5 w-5 text-orange-600" },
    ".iso": { icon: Disc, className: "h-5 w-5 text-slate-500" },
    ".zip": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".rar": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".tar": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".gz": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".xz": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".7z": { icon: Archive, className: "h-5 w-5 text-amber-600" },
    ".sh": { icon: FileCode, className: "h-5 w-5 text-green-600" },
    ".bash": { icon: FileCode, className: "h-5 w-5 text-green-600" },
    ".zsh": { icon: FileCode, className: "h-5 w-5 text-green-600" },
    ".yaml": { icon: FileCode, className: "h-5 w-5 text-orange-400" },
    ".yml": { icon: FileCode, className: "h-5 w-5 text-orange-400" },
    ".mp4": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".avi": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".mov": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".wmv": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".flv": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".webm": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".mkv": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".m4v": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".3gp": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".ogv": { icon: FileVideo, className: "h-5 w-5 text-rose-500" },
    ".mp3": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".wav": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".ogg": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".flac": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".aac": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".m4a": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".wma": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".opus": { icon: FileAudio, className: "h-5 w-5 text-pink-500" },
    ".vlist": { icon: ListVideo, className: "h-5 w-5 text-rose-400" },
    ".alist": { icon: ListMusic, className: "h-5 w-5 text-pink-400" },
    ".m3u": { icon: ListVideo, className: "h-5 w-5 text-rose-400" },
  }
  return iconMap[ext] || { icon: FileIcon, className: "h-5 w-5 text-slate-400" }
}

// 常量
export const API_BASE = "/api"
export const LS_SETTINGS_KEY = "fm_settings"

// 图片扩展名列表
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico']

/**
 * Copy text to clipboard with fallback for non-HTTPS environments.
 * Uses navigator.clipboard when available, falls back to execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy method
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}
