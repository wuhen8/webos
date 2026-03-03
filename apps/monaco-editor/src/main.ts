import './app.css'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Setup Monaco workers (once)
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// Extension to Monaco language mapping
const EXT_LANG_MAP: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.json': 'json', '.jsonc': 'json',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.xml': 'xml', '.svg': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.markdown': 'markdown',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.lua': 'lua',
  '.r': 'r',
  '.pl': 'perl',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini', '.conf': 'ini', '.cfg': 'ini',
  '.toml': 'ini',
  '.vue': 'html',
  '.svelte': 'html',
}

function getLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  return EXT_LANG_MAP[ext] || 'plaintext'
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

// --- SVG Icons ---
const ICONS = {
  save: `<svg viewBox="0 0 16 16"><path d="M13.354 1.146l1.5 1.5A.5.5 0 0115 3v11a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1h10.5a.5.5 0 01.354.146zM2 2v12h12V3.207L12.793 2H11v4H4V2H2zm5 0v3h3V2H7z"/></svg>`,
  undo: `<svg viewBox="0 0 16 16"><path d="M2 5h7a4 4 0 110 8H5v-1h4a3 3 0 000-6H3.41l2.3 2.3-.71.7L1.5 5.5 5 2l.71.7L3.41 5H2z"/></svg>`,
  redo: `<svg viewBox="0 0 16 16"><path d="M14 5H7a4 4 0 100 8h4v-1H7a3 3 0 010-6h7.59l-2.3 2.3.71.7L16.5 5.5 13 2l-.71.7L14.59 5H14z"/></svg>`,
  findReplace: `<svg viewBox="0 0 16 16"><path d="M11.9 1a3.1 3.1 0 11-2.2 5.3L6.3 9.6a.5.5 0 01-.7 0l-.7-.7a.5.5 0 010-.7l3.3-3.4A3.1 3.1 0 0111.9 1zm0 1a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2zM3.5 12l-2 2h3l2-2h-3zm5-1l-1 1h3l1-1h-3z"/></svg>`,
  format: `<svg viewBox="0 0 16 16"><path d="M2 3h12v1H2V3zm2 3h8v1H4V6zm-1 3h10v1H3V9zm2 3h6v1H5v-1z"/></svg>`,
  wordWrap: `<svg viewBox="0 0 16 16"><path d="M2 3h12v1H2V3zm0 4h9a2 2 0 110 4H9l1.3-1.3-.7-.7L7.1 11.5l2.5 2.5.7-.7L9 12h2a3 3 0 000-6H2V7zm0 5h4v1H2v-1z"/></svg>`,
  fontDecrease: `<svg viewBox="0 0 16 16"><path d="M3 8h10v1H3V8z"/></svg>`,
  fontIncrease: `<svg viewBox="0 0 16 16"><path d="M8 3v10H7V3h1zM3 8h10v1H3V8z"/></svg>`,
  minimap: `<svg viewBox="0 0 16 16"><path d="M1 2h14v12H1V2zm1 1v10h5V3H2zm6 0v10h6V3H8z"/><rect x="9" y="4" width="4" height="1" opacity=".5"/><rect x="9" y="6" width="3" height="1" opacity=".5"/><rect x="9" y="8" width="4" height="1" opacity=".5"/></svg>`,
}

function createToolbarButton(doc: Document, icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = doc.createElement('button')
  btn.className = 'tb-btn'
  btn.innerHTML = icon
  btn.title = title
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    onClick()
  })
  return btn
}

function createSeparator(doc: Document): HTMLDivElement {
  const sep = doc.createElement('div')
  sep.className = 'tb-sep'
  return sep
}

interface MountContext {
  container: HTMLDivElement
  sdk: any
  windowId: string
  appId?: string
  file: { name: string; path: string; nodeId?: string; size?: number; extension?: string } | null
}

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
let disposed = false

export async function mount(ctx: MountContext) {
  const { container, sdk, file } = ctx
  const doc = document
  disposed = false

  // Build DOM structure
  const root = doc.createElement('div')
  root.className = 'monaco-host'

  const loadingEl = doc.createElement('div')
  loadingEl.className = 'loading-overlay'
  loadingEl.textContent = '加载编辑器中...'
  root.appendChild(loadingEl)

  const toolbar = doc.createElement('div')
  toolbar.className = 'toolbar'
  const toolbarLeft = doc.createElement('div')
  toolbarLeft.className = 'toolbar-left'
  const toolbarRight = doc.createElement('div')
  toolbarRight.className = 'toolbar-right'
  toolbar.appendChild(toolbarLeft)
  toolbar.appendChild(toolbarRight)
  root.appendChild(toolbar)

  const editorEl = doc.createElement('div')
  editorEl.className = 'editor-container'
  root.appendChild(editorEl)

  const statusbar = doc.createElement('div')
  statusbar.className = 'statusbar'
  const statusbarLeft = doc.createElement('div')
  statusbarLeft.className = 'statusbar-left'
  const statusbarRight = doc.createElement('div')
  statusbarRight.className = 'statusbar-right'
  statusbar.appendChild(statusbarLeft)
  statusbar.appendChild(statusbarRight)
  root.appendChild(statusbar)

  container.appendChild(root)

  // Parse file info
  let filePath: string | null = null
  let nodeId = 'local_1'

  if (file) {
    filePath = file.path || null
    if (file.nodeId) nodeId = file.nodeId
  }

  if (!filePath) {
    loadingEl.textContent = '未指定文件路径'
    return
  }

  sdk.window.setTitle(getFileName(filePath))

  let content = ''
  try {
    const data = await sdk.fs.read(nodeId, filePath)
    content = data.content || ''
  } catch (err: any) {
    loadingEl.textContent = `读取文件失败: ${err.message}`
    return
  }

  loadingEl.classList.add('hidden')

  const language = getLanguage(filePath)

  // Editor state
  let fontSize = 14
  let wordWrap: 'on' | 'off' = 'on'
  let minimapEnabled = true

  const editor = monaco.editor.create(editorEl, {
    value: content,
    language,
    theme: 'vs-dark',
    minimap: { enabled: minimapEnabled, scale: 0.8, showSlider: 'mouseover' },
    fontSize,
    lineNumbers: 'on',
    automaticLayout: true,
    wordWrap,
    padding: { top: 16, bottom: 16 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    fontLigatures: true,
    tabSize: 2,
  })

  editorInstance = editor

  let isModified = false

  // --- Save ---
  async function save() {
    if (disposed) return
    const value = editor.getValue()
    try {
      await sdk.fs.write(nodeId, filePath, value)
      isModified = false
      sdk.window.setTitle(getFileName(filePath!))
      updateStatusbar()
    } catch (err: any) {
      console.error('Save failed:', err)
    }
  }

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save)

  // Track modifications
  editor.onDidChangeModelContent(() => {
    if (!isModified) {
      isModified = true
      sdk.window.setTitle(`● ${getFileName(filePath!)}`)
    }
    updateStatusbar()
  })

  // Auto-save on blur
  editor.onDidBlurEditorWidget(() => {
    if (isModified) {
      setTimeout(save, 300)
    }
  })

  // --- Toolbar: Left buttons ---
  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.save, '保存 (Ctrl+S)', save))
  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.undo, '撤销 (Ctrl+Z)', () => {
    editor.trigger('toolbar', 'undo', null)
    editor.focus()
  }))
  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.redo, '重做 (Ctrl+Shift+Z)', () => {
    editor.trigger('toolbar', 'redo', null)
    editor.focus()
  }))

  toolbarLeft.appendChild(createSeparator(doc))

  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.findReplace, '搜索替换 (Ctrl+H)', () => {
    editor.trigger('toolbar', 'editor.action.startFindReplaceAction', null)
  }))
  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.format, '格式化 (Shift+Alt+F)', () => {
    editor.trigger('toolbar', 'editor.action.formatDocument', null)
    editor.focus()
  }))

  toolbarLeft.appendChild(createSeparator(doc))

  const wrapBtn = createToolbarButton(doc, ICONS.wordWrap, '自动换行', () => {
    wordWrap = wordWrap === 'on' ? 'off' : 'on'
    editor.updateOptions({ wordWrap })
    wrapBtn.classList.toggle('active', wordWrap === 'on')
    editor.focus()
  })
  wrapBtn.classList.add('active')
  toolbarLeft.appendChild(wrapBtn)

  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.fontDecrease, '缩小字号', () => {
    if (fontSize > 12) {
      fontSize--
      editor.updateOptions({ fontSize })
      editor.focus()
    }
  }))
  toolbarLeft.appendChild(createToolbarButton(doc, ICONS.fontIncrease, '放大字号', () => {
    if (fontSize < 24) {
      fontSize++
      editor.updateOptions({ fontSize })
      editor.focus()
    }
  }))

  const minimapBtn = createToolbarButton(doc, ICONS.minimap, '小地图', () => {
    minimapEnabled = !minimapEnabled
    editor.updateOptions({ minimap: { enabled: minimapEnabled } })
    minimapBtn.classList.toggle('active', minimapEnabled)
    editor.focus()
  })
  minimapBtn.classList.add('active')
  toolbarLeft.appendChild(minimapBtn)

  // --- Toolbar: Right info ---
  const cursorInfo = doc.createElement('span')
  cursorInfo.className = 'tb-info'
  toolbarRight.appendChild(cursorInfo)

  const langInfo = doc.createElement('span')
  langInfo.className = 'tb-info'
  langInfo.textContent = language
  toolbarRight.appendChild(langInfo)

  const encodingInfo = doc.createElement('span')
  encodingInfo.className = 'tb-info'
  encodingInfo.textContent = 'UTF-8'
  toolbarRight.appendChild(encodingInfo)

  const indentInfo = doc.createElement('span')
  indentInfo.className = 'tb-info'
  const model = editor.getModel()
  indentInfo.textContent = model?.getOptions().insertSpaces ? `Spaces: ${model.getOptions().tabSize}` : `Tab Size: ${model?.getOptions().tabSize}`
  toolbarRight.appendChild(indentInfo)

  // --- Statusbar ---
  const sbModified = doc.createElement('span')
  sbModified.className = 'sb-item'
  statusbarLeft.appendChild(sbModified)

  const sbCursor = doc.createElement('span')
  sbCursor.className = 'sb-item'
  statusbarRight.appendChild(sbCursor)

  const sbLang = doc.createElement('span')
  sbLang.className = 'sb-item'
  sbLang.textContent = language
  statusbarRight.appendChild(sbLang)

  const sbEncoding = doc.createElement('span')
  sbEncoding.className = 'sb-item'
  sbEncoding.textContent = 'UTF-8'
  statusbarRight.appendChild(sbEncoding)

  const sbIndent = doc.createElement('span')
  sbIndent.className = 'sb-item'
  sbIndent.textContent = indentInfo.textContent
  statusbarRight.appendChild(sbIndent)

  // --- Update statusbar ---
  function updateStatusbar() {
    const pos = editor.getPosition()
    const ln = pos?.lineNumber ?? 1
    const col = pos?.column ?? 1
    cursorInfo.textContent = `${ln}:${col}`
    sbCursor.textContent = `Ln ${ln}, Col ${col}`
    sbModified.textContent = isModified ? '● 未保存' : '已保存'
  }

  editor.onDidChangeCursorPosition(() => updateStatusbar())
  updateStatusbar()
}

export function unmount(ctx: MountContext) {
  disposed = true
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
  ctx.container.innerHTML = ''
}
