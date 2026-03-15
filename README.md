# WebOS

一个现代化的 Web 桌面操作系统，基于 Go + React 构建。

## 演示地址

**在线体验**：https://wuhenba-webos.hf.space/

**登录密码**：`Admin@123`

> 演示环境可能不定时重置，请勿存储重要数据。

---

## 特性

- **桌面体验**：macOS 风格的窗口管理、Dock、启动台
- **文件管理**：本地/S3 存储、拖拽上传、在线预览
- **终端**：WebSocket 实时终端，支持 bash/zsh
- **Docker 管理**：容器、镜像、Compose 可视化管理
- **AI 集成**：内置 AI 对话，支持 Skills 扩展
- **WASM 应用**：安全沙箱，支持安装第三方应用
- **多端同步**：Web、Telegram、飞书等多端接入

## 快速开始

### Docker 部署（推荐）

**方式一：Docker Compose**

```bash
# 克隆仓库
git clone https://github.com/yourorg/webos.git
cd webos

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f webos
```

**方式二：直接运行**

```bash
docker run -d \
  --name webos \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/webos-data:/data \
  -e WEBOS_JWT_SECRET=your-secret-key \
  wuhen8/webos:latest
```

访问 http://localhost:8080，默认密码 `Admin@123`

### 源码构建

```bash
# 克隆仓库
git clone https://github.com/yourorg/webos.git
cd webos

# 构建镜像
docker build -t webos:latest .

# 或手动构建
cd webos-frontend && pnpm install && pnpm build
cd ../webos-backend && go build -o webos main.go
./webos
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WEBOS_PORT` | 服务端口 | `8080` |
| `WEBOS_DATA_DIR` | 数据目录 | `/data` |
| `WEBOS_JWT_SECRET` | JWT 密钥 | 随机生成 |
| `GIN_MODE` | 运行模式 | `release` |
| `TZ` | 时区 | `Asia/Shanghai` |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Zustand |
| 后端 | Go + Gin + WebSocket |
| 存储 | 本地磁盘 / S3 兼容存储 |
| 沙箱 | wazero (WASM) |
| 通信 | JSON-RPC 2.0 over WebSocket/HTTP |

## 内置应用

| 应用 | 功能 |
|------|------|
| 文件管理器 | 文件浏览、上传下载、预览 |
| 终端 | WebSocket 实时终端 |
| 代码编辑器 | Monaco Editor |
| Docker | 容器/镜像管理 |
| AI 聊天 | AI 对话 + Skills |
| 设置 | 系统配置 |
| 视频播放器 | 流媒体播放 |
| 音乐播放器 | 后台音乐播放 |
| 应用商店 | WebApp 安装管理 |

## 项目结构

```
webos/
├── webos-backend/     # Go 后端
├── webos-frontend/    # React 前端
├── docs/              # 文档
├── LICENSE            # GPLv3
└── CONTRIBUTING.md    # 贡献指南
```

## 贡献

欢迎贡献代码、报告问题、提出建议！

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 许可证

[GNU General Public License v3.0](LICENSE)

---

**注意**：本项目与 Palm WebOS、Facebook WebOS 等无关联。"WebOS" 在此仅作为通用术语使用，指代"Web-based Operating System"。
