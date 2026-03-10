import { useState, useRef, useCallback } from "react"
import type { FileInfo, ClipboardState } from "@/types"
import { fsApi } from "@/lib/storageApi"
import { request as wsRequest } from "@/stores/webSocketStore"
import { useProcessStore } from "@/stores"
import { useWindowStore } from "@/stores/windowStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useTaskStore } from "@/stores/taskStore"
import { useProgressDialogStore } from "@/stores/progressDialogStore"
import { registerMessageHandler } from "@/stores/webSocketStore"
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
      const resp = await wsRequest('exec', { command: `mkdir -p "${mountPoint}" && mount -o loop,ro "${file.path}" "${mountPoint}"` })
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
    const progressDialog = useProgressDialogStore.getState()
    const reqId = `delete-${Date.now()}`

    const title = filesToDelete.length === 1
      ? `移到回收站 ${filesToDelete[0].name}`
      : `移到回收站 ${filesToDelete.length} 个项目`

    progressDialog.show({
      title,
      cancellable: true,
      onCancel: () => progressDialog.close(),
    })

    const unsubscribe = registerMessageHandler((msg) => {
      if (msg.method === 'fs.delete.progress' && msg.params?.reqId === reqId) {
        const progress = msg.params.progress
        const message = msg.params.message
        progressDialog.update({
          progress: progress >= 0 ? progress : undefined,
          message: message || '',
        })
        return true
      }
      return false
    })

    try {
      await fsApi.delete(activeNodeId, filesToDelete.map(f => f.path), reqId)
      progressDialog.close()
      setSelectedFiles(new Set())
      toast({ title: "已移到回收站", description: `${filesToDelete.length} 个项目已移到回收站` })
      loadFiles()
    } catch (e: any) {
      progressDialog.close()
      toast({ title: "删除失败", description: e?.message || "删除出错", variant: "destructive" })
    } finally {
      unsubscribe()
    }
  }

  const handleExtract = async (file: FileInfo, password?: string) => {
    // 立即关闭密码对话框，避免重复弹出
    setPasswordDialogOpen(false)
    setPasswordDialogFile(null)

    const progressDialog = useProgressDialogStore.getState()
    const reqId = `extract-${Date.now()}`

    // 显示进度对话框
    progressDialog.show({
      title: `解压 ${file.name}`,
      cancellable: true,
      onCancel: () => progressDialog.close(),
    })

    // 监听进度推送
    const unsubscribe = registerMessageHandler((msg) => {
      if (msg.method === 'fs.extract.progress' && msg.params?.reqId === reqId) {
        const progress = msg.params.progress
        const message = msg.params.message
        progressDialog.update({
          progress: progress >= 0 ? progress : undefined,
          message: message || '',
        })
        return true
      }
      return false
    })

    try {
      await fsApi.extract(activeNodeId, file.path, currentPath, password, reqId)
      progressDialog.close()
      toast({ title: "解压成功", description: `${file.name} 已解压` })
      loadFiles()
    } catch (e: any) {
      progressDialog.close()
      const errorMsg = e?.message || "解压出错"

      // Check if password is required or incorrect
      if (errorMsg.includes("password") || errorMsg.includes("密码") ||
          errorMsg.includes("encrypted") || errorMsg.includes("加密")) {
        if (errorMsg.includes("incorrect") || errorMsg.includes("错误") || errorMsg.includes("wrong")) {
          toast({ title: "密码错误", description: "请重新输入正确的密码", variant: "destructive" })
        }
        setPasswordDialogFile(file)
        setPasswordDialogOpen(true)
      } else {
        toast({ title: "解压失败", description: errorMsg, variant: "destructive" })
      }
    } finally {
      unsubscribe()
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

      const progressDialog = useProgressDialogStore.getState()
      const reqId = `compress-${Date.now()}`
      progressDialog.show({
        title: `压缩 ${archiveName}`,
        cancellable: true,
        onCancel: () => progressDialog.close(),
      })

      const unsubscribe = registerMessageHandler((msg) => {
        if (msg.method === 'fs.compress.progress' && msg.params?.reqId === reqId) {
          const progress = msg.params.progress
          const message = msg.params.message
          progressDialog.update({
            progress: progress >= 0 ? progress : undefined,
            message: message || '',
          })
          return true
        }
        return false
      })

      await fsApi.compress(activeNodeId, filesToCompress.map(f => f.path), outputPath, reqId)

      progressDialog.close()
      await loadFiles()
      setSelectedFiles(new Set([outputPath]))
      setInlineRenamePath(outputPath)
      setInlineRenameOldName(archiveName)
      setInlineRenameValue(archiveName)
      toast({ title: "成功", description: `已压缩为 ${archiveName}` })
      unsubscribe()
    } catch (e: any) {
      const progressDialog = useProgressDialogStore.getState()
      progressDialog.close()
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

    const progressDialog = useProgressDialogStore.getState()
    const reqId = `${action === 'copy' ? 'copy' : 'move'}-${Date.now()}`

    const title = action === 'copy'
      ? (clipFiles.length === 1 ? `复制 ${clipFiles[0].name}` : `复制 ${clipFiles.length} 个项目`)
      : (clipFiles.length === 1 ? `移动 ${clipFiles[0].name}` : `移动 ${clipFiles.length} 个项目`)

    progressDialog.show({
      title,
      cancellable: true,
      onCancel: () => progressDialog.close(),
    })

    const unsubscribe = registerMessageHandler((msg) => {
      const method = action === 'copy' ? 'fs.copy.progress' : 'fs.move.progress'
      if (msg.method === method && msg.params?.reqId === reqId) {
        const progress = msg.params.progress
        const message = msg.params.message
        progressDialog.update({
          progress: progress >= 0 ? progress : undefined,
          message: message || '',
        })
        return true
      }
      return false
    })

    try {
      if (action === "copy") {
        await fsApi.copy(sourceNodeId, paths, currentPath, activeNodeId, reqId)
      } else {
        await fsApi.move(sourceNodeId, paths, currentPath, activeNodeId, reqId)
      }
      progressDialog.close()
      setClipboard(null)
      setSelectedFiles(new Set())
      loadFiles()
    } catch (e: any) {
      progressDialog.close()
      toast({ title: "操作失败", description: e?.message || "操作出错", variant: "destructive" })
    } finally {
      unsubscribe()
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
    passwordDialogOpen, setPasswordDialogOpen, passwordDialogFile,
  }
}
