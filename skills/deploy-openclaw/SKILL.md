---
name: deploy-openclaw
description: 帮助用户在本地或通过 SSH 在远程 Linux/VPS 服务器上自动化安装、配置或更新 OpenClaw 实例。
user-invocable: true
emoji: 🦞
requires:
  bins:
    - bash
    - curl
    - ssh
---

# Deploy OpenClaw (自动化部署 OpenClaw 技能)

## 🎯 目标
作为 AI 助手，你的任务是根据用户的指令，利用 Shell 和 SSH 工具，在本地或远程服务器上自动化安装、更新 OpenClaw，并检查其运行状态。

## 📋 工作流 (Workflow)

当用户请求安装或部署 OpenClaw 时，请严格按照以下步骤操作，不要即兴发挥：

1. **建立连接与环境检查**：
   - 如果部署到远程服务器，先通过 SSH 连接目标机器。
   - 检查目标机器是否安装了 Node.js 22 或更高版本 (`node --version`)。如果低于 v22，请中断并告知用户需要升级 Node.js。
   - 检查系统内存情况 (`free -h`)。如果可用内存不足 2GB，请主动向用户提议使用 `sudo` 执行以下命令创建 4GB Swap 文件以防 `npm` 内存溢出：
     `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

2. **执行安装流程**：
   - **本地更新**：如果用户要求更新现有版本，执行 `npm install -g openclaw@latest`。
   - **全新安装**：执行官方一键安装脚本：
     `curl -fsSL https://openclaw.ai/install.sh | bash`

3. **初始化与配置**：
   - 安装完成后，请提示用户系统已就绪，但需要他们自行执行 onboarding 来配置通信平台（WhatsApp/Telegram）：
     `openclaw onboard --install-daemon`
   - 提醒用户如果使用的是云服务器，需要在安全组防火墙中放行 `18789` 端口，以便访问 Control UI Dashboard。

4. **状态检查**：
   - 尝试执行 `openclaw gateway status` 或 `openclaw --version` 验证二进制文件是否已正确链接并在环境变量中生效。

## ⚠️ 注意事项与边界
- **权限安全**：执行系统级配置（如配置 Swap）前，必须通过终端工具确认是否具有足够权限，若无权限请停止并询问用户。
- **环境限制**：如果检测到目标是 Windows，请提醒用户必须在 WSL2 中运行。
- **报告格式**：每完成一个关键步骤（连接成功、Node检查完毕、安装完成），请在聊天软件中简明扼要地向用户汇报进度，不要一次性长篇大论。