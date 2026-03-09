# FM Static App SDK 开发文档

## 概述

FM SDK 允许静态前端应用（HTML/JS/CSS）集成到桌面系统中，通过 `window.FM` 全局对象调用系统的文件管理、终端、Docker、命令执行等全部能力。

通信机制：SDK 通过 `postMessage` 与宿主 iframe 桥接，所有 API 均为异步（返回 Promise），超时时间 30 秒。

---

## 快速开始

### 1. 创建应用目录结构

```
my-app/
├── manifest.json
├── index.html
├── style.css        (可选)
└── app.js           (可选)
```

### 2. 编写 manifest.json

```json
{
  "id": "my-app",
  "name": "我的应用",
  "description": "一个示例静态应用",
  "icon": "AppWindow",
  "version": "1.0.0",
  "defaultSize": {
    "width": 900,
    "height": 600
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 应用唯一标识，只允许字母、数字、连字符、下划线 |
| `name` | 是 | 应用显示名称 |
| `description` | 否 | 应用描述 |
| `icon` | 否 | 图标名称，使用 [Lucide Icons](https://lucide.dev/icons/) 名称，如 `AppWindow`、`Globe`、`Rocket` 等 |
| `version` | 否 | 版本号 |
| `defaultSize` | 否 | 窗口默认尺寸，`{ width, height }`，默认 900x600 |
| `fileAssociations` | 否 | 文件关联声明，见下方「文件关联」章节 |

### 3. 编写 index.html

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的应用</title>
  <script src="/webos-sdk.js"></script>
</head>
<body>
  <h1>Hello FM!</h1>
  <div id="output"></div>

  <script>
    // SDK 加载后 window.FM 即可用
    async function init() {
      // 设置窗口标题
      await FM.window.setTitle('我的应用 - 已加载')

      // 列出根目录文件
      const files = await FM.fs.list('local', '/')
      document.getElementById('output').textContent = JSON.stringify(files, null, 2)
    }
    init()
  </script>
</body>
</html>
```

### 4. 打包安装

将应用目录打成 zip 包，在应用商店「上传应用」标签页上传即可。

也可以手动将应用目录放到 `{DataDir}/webapps/my-app/`，系统启动时会自动发现并注册。

---

## 文件关联

静态应用可以声明自己能打开哪些文件类型。声明后：
- 双击对应类型的文件会自动用你的应用打开
- 右键菜单「打开方式」列表中会出现你的应用

### manifest.json 中声明

```json
{
  "id": "office-viewer",
  "name": "Office 预览",
  "icon": "Eye",
  "version": "1.0.0",
  "defaultSize": { "width": 1000, "height": 700 },
  "fileAssociations": [
    {
      "extensions": [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
      "isDefault": true,
      "label": "Office 预览",
      "icon": "Eye"
    }
  ]
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `extensions` | 是 | 支持的文件扩展名数组，带点号，如 `[".doc", ".docx"]` |
| `isDefault` | 否 | 是否作为这些扩展名的默认打开方式（双击直接打开） |
| `label` | 否 | 在「打开方式」菜单中的显示名称，默认用应用 name |
| `icon` | 否 | 在「打开方式」菜单中的图标，默认用应用 icon |

可以声明多组关联：

```json
{
  "fileAssociations": [
    {
      "extensions": [".doc", ".docx"],
      "isDefault": true,
      "label": "Word 预览"
    },
    {
      "extensions": [".pdf"],
      "isDefault": false,
      "label": "PDF 查看"
    }
  ]
}
```

### 接收文件信息

当用户通过双击或右键「打开方式」打开文件时，系统会在 URL 中附带 `file` 参数。应用需要从 URL 解析文件信息：

```js
function getFileFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const fileParam = params.get('file')
  if (!fileParam) return null
  try {
    return JSON.parse(decodeURIComponent(fileParam))
  } catch {
    return null
  }
}

// 返回值结构：
// {
//   name: "report.docx",
//   path: "/home/documents/report.docx",
//   nodeId: "local",
//   size: 102400,
//   extension: ".docx"
// }
```

### 完整示例：Office 文件预览器

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>Office 预览</title>
  <script src="/webos-sdk.js"></script>
  <style>
    body { margin: 0; font-family: -apple-system, sans-serif; }
    .loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #666; }
    .error { padding: 40px; text-align: center; color: #ef4444; }
    iframe { width: 100%; height: 100vh; border: none; }
  </style>
</head>
<body>
  <div id="app" class="loading">加载中...</div>

  <script>
    const PREVIEW_SERVICE = 'https://your-onlyoffice-server.com'

    function getFileFromUrl() {
      const params = new URLSearchParams(window.location.search)
      const fileParam = params.get('file')
      if (!fileParam) return null
      try { return JSON.parse(decodeURIComponent(fileParam)) } catch { return null }
    }

    async function init() {
      const file = getFileFromUrl()
      const app = document.getElementById('app')

      if (!file) {
        // 没有文件参数 — 作为独立应用打开，显示欢迎页
        app.innerHTML = '<div class="loading">请从文件管理器中打开 Office 文件</div>'
        return
      }

      // 设置窗口标题
      FM.window.setTitle(file.name)

      // 构建预览 URL（通过后端下载接口获取文件）
      const token = new URLSearchParams(window.location.search).get('token') || ''
      const downloadUrl = `${window.location.origin}/api/fs/${file.nodeId}/download?path=${encodeURIComponent(file.path)}&token=${token}`
      const ext = file.extension.replace('.', '')
      const previewUrl = `${PREVIEW_SERVICE}/?src=${encodeURIComponent(downloadUrl)}&type=${ext}`

      app.innerHTML = `<iframe src="${previewUrl}"></iframe>`
    }

    init()
  </script>
</body>
</html>
```

对应的 `manifest.json`：

```json
{
  "id": "office-viewer",
  "name": "Office 预览",
  "description": "在线预览 Word、Excel、PPT 文件",
  "icon": "Eye",
  "version": "1.0.0",
  "defaultSize": { "width": 1000, "height": 700 },
  "fileAssociations": [
    {
      "extensions": [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
      "isDefault": true,
      "label": "Office 预览",
      "icon": "Eye"
    }
  ]
}
```

---

## API 参考

### nodeId 说明

文件系统操作需要传入 `nodeId` 参数，表示存储节点。本地文件系统默认为 `"local"`。

---

### FM.fs — 文件系统

#### FM.fs.list(nodeId, path)

列出目录内容。

```js
const files = await FM.fs.list('local', '/home')
// 返回: [{ name, path, isDir, size, extension, modifiedTime }, ...]
```

#### FM.fs.read(nodeId, path)

读取文件内容（文本）。

```js
const result = await FM.fs.read('local', '/etc/hostname')
// 返回: { path: "/etc/hostname", content: "my-server\n" }
```

#### FM.fs.write(nodeId, path, content)

写入文件内容。

```js
await FM.fs.write('local', '/tmp/test.txt', 'Hello World')
// 返回: { path: "/tmp/test.txt" }
```

#### FM.fs.mkdir(nodeId, parentPath, dirName)

创建目录。

```js
await FM.fs.mkdir('local', '/tmp', 'new-folder')
// 返回: { path: "/tmp/new-folder" }
```

#### FM.fs.create(nodeId, parentPath, fileName)

创建空文件。

```js
await FM.fs.create('local', '/tmp', 'new-file.txt')
// 返回: { path: "/tmp/new-file.txt" }
```

#### FM.fs.delete(nodeId, paths)

删除文件或目录。`paths` 可以是字符串或字符串数组。

```js
// 删除单个
await FM.fs.delete('local', '/tmp/test.txt')

// 批量删除
await FM.fs.delete('local', ['/tmp/a.txt', '/tmp/b.txt'])
```

#### FM.fs.rename(nodeId, parentPath, oldName, newName)

重命名文件或目录。

```js
await FM.fs.rename('local', '/tmp', 'old-name.txt', 'new-name.txt')
// 返回: { path: "/tmp/new-name.txt" }
```

#### FM.fs.copy(nodeId, paths, destDir, dstNodeId?)

复制文件。`paths` 可以是字符串或字符串数组。跨存储节点复制时传 `dstNodeId`。

```js
await FM.fs.copy('local', '/tmp/a.txt', '/home/backup/')

// 批量复制
await FM.fs.copy('local', ['/tmp/a.txt', '/tmp/b.txt'], '/home/backup/')
```

#### FM.fs.move(nodeId, paths, destDir, dstNodeId?)

移动文件。参数同 `copy`。

```js
await FM.fs.move('local', '/tmp/a.txt', '/home/')
```

#### FM.fs.search(nodeId, path, keyword)

搜索文件名。

```js
const results = await FM.fs.search('local', '/home', 'config')
// 返回: [{ name, path, isDir, size, ... }, ...]
```

---

### FM.terminal — 终端

#### FM.terminal.open()

打开一个新的终端会话。

```js
await FM.terminal.open()
```

> 终端会话的 `sid` 和输出数据通过事件系统推送，参见事件章节。

#### FM.terminal.input(sid, data)

向终端发送输入。

```js
await FM.terminal.input('abc123', 'ls -la\n')
```

#### FM.terminal.resize(sid, cols, rows)

调整终端尺寸。

```js
await FM.terminal.resize('abc123', 120, 40)
```

#### FM.terminal.close(sid)

关闭终端会话。

```js
await FM.terminal.close('abc123')
```

---

### FM.docker — Docker

#### FM.docker.containers()

获取容器列表（含实时状态）。

```js
const data = await FM.docker.containers()
// 返回: { available: true, containers: [...] }
```

#### FM.docker.images()

获取镜像列表。

```js
const data = await FM.docker.images()
// 返回: { available: true, images: [...] }
```

#### FM.docker.composeProjects()

获取 Docker Compose 项目列表。

```js
const data = await FM.docker.composeProjects()
// 返回: { available: true, projects: [...] }
```

#### FM.docker.containerLogs(containerId, tail?)

获取容器日志。`tail` 默认 `"200"`。

```js
const data = await FM.docker.containerLogs('container-id-xxx')
// 返回: { logs: "..." }
```

#### FM.docker.composeLogs(projectDir, tail?)

获取 Compose 项目日志。`tail` 默认 `"100"`。

```js
const data = await FM.docker.composeLogs('/opt/compose/my-project')
// 返回: { logs: "..." }
```

---

### FM.exec(command) — 命令执行

执行 Shell 命令并返回结果。

```js
const result = await FM.exec('whoami')
// 返回: { exitCode: 0, stdout: "root\n", stderr: "" }

const result2 = await FM.exec('df -h')
console.log(result2.stdout)
```

---

### FM.window — 窗口操作

#### FM.window.setTitle(title)

设置当前窗口标题。

```js
await FM.window.setTitle('我的应用 - 编辑中')
```

#### FM.window.close()

关闭当前窗口。

```js
await FM.window.close()
```

#### FM.window.getInfo()

获取当前窗口信息。

```js
const info = await FM.window.getInfo()
// 返回: { id, title, size: { width, height }, position: { x, y } }
```

---

### FM.on / FM.off — 事件系统

#### FM.on(event, handler)

监听服务端推送的 JSON-RPC 2.0 notification，`event` 对应 notification 的 `method` 字段。返回取消监听的函数。

```js
// 监听终端输出
const unsub = FM.on('terminal.output', (params) => {
  console.log('终端输出:', params)
})

// 取消监听
unsub()

// 监听所有事件（通配符）
FM.on('*', (method, params) => {
  console.log('事件:', method, params)
})
```

#### FM.off(event, handler?)

移除事件监听。不传 `handler` 则移除该事件的所有监听。

```js
FM.off('terminal.output', myHandler)
FM.off('terminal.output') // 移除所有
```

---

## 完整示例

### 文件浏览器

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>迷你文件浏览器</title>
  <script src="/webos-sdk.js"></script>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; margin: 0; background: #fafafa; }
    .breadcrumb { font-size: 14px; color: #666; margin-bottom: 12px; }
    .breadcrumb a { color: #2563eb; cursor: pointer; text-decoration: none; }
    .file-list { list-style: none; padding: 0; }
    .file-item {
      padding: 8px 12px; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; gap: 8px; font-size: 14px;
    }
    .file-item:hover { background: #e5e7eb; }
    .file-item .icon { width: 20px; text-align: center; }
    .file-item .size { margin-left: auto; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="breadcrumb" id="breadcrumb"></div>
  <ul class="file-list" id="fileList"></ul>

  <script>
    let currentPath = '/'

    function formatSize(bytes) {
      if (bytes === 0) return '-'
      const units = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
    }

    function renderBreadcrumb(path) {
      const parts = path.split('/').filter(Boolean)
      let html = '<a onclick="navigate(\'/\')">/</a>'
      let accumulated = ''
      for (const part of parts) {
        accumulated += '/' + part
        const p = accumulated
        html += ` <a onclick="navigate('${p}')">${part}</a> /`
      }
      document.getElementById('breadcrumb').innerHTML = html
    }

    async function navigate(path) {
      currentPath = path
      FM.window.setTitle('文件浏览器 - ' + path)
      renderBreadcrumb(path)

      const files = await FM.fs.list('local', path)
      const list = document.getElementById('fileList')
      list.innerHTML = ''

      // 排序：目录在前
      files.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      for (const file of files) {
        const li = document.createElement('li')
        li.className = 'file-item'
        li.innerHTML = `
          <span class="icon">${file.isDir ? '📁' : '📄'}</span>
          <span>${file.name}</span>
          <span class="size">${file.isDir ? '' : formatSize(file.size)}</span>
        `
        if (file.isDir) {
          li.onclick = () => navigate(file.path)
        } else {
          li.onclick = async () => {
            try {
              const data = await FM.fs.read('local', file.path)
              alert(data.content.substring(0, 500))
            } catch (e) {
              alert('无法读取: ' + e.message)
            }
          }
        }
        list.appendChild(li)
      }
    }

    navigate('/')
  </script>
</body>
</html>
```

### 系统信息面板

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>系统信息</title>
  <script src="/webos-sdk.js"></script>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; margin: 0; background: #fafafa; }
    .card {
      background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .card h3 { margin: 0 0 8px; font-size: 14px; color: #333; }
    pre { background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="card">
    <h3>主机名</h3>
    <pre id="hostname">加载中...</pre>
  </div>
  <div class="card">
    <h3>磁盘使用</h3>
    <pre id="disk">加载中...</pre>
  </div>
  <div class="card">
    <h3>Docker 容器</h3>
    <pre id="docker">加载中...</pre>
  </div>

  <script>
    async function load() {
      FM.window.setTitle('系统信息')

      // 主机名
      const hostname = await FM.exec('hostname')
      document.getElementById('hostname').textContent = hostname.stdout.trim()

      // 磁盘
      const disk = await FM.exec('df -h /')
      document.getElementById('disk').textContent = disk.stdout

      // Docker
      try {
        const data = await FM.docker.containers()
        if (data.available && data.containers.length > 0) {
          const lines = data.containers.map(c =>
            `${c.name || c.id?.substring(0, 12)}  ${c.state}  ${c.status}`
          )
          document.getElementById('docker').textContent = lines.join('\n')
        } else {
          document.getElementById('docker').textContent = data.available ? '没有运行中的容器' : 'Docker 不可用'
        }
      } catch (e) {
        document.getElementById('docker').textContent = '获取失败: ' + e.message
      }
    }
    load()
  </script>
</body>
</html>
```

---

## 安装方式

| 方式 | 说明 |
|------|------|
| 应用商店上传 | 在应用商店「上传应用」标签页上传 zip 包 |
| 手动放置 | 将应用目录放到 `{DataDir}/webapps/{appId}/`，重启或刷新后自动发现 |
| 应用商店下载 | catalog.json 中 `type: "static"` 的应用，配置 `static.zipUrl` 指向 zip 下载地址 |

### Zip 包结构

```
my-app.zip
├── manifest.json    (必须)
├── index.html       (必须)
├── style.css
├── app.js
└── assets/
    └── logo.png
```

或带根目录：

```
my-app.zip
└── my-app/
    ├── manifest.json
    ├── index.html
    └── ...
```

两种结构都支持，SDK 会自动识别。

---

## 可用图标列表

manifest.json 的 `icon` 字段支持以下 Lucide 图标名：

`Folder` `FileCode` `Settings` `Monitor` `TerminalSquare` `Activity` `Container` `Globe` `Music` `PackageOpen` `HardDrive` `Shield` `AppWindow` `BookOpen` `Image` `Film` `Rocket` `Bot` `Share2` `Eye` `Link` `Download` `Upload` `RefreshCw` `Star`

完整列表参见 [Lucide Icons](https://lucide.dev/icons/)。

---

## 注意事项

- 所有 API 调用均为异步，返回 Promise，请使用 `async/await` 或 `.then()`
- 请求超时时间为 30 秒，超时后 Promise 会 reject
- 静态应用运行在 iframe 中，与宿主同源，受方法白名单限制
- `FM.exec()` 可以执行任意 Shell 命令，请注意安全
- 文件操作中的 `nodeId` 参数，本地文件系统固定传 `"local"`，S3 等远程存储传对应的节点 ID
- 声明了 `fileAssociations` 的应用，打开文件时会收到 URL 中的 `file` 参数，需自行解析
- 同一扩展名可以被多个应用声明，`isDefault: true` 的应用优先作为双击默认打开方式
