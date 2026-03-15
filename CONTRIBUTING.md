# 贡献指南

感谢你对 WebOS 项目的关注！欢迎参与贡献。

## 行为准则

本项目采用 [Contributor Covenant](https://www.contributor-covenant.org/) 行为准则。参与本项目即表示你同意遵守其条款。

## 如何贡献

### 报告问题

- 使用 GitHub Issues 提交问题
- 请先搜索是否已有相同问题
- 提供详细的问题描述、复现步骤、环境信息

### 提交代码

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码规范

**Go 后端：**
- 遵循 [Effective Go](https://golang.org/doc/effective_go)
- 使用 `gofmt` 格式化代码
- 添加必要的注释和文档

**前端：**
- 遵循 ESLint 规则
- 使用 TypeScript 类型注解
- 组件命名使用 PascalCase

### 提交信息规范

使用约定式提交：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型：
- `feat`: 新功能
- `fix`: 修复问题
- `docs`: 文档更新
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

示例：
```
feat(terminal): add copy/paste shortcuts

- Add Ctrl+Shift+C for copy
- Add Ctrl+Shift+V for paste

Closes #123
```

## 开发环境

### 后端

```bash
cd webos-backend
go mod download
go run .
```

### 前端

```bash
cd webos-frontend
pnpm install
pnpm dev
```

## 项目结构

```
webos/
├── webos-backend/     # Go 后端服务
│   ├── cmd/           # 入口
│   ├── internal/      # 内部包
│   │   ├── handler/   # HTTP/WebSocket 处理器
│   │   ├── service/   # 业务逻辑
│   │   └── model/     # 数据模型
│   └── pkg/           # 公共包
├── webos-frontend/    # React 前端
│   ├── src/
│   │   ├── apps/      # 内置应用
│   │   ├── components/# 全局组件
│   │   ├── stores/    # Zustand Store
│   │   └── lib/       # 工具库
│   └── public/
└── docs/              # 文档
```

## 许可证

本项目采用 GNU General Public License v3.0 许可证。贡献的代码将以相同许可证发布。

---

再次感谢你的贡献！
