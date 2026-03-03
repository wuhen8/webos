import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getFileType = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'plaintext'
  const typeMap: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    html: 'html', css: 'css', json: 'json', xml: 'xml', md: 'markdown',
    py: 'python', go: 'go', java: 'java', cpp: 'cpp', c: 'c', h: 'c',
    sql: 'sql', sh: 'shell', yaml: 'yaml', yml: 'yaml', txt: 'plaintext',
  }
  return typeMap[ext] || 'plaintext'
}
