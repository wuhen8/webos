---
name: music-search
description: Search and download music via `musicdl` inside Docker using host-level `tmux`. Features batch execution to reduce AI interactions, persistent bash sessions for stability, and explicit multi-select logic (Space/Enter). Automatically handles container deployment/recovery.
---

# Music Downloader (Optimized Batch Mode)

## Overview

本 Skill 指导 AI 通过 **“批处理 Shell 指令”** 操作宿主机上的 `musicdl` 容器。
为了降低交互频率并保证下载稳定性，AI 必须严格遵循 **Search -> Select -> Wait -> Cleanup** 的四阶段流程。
下载文件默认保存至数据目录下的 music 子目录（`{{DATA_DIR}}/music`），用户指定其他路径时以用户为准。

## Core Pattern (Execution Logic)

AI 必须将一系列原子操作（启动、发送按键、等待、截图）合并为单条 Shell 命令执行。

### Phase 1: Search & Peek (启动与搜索)

**当用户发起搜索请求时，AI 必须一次性发送以下组合命令：**

```bash
# 1. 清理旧会话 (防止残留)
tmux kill-session -t dl_session 2>/dev/null; 
# 2. 启动持久化 Bash 会话 (关键：保持容器连接不断开)
tmux new-session -d -s dl_session 'docker exec -it musicdl bash'; 
# 3. 等待 Bash 就绪
sleep 1; 
# 4. 发送搜索命令 (带 -k 参数跳过欢迎界面)
tmux send-keys -t dl_session "musicdl -k '用户的搜索词'" Enter; 
# 5. 等待 TUI 界面渲染 (8秒左右，可能会更慢)
sleep 3; 
# 6. 捕获屏幕供 AI 决策
tmux capture-pane -t dl_session -p
```

**AI 决策逻辑 (Evaluate Phase 1):**
- **情况 A (报错/容器缺失)**: 输出包含 `No such container` 或 `session not found`。 -> **执行 [Self-Healing] 流程**。
- **情况 B (列表展示)**: 输出显示了歌曲列表 (TUI 界面)。 -> **进入 Phase 2**。

---

### Phase 2: Select & Submit (选择与提交)

**AI 分析 Phase 1 的截图，规划按键路径。必须遵循“先多选(Space)，后提交(Enter)”原则。**

**按键法则:**
- `Down` / `Up`: 移动光标。
- `Space`: **选中/取消**当前项（界面会显示 `[x]` 或高亮）。
- `Enter`: **提交表单**（开始下载）。**注意：Enter 只能在所有歌曲选好后按一次！**
- `a`: all
- `i`: invert, 
- `q/Esc` cancel.

**Shell 命令构造示例:**

*   **场景：选中第 1 首 和 第 3 首**
    ```bash
    # 逻辑：选中第1首(Space) -> 下移2次(Down x2) -> 选中第3首(Space) -> 提交(Enter)
    # 注意：提交后不要立即 Kill，必须等待下载并截图
    tmux send-keys -t dl_session Space Down Down Space Enter; \
    sleep 5; \
    tmux capture-pane -t dl_session -p
    ```

*   **场景：当前页没找到，向下翻页**
    ```bash
    # 逻辑：连续下移 5 次滚动列表，不按 Enter，重新截图
    tmux send-keys -t dl_session Down Down Down Down Down; \
    sleep 2; \
    tmux capture-pane -t dl_session -p
    ```

---

### Phase 3: Wait Loop (等待下载)

**AI 分析 Phase 2 的截图。**

- **情况 A (下载中)**: 屏幕显示进度条或 `Downloading...`。 -> **继续等待**。
  - 命令：`sleep 5; tmux capture-pane -t dl_session -p`
- **情况 B (已完成)**: 屏幕显示 `Saved to...` 并且出现了 Shell 提示符 `root@...:/#`。 -> **进入 Phase 4**。
- **情况 C (列表翻页)**: 如果 Phase 2 执行的是翻页操作，此时屏幕显示新列表。 -> **回到 Phase 2 继续选择**。

---

### Phase 4: Cleanup (任务清理)

**只有当 AI 明确看到“Saved”或“下载成功”的字样，或者Shell提示符已归位时，才执行清理。**

```bash
tmux kill-session -t dl_session
```
*(执行完这一步后，回复用户：“✅ 下载已完成。”)*

---

### [Self-Healing] Workflow (环境自愈)

**Phase 1 报错时，AI 先检测当前环境是否支持 Docker：**

```bash
docker info >/dev/null 2>&1 && echo "DOCKER_OK" || echo "NO_DOCKER"
```

#### 路径 A：Docker 可用 → 容器部署

一次性发送整个部署脚本：

```bash
# 1. 创建目录
mkdir -p /opt/webos/compose/musicdl && \
cd /opt/webos/compose/musicdl && \

# 2. 写入 Dockerfile (保持 bash 挂起)
echo "FROM python:3.11-slim
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources || true
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple musicdl
WORKDIR /downloads
CMD [\"tail\", \"-f\", \"/dev/null\"]" > Dockerfile && \

# 3. 写入 Compose (挂载宿主机音乐目录)
echo "services:
  musicdl:
    build: .
    container_name: musicdl
    restart: unless-stopped
    volumes:
      - {{DATA_DIR}}/music:/downloads" > docker-compose.yml && \

# 4. 构建并启动
docker compose up -d --build && \
sleep 5
```
*(执行完自愈后，重新执行 Phase 1)*

#### 路径 B：无 Docker → 本机直接安装 musicdl

当环境不支持 Docker（输出 `NO_DOCKER`）时，直接用 pip 安装并在宿主机运行：

```bash
# 1. 安装 musicdl（使用国内镜像加速）
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple musicdl

# 2. 确保 ffmpeg 可用（下载转码需要）
which ffmpeg || echo "WARNING: ffmpeg 未安装，部分歌曲可能无法正常转码"

# 3. 创建下载目录
mkdir -p {{DATA_DIR}}/music
```

安装完成后，Phase 1~4 的流程改为直接在宿主机 tmux 中运行 musicdl（不经过 docker exec）：

```bash
tmux kill-session -t dl_session 2>/dev/null; \
tmux new-session -d -s dl_session 'cd {{DATA_DIR}}/music && bash'; \
sleep 1; \
tmux send-keys -t dl_session "musicdl -k '用户的搜索词'" Enter; \
sleep 3; \
tmux capture-pane -t dl_session -p
```

后续 Phase 2/3/4 的 tmux 按键操作与 Docker 模式完全一致，无需修改。

---

## Example Workflow (AI 思考过程)

**用户指令**: "下载邓紫棋的泡沫"

1.  **Phase 1 (Search)**:
    AI 执行：`tmux kill-session...; tmux new-session... 'docker exec -it musicdl bash'; ... "musicdl -k '邓紫棋 泡沫'" Enter; sleep 3; tmux capture-pane...`
    *(系统返回截图：显示列表，第1项就是目标)*

2.  **Phase 2 (Select)**:
    AI 执行：`tmux send-keys -t dl_session Space Enter; sleep 5; tmux capture-pane -t dl_session -p`
    *(系统返回截图：显示 `[50%] Downloading...`)*

3.  **Phase 3 (Wait)**:
    AI 执行：`sleep 10; tmux capture-pane -t dl_session -p`
    *(系统返回截图：显示 `Saved: 泡沫.mp3`，且出现 `root@musicdl:/#`)*

4.  **Phase 4 (Cleanup)**:
    AI 执行：`tmux kill-session -t dl_session`
    *(AI 回复用户：下载完成)*

## Common Mistakes

- **不要提前 Kill**: 绝对不要在发送 `Enter` 后立即 `kill-session`。必须通过 `sleep` 和 `capture-pane` 确认下载完成后再清理，否则后台下载会被强制中断。
- **Space vs Enter**: 只要记住：`Space` 是打勾，`Enter` 是交卷。想下多首就打多个勾，最后交一次卷。
- **Command Chaining**: 所有 `tmux` 操作必须用分号 `;` 或 `&&` 连接，确保一次性发送给 Shell，不要分多次请求 AI 接口。