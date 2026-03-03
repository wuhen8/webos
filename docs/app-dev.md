# WebOS 应用开发文档

## 概述

WebOS 应用通过 `manifest.json` 声明，安装在 `{DataDir}/webapps/{appId}/`，通过应用商店统一管理。

一个应用可以包含两种可选能力，按需组合：

| 能力 | 文件 | 运行环境 | 说明 |
|------|------|---------|------|
| 前端 UI | `main.js` + `style.css` | 浏览器 DOM | 通过 SDK 调用系统能力，有窗口界面 |
| 后端 Wasm | `app.wasm` | 后端 wazero 沙箱 | 通过宿主函数调用系统能力，后台运行 |

组合方式：
- 只有前端 — 纯 UI 工具（计算器、文件查看器、编辑器）
- 只有 Wasm — 纯后台服务（Telegram Bot、定时任务）
- 两者都有 — 前端做配置/展示，Wasm 跑后台逻辑

两种能力调用的是同一套 handler 注册表，系统能力完全等价。

---

## manifest.json

所有字段统一在一个 manifest 中，按需声明：

```json
{
  "id": "my-app",
  "name": "我的应用",
  "description": "应用描述",
  "icon": "AppWindow",
  "version": "1.0.0",
  "styles": ["style.css"],
  "defaultSize": { "width": 900, "height": 600 },
  "wasmModule": "app.wasm",
  "background": true,
  "pollInterval": 3000,
  "permissions": ["kv", "net"],
  "configSchema": [
    { "key": "api_token", "label": "API Token", "type": "password", "default": "" }
  ]
}
```

| 字段 | 说明 | 适用 |
|------|------|------|
| `id` | 应用唯一标识 | 通用，必填 |
| `name` | 显示名称 | 通用，必填 |
| `description` | 应用描述 | 通用 |
| `icon` | [Lucide Icons](https://lucide.dev/icons/) 图标名或 URL | 通用 |
| `version` | 版本号 | 通用 |
| `styles` | CSS 文件路径数组 | 前端 |
| `defaultSize` | 窗口默认尺寸 `{ width, height }` | 前端 |
| `fileAssociations` | 文件关联声明 | 前端 |
| `wasmModule` | wasm 文件名 | Wasm |
| `background` | `true` 时系统启动自动运行 wasm | Wasm |
| `pollInterval` | 毫秒，>0 时宿主定时推送 `tick` 事件 | Wasm |
| `permissions` | 权限声明（暂未强制校验） | Wasm |
| `configSchema` | 安装时的配置项 | Wasm |

---

## 目录结构

```
my-app/
├── manifest.json        (必须)
├── main.js              (前端入口，有 UI 时必须)
├── style.css            (前端样式，可选)
├── app.wasm             (wasm 模块，有后端逻辑时必须)
├── main.go              (wasm 源码)
├── hostapi.go           (wasm 宿主函数封装)
└── build.sh             (wasm 构建脚本，可选)
```

---

# 前端能力

有 `main.js` 的应用会在桌面上以窗口形式打开。应用直接挂载在宿主 DOM 中（非 iframe），通过宿主注入的 `sdk` 对象调用系统能力。

## main.js

必须导出 `mount` 函数，可选导出 `unmount`：

```js
export async function mount(ctx) {
  const { container, sdk, windowId, file } = ctx

  // container: HTMLDivElement — 挂载容器
  // sdk: StaticAppSDK — 系统能力接口
  // windowId: string — 当前窗口 ID
  // file: { name, path, nodeId?, size?, extension? } | null — 打开的文件

  sdk.window.setTitle('我的应用')

  const el = document.createElement('div')
  el.textContent = 'Hello WebOS!'
  container.appendChild(el)
}

export function unmount(ctx) {
  ctx.container.innerHTML = ''
}
```

## MountContext

```ts
interface MountContext {
  container: HTMLDivElement
  sdk: StaticAppSDK
  windowId: string
  file: { name: string; path: string; nodeId?: string; size?: number; extension?: string } | null
}
```

## CSS 规范

所有 CSS 由宿主统一管理，应用代码零 CSS 操作。

1. 在 manifest `styles` 数组中声明 CSS 文件
2. 宿主在加载 JS 前注入 `<link>` 到 `<head>`
3. 多窗口引用计数，最后一个窗口关闭时自动移除

禁止在应用代码中创建 `<style>` 或 `<link>` 标签。

Vite 构建：`main.ts` 中 `import './app.css'`，打包到 `dist/style.css`，manifest 声明 `styles: ["style.css"]`。

## 布局与滚动

挂载容器充满窗口内容区（`position: absolute; inset: 0`），外层 `overflow: hidden`。应用自己决定滚动。

```css
.my-app {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; overflow: hidden;
}
.my-app-header { flex-shrink: 0; padding: 12px 16px; }
.my-app-content { flex: 1; overflow: auto; padding: 16px; }
```

不要依赖 `body` 级别滚动。

## 弹窗与模态框

窗口容器有 `transform` 属性，形成独立层叠上下文。所有弹窗必须挂载在 `ctx.container` 内部，禁止挂载到 `document.body`。

第三方 UI 库需配置挂载点为 `ctx.container`。

## 快捷键

以下全局快捷键会被宿主拦截：

| 快捷键 | 功能 |
|--------|------|
| `⌘,` | 打开设置 |
| `⌘N` | 新建窗口 |
| `⌘W` | 关闭窗口 |
| `⌘M` | 最小化窗口 |
| `⌘K` | 打开搜索 |
| `` ⌘` `` | 切换窗口 |
| `Escape` | 关闭菜单 |
| `F4` | 启动台 |

`Ctrl+S` / `Shift+Alt+F` 在应用激活时正常传播。

## 文件关联

```json
{
  "fileAssociations": [
    {
      "extensions": [".js", ".ts", ".json", ".py", ".go"],
      "isDefault": true,
      "label": "代码编辑器",
      "icon": "FileCode"
    }
  ]
}
```

声明后双击对应文件自动打开，右键「打开方式」列表中出现。打开文件时 `ctx.file` 包含文件信息。

## 前端 SDK API

所有 API 通过 `ctx.sdk` 访问，均为异步。

### sdk.fs — 文件系统

```js
await sdk.fs.list('local', '/home')           // 列目录
await sdk.fs.read('local', '/path/file.txt')  // 读文件 → { path, content }
await sdk.fs.write('local', '/path/file.txt', content)  // 写文件
await sdk.fs.mkdir('local', '/tmp', 'dir')    // 创建目录
await sdk.fs.create('local', '/tmp', 'f.txt') // 创建空文件
await sdk.fs.delete('local', ['/tmp/f.txt'])  // 删除
await sdk.fs.rename('local', '/tmp', 'old', 'new')  // 重命名
await sdk.fs.copy('local', paths, destDir)    // 复制
await sdk.fs.move('local', paths, destDir)    // 移动
await sdk.fs.search('local', '/home', 'keyword')  // 搜索
```

`nodeId`：本地文件系统传 `"local"`，S3 等远程存储传对应节点 ID。

### sdk.terminal — 终端

```js
sdk.terminal.open()                    // 打开终端
sdk.terminal.input(sid, 'ls -la\n')    // 发送输入
sdk.terminal.resize(sid, 120, 40)      // 调整尺寸
sdk.terminal.close(sid)                // 关闭
```

### sdk.docker — Docker

```js
await sdk.docker.containers()          // 容器列表
await sdk.docker.images()              // 镜像列表
await sdk.docker.compose()             // Compose 项目列表
await sdk.docker.containerLogs(id)     // 容器日志
await sdk.docker.composeLogs(dir)      // Compose 日志
```

### sdk.exec(command) — 命令执行

```js
const result = await sdk.exec('whoami')
// { exitCode: 0, stdout: "root\n", stderr: "" }
```

### sdk.window — 窗口操作

```js
sdk.window.setTitle('标题')    // 设置标题
sdk.window.close()             // 关闭窗口
sdk.window.getInfo()           // 获取窗口信息
```

### sdk.wasm — Wasm 进程管理

```js
await sdk.wasm.start('my-app')     // 启动
await sdk.wasm.stop('my-app')      // 停止
await sdk.wasm.restart('my-app')   // 重启
const list = await sdk.wasm.list() // 列表
```

---

## Vite 构建配置参考

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist', assetsDir: 'assets', cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'style.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
  plugins: [{
    name: 'copy-manifest',
    closeBundle() {
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(__dirname, 'dist', 'manifest.json'))
    },
  }],
})
```

---

# Wasm 能力

有 `wasmModule` 的应用会在后端 wazero 沙箱中运行。采用 Reactor 模式：`main()` 初始化后返回，模块常驻内存，宿主通过导出函数 `on_event` 推送事件。

## main.go

```go
package main

import "unsafe"

var token string

func main() {
    token = configGet("api_token")
    if token == "" {
        logMsg("ERROR: api_token not configured")
        return
    }
    logMsg("应用初始化完成")
    // main 返回后模块常驻内存
}

//go:wasmexport on_event
func on_event(ptr uint32, size uint32) uint32 {
    if size == 0 { return 0 }
    data := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), size)
    // data 是 JSON: {"type":"xxx","data":{...}}
    return 0
}
```

## hostapi.go

宿主函数声明和 Go 封装，可直接复制使用：

```go
package main

import (
    "encoding/json"
    "unsafe"
)

//go:wasmimport webos log
func _hostLog(msgPtr, msgLen uint32)

//go:wasmimport webos config_get
func _hostConfigGet(keyPtr, keyLen uint32) uint64

//go:wasmimport webos kv_get
func _hostKVGet(keyPtr, keyLen uint32) uint64

//go:wasmimport webos kv_set
func _hostKVSet(keyPtr, keyLen, valPtr, valLen uint32) uint32

//go:wasmimport webos kv_delete
func _hostKVDelete(keyPtr, keyLen uint32) uint32

//go:wasmimport webos http_request
func _hostHTTPRequest(methodPtr, methodLen, urlPtr, urlLen, bodyPtr, bodyLen, headersPtr, headersLen uint32) uint64

//go:wasmimport webos request
func _hostRequest(typePtr, typeLen, payloadPtr, payloadLen uint32) uint64

func logMsg(msg string) {
    if len(msg) == 0 { return }
    b := []byte(msg)
    _hostLog(bytesPtr(b), uint32(len(b)))
}

func configGet(key string) string {
    b := []byte(key)
    return unpackString(_hostConfigGet(bytesPtr(b), uint32(len(b))))
}

func kvGet(key string) string {
    b := []byte(key)
    return unpackString(_hostKVGet(bytesPtr(b), uint32(len(b))))
}

func kvSet(key, val string) {
    kb, vb := []byte(key), []byte(val)
    _hostKVSet(bytesPtr(kb), uint32(len(kb)), bytesPtr(vb), uint32(len(vb)))
}

func kvDelete(key string) {
    b := []byte(key)
    _hostKVDelete(bytesPtr(b), uint32(len(b)))
}

func httpRequest(method, url, body, headers string) string {
    mb, ub, bb, hb := []byte(method), []byte(url), []byte(body), []byte(headers)
    return unpackString(_hostHTTPRequest(
        bytesPtr(mb), uint32(len(mb)), bytesPtr(ub), uint32(len(ub)),
        bytesPtr(bb), uint32(len(bb)), bytesPtr(hb), uint32(len(hb)),
    ))
}

func request(msgType string, payload interface{}) string {
    payloadBytes, _ := json.Marshal(payload)
    tb := []byte(msgType)
    return unpackString(_hostRequest(
        bytesPtr(tb), uint32(len(tb)),
        bytesPtr(payloadBytes), uint32(len(payloadBytes)),
    ))
}

func bytesPtr(b []byte) uint32 {
    if len(b) == 0 { return 0 }
    return uint32(uintptr(unsafe.Pointer(&b[0])))
}

func unpackString(packed uint64) string {
    ptr := uint32(packed >> 32)
    length := uint32(packed & 0xFFFFFFFF)
    if length == 0 { return "" }
    bytes := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), length)
    return string(bytes)
}
```

## 编译

```bash
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o app.wasm .
```

- `-buildmode=c-shared` — Reactor 模式，main 返回后模块不退出
- 需要 Go 1.24+（`//go:wasmexport`），推荐 Go 1.26

## 生命周期

```
系统启动
  → 扫描 background:true 的应用
  → StartProc(appID)
      → 创建 wazero runtime（完全隔离）
      → 注册 WASI + webos 宿主模块
      → InstantiateModule（空启动）
      → 调用 _initialize（执行 main）
      → 缓存 on_event 导出函数
      → 注册事件 sink
      → 如有 pollInterval，启动定时器
      → 状态 → running

运行中
  → 系统事件 → PushEvent → on_event
  → 定时器 tick → PushEvent → on_event
  → wasm 内调宿主函数

停止
  → StopProc → 注销 sink → 关闭模块和引擎
```

## 宿主函数 API

wasm 通过 `//go:wasmimport webos <name>` 调用系统能力。

### log — 日志

```go
logMsg("hello from wasm")  // → [WASM:my-app] hello from wasm
```

### config_get — 读应用配置

```go
token := configGet("api_token")
```

### kv_get / kv_set / kv_delete — KV 存储

应用级，按 appID 隔离。

```go
kvSet("last_id", "12345")
val := kvGet("last_id")
kvDelete("last_id")
```

### http_request — HTTP 请求

headers 换行分隔 `Key: Value\nKey2: Value2`。超时 30 秒，响应体最大 10MB。

```go
resp := httpRequest("GET", "https://api.example.com/data", "", "")
resp := httpRequest("POST", url, `{"text":"hello"}`, "Content-Type: application/json")
```

### request — 通用请求（核心）

调用任意已注册 handler，与前端 SDK 能力完全等价。系统新增 API 后 wasm 自动可用。

```go
request("fs.read", map[string]interface{}{"nodeId": "local", "path": "/etc/hostname"})
request("chat_send", map[string]interface{}{"conversationId": "c1", "messageContent": "你好"})
request("exec", map[string]interface{}{"command": "ls -la"})
```

## 导出函数 on_event

宿主推送事件时调用。事件格式 `{"type":"xxx","data":{...}}`。

| type | 说明 | data |
|------|------|------|
| `chat_delta` | AI 流式文本 | `conversationId`, `content` |
| `chat_thinking` | AI 思考过程 | `conversationId`, `content` |
| `chat_done` | AI 回复完成 | `conversationId`, `fullText`, `usage` |
| `chat_error` | AI 错误 | `conversationId`, `error` |
| `chat_tool_call` | AI 工具调用 | `conversationId`, `toolCall` |
| `chat_tool_result` | 工具调用结果 | `conversationId`, `result` |
| `tick` | 定时器触发 | 无 |

## 定时器（pollInterval）

manifest 声明 `"pollInterval": 3000`（毫秒），宿主按间隔推送 `{"type":"tick"}` 到 `on_event`。

## Wasm 注意事项

- `on_event` 同步调用，宿主等待返回。宿主函数调用阻塞但不影响其他进程
- wasm 单线程，宿主加锁保证不并发调用 `on_event`
- `request` 与前端 SDK 能力等价，系统新增 API 后自动可用
- KV 按 appID 隔离
- 编译必须用 `-buildmode=c-shared`
- 需要 Go 1.24+，推荐 1.26

---

# 安装与打包

## 安装方式

| 方式 | 说明 |
|------|------|
| 应用商店上传 | 上传包含 `manifest.json` 的 zip 包 |
| 手动放置 | 放到 `{DataDir}/webapps/{appId}/`，重启后自动发现 |
| 应用商店下载 | catalog.json 中配置的应用 |

## Zip 包结构

按需包含前端和/或 wasm 文件：

```
my-app.zip
├── manifest.json    (必须)
├── main.js          (有前端 UI 时)
├── style.css        (有前端样式时)
└── app.wasm         (有后端逻辑时)
```

支持带根目录或不带，系统自动识别。

## 可用图标

manifest `icon` 字段支持 [Lucide Icons](https://lucide.dev/icons/) 图标名或图标 URL。

常用：`Folder` `FileCode` `Settings` `Monitor` `TerminalSquare` `Activity` `Container` `Globe` `Music` `PackageOpen` `HardDrive` `Shield` `AppWindow` `BookOpen` `Image` `Film` `Rocket` `Bot` `Share2` `Eye` `Link` `Download` `Upload` `RefreshCw` `Star`

---

# 示例

## 纯前端：系统信息

```json
{ "id": "sys-info", "name": "系统信息", "icon": "Monitor", "version": "1.0.0", "styles": ["style.css"] }
```

```js
export async function mount(ctx) {
  const { container, sdk } = ctx
  sdk.window.setTitle('系统信息')
  const root = document.createElement('div')
  root.innerHTML = '<pre id="info">加载中...</pre>'
  container.appendChild(root)
  const r = await sdk.exec('hostname')
  root.querySelector('#info').textContent = r.stdout.trim()
}
export function unmount(ctx) { ctx.container.innerHTML = '' }
```

## 纯 Wasm：Telegram AI Bot

```json
{
  "id": "telegram-ai-bot", "name": "Telegram AI Bot",
  "wasmModule": "bot.wasm", "background": true, "pollInterval": 3000,
  "permissions": ["kv", "net"],
  "configSchema": [{ "key": "telegram_token", "label": "Bot Token", "type": "password" }]
}
```

main.go 中 `main()` 读 token 初始化，`on_event` 处理 `tick`（轮询 Telegram）和 `chat_delta`/`chat_done`（攒句子回复）。完整代码见 `apps/telegram-ai-bot/`。

## 前端 + Wasm：带管理界面的后台服务

```json
{
  "id": "my-monitor", "name": "监控服务",
  "styles": ["style.css"],
  "defaultSize": { "width": 800, "height": 500 },
  "wasmModule": "monitor.wasm",
  "background": true,
  "pollInterval": 60000
}
```

前端 `main.js` 提供配置界面和状态展示，wasm 后台每分钟 tick 执行健康检查。
