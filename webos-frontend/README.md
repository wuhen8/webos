# WebOS Frontend

基于 React 18 + TypeScript + Vite 5 的 macOS 风格 Web 桌面前端。

## 技术栈

- React 18 + TypeScript
- Vite 5
- Zustand 5（状态管理）
- Tailwind CSS 4
- shadcn/ui（Radix UI + Tailwind）
- Monaco Editor（代码编辑）
- xterm.js（终端）
- ArtPlayer（视频播放）
- framer-motion（动画）

## 架构特点

- **进程-窗口分离**：窗口 UI 与进程生命周期解耦，支持后台运行
- **模块化应用**：每个功能是独立的 App，自动发现注册
- **JSON-RPC 2.0**：统一协议，WebSocket 通信
- **Store 驱动**：Zustand 状态管理，组件直接订阅

## 目录结构

```
src/
├── App.tsx              # 主应用
├── main.tsx             # 入口
├── apps/                # 内置应用（16 个）
├── components/          # 全局组件
├── stores/              # Zustand Store
├── hooks/               # 自定义 Hooks
├── config/              # 配置与注册中心
├── lib/                 # 工具库
│   ├── request.ts       # Axios 封装
│   ├── storageApi.ts    # 文件系统 API
│   └── services/        # WebSocket 业务服务
└── types/               # 类型定义
```

## 开发

```bash
pnpm install
pnpm dev
```

访问 http://localhost:3000

## 构建

```bash
pnpm build
```

## 内置应用

| App | 说明 |
|-----|------|
| fileManager | 文件管理器 |
| editor | 代码编辑器 |
| terminal | 终端 |
| docker | Docker 管理 |
| aiChat | AI 对话 |
| settings | 设置 |
| diskManager | 磁盘管理 |
| musicPlayer | 音乐播放器（后台运行） |
| video | 视频播放器 |
| image | 图片查看器 |
| markdown | Markdown 预览 |
| webview | Webview 容器 |
| taskManager | 任务管理器 |
| appStore | 应用商店 |
| staticApp | 静态应用容器 |
| about | 关于 |

## 全局组件

| 组件 | 说明 |
|------|------|
| Window | 窗口容器（拖拽、缩放、吸附） |
| TopMenuBar | 顶部菜单栏 |
| Dock | 底部 Dock |
| LoginScreen | 登录界面 |
| SpotlightSearch | 搜索面板（Cmd+K） |
| Launchpad | 启动台 |
| ContextMenuRenderer | 右键菜单 |
| TaskIndicator | 后台任务指示器 |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Cmd+K | 搜索 |
| Cmd+, | 设置 |
| Cmd+N | 新窗口 |
| Cmd+W | 关闭窗口 |
| Cmd+M | 最小化 |
| F4 | 启动台 |
