import { type ReactNode } from 'react'
import type { WindowState, Process } from '@/types'
import { useProcessStore } from '@/stores/processStore'
export { lazyLoad } from './lazyLoad'

/**
 * Simplified render context — window state + process state.
 * Components read everything else from Zustand stores directly.
 */
export interface AppRenderContext {
  win: WindowState
  process: Process | undefined
}

export type AppRenderer = (ctx: AppRenderContext) => ReactNode

// 自动收集所有 apps/*/renderer.tsx
const rendererModules = import.meta.glob('../apps/*/renderer.tsx', { eager: true })

const componentRegistry: Record<string, AppRenderer> = {}

for (const [path, mod] of Object.entries(rendererModules)) {
  const { renderer } = mod as { renderer: AppRenderer }
  // 从 renderer 模块中获取 appId：同目录下的 manifest
  // 路径格式: ../apps/xxx/renderer.tsx → 提取 xxx
  const parts = path.split('/')
  const dirName = parts[parts.length - 2]
  componentRegistry[dirName] = renderer
}

// 同时建立 manifest.id → dirName 的映射，用于按 appId 查找
const manifestModules = import.meta.glob('../apps/*/manifest.ts', { eager: true })
const appIdToDirName: Record<string, string> = {}

for (const [path, mod] of Object.entries(manifestModules)) {
  const { manifest } = mod as { manifest: { id: string } }
  const parts = path.split('/')
  const dirName = parts[parts.length - 2]
  appIdToDirName[manifest.id] = dirName
}

// Ad-hoc renderers registered at runtime (e.g. child windows)
const adhocRenderers = new Map<string, AppRenderer>()

export function registerAdhocRenderer(type: string, renderer: AppRenderer) {
  adhocRenderers.set(type, renderer)
}

export function renderAppContent(ctx: { win: WindowState }): ReactNode {
  // Look up the process for this window
  const process = useProcessStore.getState().getProcess(ctx.win.pid)
  const fullCtx: AppRenderContext = { win: ctx.win, process }

  // 先按 win.type 直接匹配目录名
  let renderer: AppRenderer | undefined = componentRegistry[ctx.win.type]
  // 再按 appId → dirName 映射查找
  if (!renderer) {
    const dirName = appIdToDirName[ctx.win.type]
    if (dirName) renderer = componentRegistry[dirName]
  }
  // 最后查找 ad-hoc 注册的渲染器
  if (!renderer) {
    renderer = adhocRenderers.get(ctx.win.type)
  }
  if (renderer) return renderer(fullCtx)
  return <div className="h-full w-full flex items-center justify-center text-slate-500">Unknown app: {ctx.win.type}</div>
}
