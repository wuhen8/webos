import { useState, useRef, useCallback } from "react"
import type { FileInfo, ClipboardState } from "@/types"
import { fsApi } from "@/lib/storageApi"
import { exec } from "@/lib/services"
import { useProcessStore } from "@/stores"
import { useWindowStore } from "@/stores/windowStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useTaskStore } from "@/stores/taskStore"
import { ErrorCodes, JsonRpcClientError } from "@/lib/jsonrpc"
import ShareDialogContent from "../ShareDialogContent"
import FileInfoContent from "../FileInfoContent"
import OpenWithDialogContent from "./OpenWithDialog"
import { ExtractPasswordDialog } from "./ExtractPasswordDialog"
import type { FileActionsContext } from "./types"

export function useFileActions(ctx: FileActionsContext) {
  const {
    files, filesRef, selectedFiles, setSelectedFiles, currentPath, activeNodeId,
    clipboard, setClipboard, loadFiles, navigateTo, toast, showConfirm,
    closeGlobalMenu, findOrCreateEditorWindow, fileInputRef, windowId,
  } = ctx

  const [inlineCreate, setInlineCreate] = useState<"file" | "folder" | null>(null)
  const [inlineName, setInlineName] = useState("")
  const inlineCreateInputRef = useRef<HTMLInputElement>(null)
  const [inlineRenamePath, setInlineRenamePath] = useState<string | null>(null)
  const [inlineRenameOldName, setInlineRenameOldName] = useState("")
  const [inlineRenameValue, setInlineRenameValue] = useState("")
  const inlineRenameInputRef = useRef<HTMLInputElement>(null)
  const renameTimerRef = useRef<number | null>(null)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordDialogFile, setPasswordDialogFile] = useState<FileInfo | null>(null)
  const [passwordError, setPasswordError] = useState(false)

  const startRename = useCallback((file: FileInfo) => {
    setInlineRenamePath(file.path)
    setInlineRenameOldName(file.name)
    setInlineRenameValue(file.name)
  }, [])

  const commitInlineCreate = async () => {
    const name = inlineName.trim()
    if (!inlineCreate) return
    if (!name) { setInlineCreate(null); setInlineName(""); return }
    try {
      if (inlineCreate === "folder") await fsApi.mkdir(activeNodeId, currentPath, name)
      else await fsApi.createFile(activeNodeId, currentPath, name)
      await loadFiles()
      toast({ title: "成功", description: inlineCreate === "folder" ? "文件夹创建成功" : "文件创建成功" })
    } catch {
      toast({ title: "错误", description: "创建失败", variant: "destructive" })
    } finally { setInlineCreate(null); setInlineName("") }
  }

  const commitInlineRename = async () => {
    if (!inlineRenamePath) return
    const newName = inlineRenameValue.trim()
    if (!newName || newName === inlineRenameOldName) {
      setInlineRenamePath(null); setInlineRenameOldName(""); setInlineRenameValue("")
      return
    }
    const lastSlash = inlineRenamePath.lastIndexOf("/")
    let parentPath = lastSlash > 0 ? inlineRenamePath.substring(0, lastSlash) : "/"
    // Preserve Windows drive root: "C:" → "C:/"
    if (/^[A-Za-z]:$/.test(parentPath)) parentPath += "/"
    try {
      await fsApi.rename(activeNodeId, parentPath, inlineRenameOldName, newName)
      await loadFiles()
      toast({ title: "成功", description: "重命名成功" })
    } catch {
      toast({ title: "错误", description: "重命名失败", variant: "destructive" })
    } finally { setInlineRenamePath(null); setInlineRenameOldName(""); setInlineRenameValue("") }
  }

  const isExtractable = (file: FileInfo) => {
    if (file.isDir) return false
    const ext = (file.extension || '').toLowerCase()
    return ['.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.rar', '.7z'].includes(ext)
  }

  const isIsoFile = (file: FileInfo) => {
    if (file.isDir) return false
    return (file.extension || '').toLowerCase() === '.iso'
  }

  const handleMountIso = async (file: FileInfo) => {
    const mountName = file.name.replace(/\.iso$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    const mountPoint = `/mnt/iso_${mountName}`
    try {
      const resp = await exec(`mkdir -p "${mountPoint}" && mount -o loop,ro "${file.path}" "${mountPoint}"`)
      if (resp.exitCode !== 0) {
        toast({ title: "挂载失败", description: resp.stderr || "无法挂载 ISO", variant: "destructive" }); return
      }
      const processStore = useProcessStore.getState()
      const tab = { id: `fmtab-${Date.now()}`, currentPath: mountPoint, history: [mountPoint], historyIndex: 0, files: [], selectedFiles: [], activeNodeId, title: file.name }
      const pid = processStore.spawnProcess('fileManager', { fmTabs: [tab], activeFmTabIndex: 0 })
      const state = useWindowStore.getState()
      const id = `fm-iso-${Date.now()}`
      const newZIndex = state.nextZIndex + 1
      const newWindow = {
        id, type: 'fileManager', pid, title: file.name,
        isMinimized: false, isMaximized: false, isActive: true, zIndex: newZIndex,
        position: { x: 150 + Math.round(Math.random() * 60), y: 100 + Math.round(Math.random() * 60) },
        size: { width: 900, height: 600 },
      }
      processStore.addWindowToProcess(pid, id)
      useWindowStore.setState({ nextZIndex: newZIndex, windows: [...state.windows.map(w => ({ ...w, isActive: false })), newWindow] })
      toast({ title: "已挂载", description: `${file.name} 已挂载到 ${mountPoint}` })
    } catch { toast({ title: "错误", description: "挂载 ISO 失败", variant: "destructive" }) }
  }

  const handleFileDoubleClick = (file: FileInfo) => {
    if (renameTimerRef.current) { window.clearTimeout(renameTimerRef.current); renameTimerRef.current = null }
    if (inlineRenamePath) { setInlineRenamePath(null); setInlineRenameOldName(""); setInlineRenameValue("") }
    if (file.isDir) { navigateTo(file.path); setSelectedFiles(new Set()) }
    else if (isIsoFile(file)) handleMountIso(file)
    else if (isExtractable(file)) handleExtract(file)
    else findOrCreateEditorWindow(file).then(res => {
      if (!res.ok && res.message) toast({ title: "无法打开", description: res.message, variant: "destructive" })
    })
  }

  const handleFileClick = (file: FileInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      const newSelected = new Set(selectedFiles)
      if (newSelected.has(file.path)) newSelected.delete(file.path)
      else newSelected.add(file.path)
      setSelectedFiles(newSelected)
      return
    }
    const isAlreadySelected = selectedFiles.has(file.path)
    setSelectedFiles(new Set([file.path]))
    if (isAlreadySelected) {
      if (renameTimerRef.current) window.clearTimeout(renameTimerRef.current)
      renameTimerRef.current = window.setTimeout(() => {
        startRename(file)
        renameTimerRef.current = null
      }, 300)
    } else {
      if (renameTimerRef.current) { window.clearTimeout(renameTimerRef.current); renameTimerRef.current = null }
    }
  }

  const handleUpload = async (file: File) => {
    if (!file) return
    if (fsApi.isChunkedUpload(file)) {
      try { await fsApi.uploadChunked(activeNodeId, currentPath, file); loadFiles() } catch {}
      return
    }
    const taskId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const upsertTask = useTaskStore.getState().upsertTask
    const makeTask = (overrides: Partial<import('@/stores/taskStore').BackgroundTask>) => ({
      id: taskId, type: 'upload', title: `上传 ${file.name}`,
      status: 'running' as const, message: '', createdAt: Date.now(),
      progress: 0, bytesCurrent: 0, bytesTotal: file.size, ...overrides,
    })
    upsertTask(makeTask({}))
    try {
      const onProgress = (loaded: number, total: number) => {
        upsertTask(makeTask({ progress: total > 0 ? loaded / total : 0, bytesCurrent: loaded, bytesTotal: total }))
      }
      const uploadPath = currentPath.endsWith('/') ? currentPath + file.name : currentPath + '/' + file.name
      let directUploaded = false
      try {
        const presignUrl = await fsApi.presign(activeNodeId, uploadPath, 'PUT')
        if (presignUrl) {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', presignUrl)
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total) }
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
            xhr.onerror = () => reject(new Error('Network error'))
            xhr.send(file)
          })
          directUploaded = true
        }
      } catch {}
      if (!directUploaded) await fsApi.upload(activeNodeId, currentPath, file, onProgress)
      upsertTask(makeTask({ status: 'success', progress: 1, bytesCurrent: file.size, doneAt: Date.now() }))
      loadFiles()
    } catch {
      upsertTask(makeTask({ status: 'failed', message: '上传失败', doneAt: Date.now() }))
    }
  }

  const handleDelete = async (filesToDelete: FileInfo[]) => {
    try {
      await fsApi.delete(activeNodeId, filesToDelete.map(f => f.path))
      setSelectedFiles(new Set())
      toast({ title: "删除任务已提交", description: `正在移动 ${filesToDelete.length} 个项目到回收站` })
    } catch (e: any) {
      toast({ title: "删除失败", description: e?.message || "删除出错", variant: "destructive" })
    }
  }

  const handleExtract = async (file: FileInfo, password?: string) => {
    // Reset error state but keep dialog open if retrying with password
    setPasswordError(false)

    // 如果没有提供密码，先检测是否需要密码
    if (!password) {
      try {
        const result = await fsApi.checkPassword(activeNodeId, file.path)
        if (result.needsPassword) {
          setPasswordDialogFile(file)
          setPasswordDialogOpen(true)
          return
        }
      } catch (e: any) {
        // 检测失败，继续尝试解压
        console.warn('Failed to check password:', e)
      }
    }

    try {
      await fsApi.extract(activeNodeId, file.path, currentPath, password)
      // Success — close password dialog if open
      setPasswordDialogOpen(false)
      setPasswordDialogFile(null)
      toast({ title: "解压任务已提交", description: `${file.name} 正在后台解压` })
    } catch (e: any) {
      const isRpcErr = e instanceof JsonRpcClientError
      const code = isRpcErr ? e.code : undefined

      if (code === ErrorCodes.PASSWORD_REQUIRED) {
        // Needs password, open dialog
        setPasswordDialogFile(file)
        setPasswordDialogOpen(true)
      } else if (code === ErrorCodes.PASSWORD_INCORRECT) {
        // Wrong password — shake + clear, keep dialog open
        setPasswordDialogFile(file)
        setPasswordDialogOpen(true)
        setPasswordError(true)
      } else {
        setPasswordDialogOpen(false)
        setPasswordDialogFile(null)
        toast({ title: "解压失败", description: e?.message || "解压出错", variant: "destructive" })
      }
    }
  }

  const handleCompress = async (filesToCompress: FileInfo[]) => {
    if (filesToCompress.length === 0) return
    try {
      let archiveName = filesToCompress.length === 1
        ? filesToCompress[0].name.replace(/\.[^/.]+$/, '') + '.zip'
        : 'archive.zip'
      const existingNames = new Set(files.map(f => f.name))
      if (existingNames.has(archiveName)) {
        const base = archiveName.replace(/\.zip$/, '')
        let counter = 1
        while (existingNames.has(`${base} (${counter}).zip`)) counter++
        archiveName = `${base} (${counter}).zip`
      }
      const outputPath = currentPath === '/' ? '/' + archiveName : currentPath + '/' + archiveName

      await fsApi.compress(activeNodeId, filesToCompress.map(f => f.path), outputPath)
      toast({ title: "压缩任务已提交", description: `正在后台压缩为 ${archiveName}` })
    } catch (e: any) {
      toast({ title: "压缩失败", description: e?.message || "压缩出错", variant: "destructive" })
    }
  }

  const confirmDelete = (filesToDelete: FileInfo[]) => {
    handleDelete(filesToDelete)
  }

  const handleCopy = () => {
    const sel = files.filter(f => selectedFiles.has(f.path))
    setClipboard({ files: sel, action: "copy", sourceNodeId: activeNodeId })
    toast({ title: "已复制", description: `复制 ${sel.length} 个文件` })
  }

  const handleCut = () => {
    const sel = files.filter(f => selectedFiles.has(f.path))
    setClipboard({ files: sel, action: "move", sourceNodeId: activeNodeId })
    toast({ title: "已剪切", description: `剪切 ${sel.length} 个文件` })
  }

  const handlePaste = async () => {
    if (!clipboard) return
    const { files: clipFiles, action, sourceNodeId } = clipboard
    const paths = clipFiles.map(f => f.path)

    try {
      if (action === "copy") {
        await fsApi.copy(sourceNodeId, paths, currentPath, activeNodeId)
        toast({ title: "复制任务已提交", description: `正在后台复制 ${clipFiles.length} 个项目` })
      } else {
        await fsApi.move(sourceNodeId, paths, currentPath, activeNodeId)
        toast({ title: "移动任务已提交", description: `正在后台移动 ${clipFiles.length} 个项目` })
      }
      setClipboard(null)
      setSelectedFiles(new Set())
    } catch (e: any) {
      toast({ title: "操作失败", description: e?.message || "操作出错", variant: "destructive" })
    }
  }

  const resolveDownloadUrl = async (file: FileInfo): Promise<string> => {
    try {
      const url = await fsApi.presign(activeNodeId, file.path, 'GET')
      if (url) return url
    } catch {}
    return await fsApi.downloadUrl(activeNodeId, file.path)
  }

  const handleDownload = async (file: FileInfo) => {
    if (file.isDir) { toast({ title: "提示", description: "文件夹暂不支持下载", variant: "destructive" }); return }
    try {
      const url = await resolveDownloadUrl(file)
      const link = document.createElement('a')
      link.href = url; link.download = file.name; link.target = '_blank'; link.rel = 'noopener noreferrer'
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
      toast({ title: "开始下载", description: `正在下载 ${file.name}` })
    } catch { toast({ title: "错误", description: "下载失败", variant: "destructive" }) }
  }

  const handleShare = (file: FileInfo) => {
    if (file.isDir) { toast({ title: "提示", description: "文件夹暂不支持分享", variant: "destructive" }); return }
    useWindowStore.getState().openChildWindow({
      type: 'shareDialog',
      title: `分享 - ${file.name}`,
      component: (ctx: any) => <ShareDialogContent windowId={ctx.win.id} />,
      size: { width: 420, height: 330 },
      initialState: { nodeId: activeNodeId, path: file.path, fileName: file.name },
      appId: 'fileManager',
      parentId: windowId,
    })
  }

  const handleInfo = (file: FileInfo) => {
    useWindowStore.getState().openChildWindow({
      type: 'fileInfoDialog',
      title: `详细信息 - ${file.name}`,
      component: (ctx: any) => <FileInfoContent windowId={ctx.win.id} />,
      size: { width: 380, height: 340 },
      initialState: { nodeId: activeNodeId, path: file.path, fileName: file.name, isDir: file.isDir, extension: file.extension },
      appId: 'fileManager',
      parentId: windowId,
    })
  }

  const handleContextMenuAction = (action: string) => {
    closeGlobalMenu()
    const targetFile = filesRef.current.find(f => selectedFiles.has(f.path)) || null
    const selectedFileObjects = filesRef.current.filter(f => selectedFiles.has(f.path))

    switch (action) {
      case 'fm.open': if (targetFile) handleFileDoubleClick(targetFile); break
      case 'fm.openWith.editor':
        if (targetFile && !targetFile.isDir) {
          findOrCreateEditorWindow(targetFile, { forceEditor: true }).then(res => {
            if (!res.ok && res.message) toast({ title: "无法打开", description: res.message, variant: "destructive" })
          })
        }
        break
      case 'fm.download': if (targetFile) handleDownload(targetFile); break
      case 'fm.share': if (targetFile) handleShare(targetFile); break
      case 'fm.info': if (targetFile) handleInfo(targetFile); break
      case 'fm.extract': if (targetFile) handleExtract(targetFile); break
      case 'fm.compress':
        if (selectedFileObjects.length > 0) handleCompress(selectedFileObjects)
        else if (targetFile) handleCompress([targetFile])
        break
      case 'fm.copy': handleCopy(); break
      case 'fm.cut': handleCut(); break
      case 'fm.rename': if (targetFile) startRename(targetFile); break
      case 'fm.delete':
        if (selectedFileObjects.length > 0) confirmDelete(selectedFileObjects)
        else if (targetFile) confirmDelete([targetFile])
        break
      case 'fm.newFile': setInlineCreate("file"); setInlineName(""); break
      case 'fm.newFolder': setInlineCreate("folder"); setInlineName(""); break
      case 'fm.upload': fileInputRef.current?.click(); break
      case 'fm.offlineDownload': break // handled by parent
      case 'fm.refresh': loadFiles(); break
      case 'fm.paste': handlePaste(); break
      case 'fm.openWithDialog':
        if (targetFile && !targetFile.isDir) {
          useWindowStore.getState().openChildWindow({
            type: 'openWithDialog',
            title: `打开方式 - ${targetFile.name}`,
            component: (ctx: any) => <OpenWithDialogContent windowId={ctx.win.id} />,
            size: { width: 400, height: 380 },
            initialState: { ext: targetFile.extension.toLowerCase(), fileName: targetFile.name, path: targetFile.path },
            appId: 'fileManager',
            parentId: windowId,
          })
        }
        break
      default:
        if (action.startsWith('fm.openWith.')) {
          const appId = action.replace('fm.openWith.', '')
          if (targetFile && !targetFile.isDir) {
            findOrCreateEditorWindow(targetFile, { forceApp: appId }).then(res => {
              if (!res.ok && res.message) toast({ title: "无法打开", description: res.message, variant: "destructive" })
            })
          }
        } else if (action.startsWith('fm.setDefaultApp.')) {
          const appId = action.replace('fm.setDefaultApp.', '')
          if (targetFile) {
            const ext = targetFile.extension.toLowerCase()
            useSettingsStore.getState().setFileDefaultApp(ext, appId)
            toast({ title: "已设置", description: `${ext} 文件将默认使用此应用打开` })
          }
        }
        break
    }
  }

  return {
    // inline create
    inlineCreate, setInlineCreate, inlineName, setInlineName, inlineCreateInputRef, commitInlineCreate,
    // inline rename
    inlineRenamePath, setInlineRenamePath, inlineRenameValue, setInlineRenameValue,
    inlineRenameOldName, inlineRenameInputRef, commitInlineRename, startRename,
    // file operations
    handleFileClick, handleFileDoubleClick, handleUpload,
    handleCopy, handleCut, handlePaste, handleDelete, confirmDelete,
    handleExtract, handleCompress, handleDownload, handleShare,
    handleContextMenuAction,
    // password dialog
    passwordDialogOpen, setPasswordDialogOpen, passwordDialogFile, passwordError,
  }
}
