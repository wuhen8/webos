# WebOS 应用开发文档

## 概述

WebOS 应用通过 `manifest.json` 声明，安装在 `{DataDir}/webapps/{appId}/`，通过应用商店统一管理。

一个应用可以包含两种可选能力，按需组合：

| 能力 | 文件 | 运行环境 | 说明 |
|------|------|---------|------|
| 前端 UI | `main.js` + `style.css` | 浏览器 DOM | 通过 SDK 调用系统能力，有窗口界面 |
| 后端 WASM | `app.wasm` | 后端 wazero 沙箱 | 通过宿主函数调用系统能力，后台运行 |

两种能力调用的是同一套 JSON-RPC 2.0 接口，系统能力完全等价。

---

## manifest.json

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
| `icon` | Lucide Icons 图标名或 URL | 通用 |
| `version` | 版本号 | 通用 |
| `styles` | CSS 文件路径数组 | 前端 |
| `defaultSize` | 窗口默认尺寸 `{ width, height }` | 前端 |
| `fileAssociations` | 文件关联声明 | 前端 |
| `wasmModule` | wasm 文件名 | WASM |
| `background` | `true` 时系统启动自动运行 wasm | WASM |
| `pollInterval` | 毫秒，>0 时宿主定时推送 `tick` 事件 | WASM |
| `permissions` | 权限声明 | WASM |
| `configSchema` | 安装时的配置项 | WASM |

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
└── build.sh             (wasm 构建脚本)
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

所有 CSS 由宿主统一管理：

1. 在 manifest `styles` 数组中声明 CSS 文件
2. 宿主在加载 JS 前注入 `<link>` 到 `<head>`
3. 多窗口引用计数，最后一个窗口关闭时自动移除

禁止在应用代码中创建 `<style>` 或 `<link>` 标签。

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

## 弹窗与模态框

窗口容器有 `transform` 属性，形成独立层叠上下文。所有弹窗必须挂载在 `ctx.container` 内部，禁止挂载到 `document.body`。

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

声明后双击对应文件自动打开，右键「打开方式」列表中出现。

## 前端 SDK API

所有 API 通过 `ctx.sdk` 访问，均为异步。

### sdk.fs — 文件系统

```js
await sdk.fs.list('local', '/home')
await sdk.fs.read('local', '/path/file.txt')
await sdk.fs.write('local', '/path/file.txt', content)
await sdk.fs.mkdir('local', '/tmp', 'dir')
await sdk.fs.create('local', '/tmp', 'f.txt')
await sdk.fs.delete('local', ['/tmp/f.txt'])
await sdk.fs.rename('local', '/tmp', 'old', 'new')
await sdk.fs.copy('local', paths, destDir)
await sdk.fs.move('local', paths, destDir)
await sdk.fs.search('local', '/home', 'keyword')
```

`nodeId`：本地文件系统传 `"local"`，S3 等远程存储传对应节点 ID。

### sdk.terminal — 终端

```js
sdk.terminal.open()
sdk.terminal.input(sid, 'ls -la\n')
sdk.terminal.resize(sid, 120, 40)
sdk.terminal.close(sid)
```

### sdk.docker — Docker

```js
await sdk.docker.containers()
await sdk.docker.images()
await sdk.docker.compose()
await sdk.docker.containerLogs(id)
await sdk.docker.composeLogs(dir)
```

### sdk.exec(command) — 命令执行

```js
const result = await sdk.exec('whoami')
// { exitCode: 0, stdout: "root\n", stderr: "" }
```

### sdk.window — 窗口操作

```js
sdk.window.setTitle('标题')
sdk.window.close()
sdk.window.getInfo()
```

### sdk.wasm — WASM 进程管理

```js
await sdk.wasm.start('my-app')
await sdk.wasm.stop('my-app')
await sdk.wasm.restart('my-app')
const list = await sdk.wasm.list()
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
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
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

# WASM 能力

有 `wasmModule` 的应用会在后端 wazero 沙箱中运行。采用 **Reactor 模式**：`main()` 初始化后返回，模块常驻内存，宿主通过导出函数 `on_event` 推送事件。

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
    // data 是 JSON-RPC 2.0 notification
    return 0
}
```

## hostapi.go

宿主函数声明和 Go 封装：

```go
package main

import (
    "encoding/json"
    "unsafe"
)

//go:wasmimport webos request
func _hostRequest(typePtr, typeLen, payloadPtr, payloadLen uint32) uint64

var _sharedBuf [1 << 20]byte

//go:wasmexport get_shared_buf
func get_shared_buf() uint64 {
    ptr := uint32(uintptr(unsafe.Pointer(&_sharedBuf[0])))
    return uint64(ptr)<<32 | uint64(len(_sharedBuf))
}

func logMsg(msg string) {
    request("system.log", map[string]interface{}{"message": msg})
}

func configGet(key string) string {
    result := request("config.get", map[string]interface{}{"key": key})
    var r struct { Value string `json:"value"`; Error string `json:"error"` }
    json.Unmarshal([]byte(result), &r)
    return r.Value
}

func kvGet(key string) string {
    result := request("kv.get", map[string]interface{}{"key": key})
    var r struct { Value string `json:"value"` }
    json.Unmarshal([]byte(result), &r)
    return r.Value
}

func kvSet(key, val string) {
    request("kv.set", map[string]interface{}{"key": key, "value": val})
}

// request 调用宿主函数，自动解包 JSON-RPC 2.0 response
func request(msgType string, payload interface{}) string {
    payloadBytes, _ := json.Marshal(payload)
    tb := []byte(msgType)
    packed := _hostRequest(bytesPtr(tb), uint32(len(tb)), bytesPtr(payloadBytes), uint32(len(payloadBytes)))
    raw := readSharedBuf(packed)
    // Unwrap JSON-RPC 2.0 response
    var rpc struct {
        Result json.RawMessage `json:"result"`
        Error  *struct { Message string `json:"message"` } `json:"error"`
    }
    if json.Unmarshal([]byte(raw), &rpc) == nil {
        if rpc.Error != nil { return `{"error":"` + rpc.Error.Message + `"}` }
        if rpc.Result != nil { return string(rpc.Result) }
    }
    return raw
}

func bytesPtr(b []byte) uint32 {
    if len(b) == 0 { return 0 }
    return uint32(uintptr(unsafe.Pointer(&b[0])))
}

func readSharedBuf(packed uint64) string {
    length := uint32(packed & 0xFFFFFFFF)
    if length == 0 { return "" }
    return string(_sharedBuf[:length])
}
```

## 编译

```bash
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o app.wasm .
```

- `-buildmode=c-shared` — Reactor 模式，main 返回后模块不退出
- 需要 Go 1.24+（`//go:wasmexport`）

## 生命周期

```
系统启动
  → 扫描 DB 中 autostart=true 的应用
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
  → StopProc → 注销 sink → 关闭模块
```

## on_event 事件类型

| method | 说明 | params |
|--------|------|--------|
| `tick` | 定时器触发 | 无 |
| `chat.delta` | AI 流式文本 | `conversationId`, `content` |
| `chat.done` | AI 回复完成 | `conversationId`, `fullText` |
| `chat.error` | AI 错误 | `conversationId`, `error` |
| `system.notify` | 系统通知 | `level`, `title`, `message` |

## 宿主函数 API

### request — 统一调用入口

通过 `request` 调用所有宿主能力，与前端 SDK 能力完全等价：

```go
// 文件操作
request("fs.read", map[string]interface{}{"nodeId": "local", "path": "/etc/hostname"})

// HTTP 请求
request("http.request", map[string]interface{}{
    "method": "GET",
    "url": "https://api.example.com/data",
})

// AI 对话
request("chat.send", map[string]interface{}{
    "conversationId": "c1",
    "messageContent": "你好",
})
```

---

# 安装与打包

## 安装方式

| 方式 | 说明 |
|------|------|
| 应用商店上传 | 上传包含 `manifest.json` 的 zip 包 |
| 手动放置 | 放到 `{DataDir}/webapps/{appId}/`，重启后自动发现 |
| 应用商店下载 | catalog.json 中配置的应用 |

## Zip 包结构

```
my-app.zip
├── manifest.json    (必须)
├── main.js          (有前端 UI 时)
├── style.css        (有前端样式时)
└── app.wasm         (有后端逻辑时)
```

支持带根目录或不带，系统自动识别。
