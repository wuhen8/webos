---
name: tmux-background
description: 使用 tmux 在后台执行耗时任务，支持进度查看和会话管理。关键词：tmux、后台、长时间、编译、构建、build、deploy
---

# tmux 后台任务

当 shell 工具超时（默认120秒）且 AI 需要拿到执行结果继续处理时，使用 tmux 在后台运行。

> 如果不需要 AI 后续处理结果，优先用 submit_background_task。

## 规则

- **禁止**在 shell 中使用 `&` 后台运行，后台进程无法被取消机制终止
- 所有需要后台运行的任务一律使用 tmux

## 操作流程

### 1. 启动任务

```bash
tmux new-session -d -s <任务名> 'set -o pipefail; <命令>; echo "EXIT_CODE=$?"' \; set-option remain-on-exit on
```

启动后立即回复用户，不要等待完成。

### 2. 查看进度（用户要求时）

```bash
tmux capture-pane -t <任务名> -p -S -50
```

输出中包含 `EXIT_CODE=0` 表示成功完成。

### 3. 清理

```bash
tmux kill-session -t <任务名>
```

## 注意

- 会话名用简短英文：build、download、deploy
- 不要等待 tmux 会话结束，启动后立即回复用户
- 用户说"看看进度"、"完成了吗"时再查看输出
