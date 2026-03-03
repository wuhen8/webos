# 实现计划：AI 后台独立执行器

## 概述

将 AI 聊天系统重构为后台独立执行模式。按照自底向上的顺序实现：先构建核心组件（BroadcastSink → AIExecutor），再改造现有代码（ws_chat.go → commands.go），最后适配前端。每一步都在前一步基础上递增构建，确保无孤立代码。

## Tasks

- [x] 1. 实现 BroadcastSink 广播分发器
  - [x] 1.1 在 `webos-backend/internal/ai/executor.go` 中实现 BroadcastSink 结构体
    - 定义 `BroadcastSink` 结构体，包含 `sync.RWMutex` 和 `map[string]ChatSink`
    - 实现 `NewBroadcastSink()`、`Add(id, sink)`、`Remove(id)` 方法
    - 实现 `ChatSink` 接口的所有 9 个方法（OnDelta、OnThinking、OnToolCallPending、OnToolCall、OnToolResult、OnShellOutput、OnUIAction、OnDone、OnError）
    - 每个方法中：先拷贝 sinks map 快照（RLock），再遍历快照转发事件，转发失败时 defer recover 并移除失败 sink
    - 空 sinks 列表时正常接收事件但不执行转发
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

  - [ ]* 1.2 编写 BroadcastSink 属性测试：Sink 注册/注销往返
    - **Property 3: Sink 注册/注销往返**
    - 在 `webos-backend/internal/ai/broadcast_sink_test.go` 中实现
    - 生成器：随机 sink ID 序列 + 随机 add/remove 操作
    - 验证 Add 后 sink 收到事件，Remove 后 sink 不再收到事件
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 1.3 编写 BroadcastSink 属性测试：广播投递完整性
    - **Property 4: 广播投递完整性**
    - 在 `webos-backend/internal/ai/broadcast_sink_test.go` 中实现
    - 生成器：随机 sink 集合 + 随机事件
    - 验证每个已注册 sink 都收到了广播事件
    - **Validates: Requirements 2.4**

  - [ ]* 1.4 编写 BroadcastSink 属性测试：失败 Sink 隔离
    - **Property 5: 失败 Sink 隔离**
    - 在 `webos-backend/internal/ai/broadcast_sink_test.go` 中实现
    - 生成器：随机 sink 集合（含一个 panic sink）
    - 验证 panic sink 被移除，其余 sink 正常收到事件
    - **Validates: Requirements 2.6**


- [x] 2. 实现 AIExecutor 核心组件
  - [x] 2.1 在 `webos-backend/internal/ai/executor.go` 中实现 AIExecutor 结构体和入队逻辑
    - 定义 `EnqueueMsg`、`EnqueueResult`、`ExecutorStatus` 结构体
    - 定义 `AIExecutor` 结构体，包含 `*Service`、`chan EnqueueMsg`、`*BroadcastSink`、`sync.Mutex`、`activeConvID`、`runningConvID`、`context.CancelFunc`
    - 实现 `NewAIExecutor(service *Service) *AIExecutor`，启动时从 DB preferences 加载 `active_conv_id`
    - 实现 `Enqueue(convID, content string) EnqueueResult`：空闲时接受、同对话排队、跨对话拒绝
    - 实现 `Stop()` 方法，调用 cancelFn 取消当前执行
    - 实现 `Status() ExecutorStatus` 返回当前状态
    - 实现 `RegisterSink(id, sink)` 和 `UnregisterSink(id)` 委托给 BroadcastSink
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.4, 5.3_

  - [x] 2.2 实现 AIExecutor 消费 goroutine
    - 实现 `Start()` 方法，启动消费 goroutine 循环读取 channel
    - 消费逻辑：设置 runningConvID → 检查并更新 activeConvID（广播 conv_switched）→ 广播 chat_status_update(running) → 调用 service.HandleChat → 清除 runningConvID → 广播 chat_status_update(idle/running)
    - defer recover 处理 HandleChat panic，广播 OnError 并重置状态
    - context.WithTimeout(30min) 超时控制
    - activeConvID 变更时写入 DB preferences 表
    - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.4, 5.1, 5.2_

  - [ ]* 2.3 编写 AIExecutor 属性测试：消息队列 FIFO 顺序
    - **Property 1: 消息队列 FIFO 顺序**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机消息序列（同一对话）
    - 验证消费顺序与入队顺序一致
    - **Validates: Requirements 1.2**

  - [ ]* 2.4 编写 AIExecutor 属性测试：互斥执行
    - **Property 2: 互斥执行**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机并发入队操作
    - 验证任意时刻最多一条消息在执行
    - **Validates: Requirements 1.3**

  - [ ]* 2.5 编写 AIExecutor 属性测试：入队接受/拒绝规则
    - **Property 7: 入队接受/拒绝规则**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机 (runningConvID, enqueueConvID) 对
    - 验证同对话接受、跨对话拒绝、空闲时全部接受
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Checkpoint - 确保后端核心组件测试通过
  - 确保所有测试通过，如有问题请向用户确认。


- [x] 4. 改造 handleChatSend 和 WebSocket 连接生命周期
  - [x] 4.1 改造 `webos-backend/internal/handler/ws_chat.go` 中的 handleChatSend
    - 将 `aiService` 全局变量旁新增 `executor *ai.AIExecutor` 全局变量（或通过已有初始化机制注入）
    - 修改 `handleChatSend`：斜杠命令继续直接执行不经过 AIExecutor
    - 普通消息调用 `executor.Enqueue(convID, content)`，不再直接创建 wsSink 和调用 HandleChat
    - 入队被拒绝时，通过当前 WebSocket 连接发送 `chat_busy` 类型的 wsServerMsg（包含 rejectedConvId、busyConvTitle、hint）
    - 移除 handleChatSend 中的 `context.WithTimeout` 和 `go func` 直接调用 HandleChat 的逻辑
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 4.2, 4.3_

  - [x] 4.2 改造 `webos-backend/internal/handler/ws.go` 中的 WebSocket 连接生命周期
    - 在 `HandleUnifiedWS` 连接建立后，创建 wsSink 并调用 `executor.RegisterSink(connID, sink)`
    - 注册后立即发送当前执行状态：`executor.Status()` → `chat_status_update` 消息
    - 在 defer 清理函数中调用 `executor.UnregisterSink(connID)`
    - _Requirements: 1.5, 2.2, 2.3, 5.3_

  - [ ]* 4.3 编写属性测试：ActiveConvID 持久化往返
    - **Property 6: ActiveConvID 持久化往返**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机对话 ID
    - 验证入队成功后从 DB 读取 active_conv_id 与入队 convID 一致
    - **Validates: Requirements 3.1, 3.2, 6.2**

  - [ ]* 4.4 编写属性测试：TransientMessage 不持久化
    - **Property 8: TransientMessage 不持久化**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机拒绝场景
    - 验证被拒绝的入队请求不会在 ai_messages 表中产生记录
    - **Validates: Requirements 4.3**

  - [ ]* 4.5 编写属性测试：状态变更广播完整性
    - **Property 9: 状态变更广播完整性**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机状态转换序列
    - 验证每次状态变更都广播了包含 state、convId、convTitle、queueSize 的 chat_status_update 消息
    - **Validates: Requirements 3.4, 5.1, 5.2**


- [x] 5. 实现对话管理斜杠命令
  - [x] 5.1 在 `webos-backend/internal/ai/commands.go` 中注册并实现 `/conv` 命令
    - 在 `init()` 中注册三个命令：`conv list`、`conv switch`、`conv new`
    - 实现 `cmdConvList`：查询数据库返回所有对话的 ID 和标题列表
    - 实现 `cmdConvSwitch(args)`：解析对话 ID，验证存在性，调用 AIExecutor 更新 activeConvID 并广播 conv_switched
    - 实现 `cmdConvNew`：创建新空对话，设置为 activeConvID，广播 conv_switched
    - 不存在的对话 ID 返回 `CommandResult{IsError: true, Text: "对话不存在: <id>"}`
    - 在 `Service` 中增加对 AIExecutor 的引用，或通过参数传递
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.2 编写属性测试：对话列表完整性
    - **Property 10: 对话列表完整性**
    - 在 `webos-backend/internal/ai/executor_test.go` 中实现
    - 生成器：随机对话集合
    - 验证 `/conv list` 返回的列表包含所有对话的 ID 和标题
    - **Validates: Requirements 6.1**

- [x] 6. Checkpoint - 确保后端所有功能和测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 7. 扩展前端 chatService 消息处理
  - [x] 7.1 在 `webos-frontend/src/apps/ai-chat/chatService.ts` 中扩展 ChatEvent 类型和消息处理
    - 扩展 `ChatEvent.type` 联合类型，新增 `'chat_busy' | 'status_update' | 'conv_switched'`
    - 新增 `busyInfo?: { rejectedConvId: string; busyConvTitle: string; hint: string }` 字段
    - 新增 `statusUpdate?: { state: 'idle' | 'running'; convId: string; convTitle: string; queueSize: number }` 字段
    - 新增 `convSwitched?: { convId: string; convTitle: string }` 字段
    - 在 `registerMessageHandler` 的 switch 中新增 `chat_busy`、`chat_status_update`、`conv_switched` 三个 case，解析 msg.data 并 emit 对应事件
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. 改造前端 UI 组件
  - [x] 8.1 在 `webos-frontend/src/apps/ai-chat/ChatContent.tsx` 中实现状态管理和事件处理
    - 新增 `executorStatus` state（state/convId/convTitle/queueSize）
    - 新增 `activeConvId` state（全局活跃对话）和 `viewingConvId` state（当前查看对话）
    - 监听 `status_update` 事件更新 executorStatus
    - 监听 `conv_switched` 事件更新 activeConvId
    - 监听 `chat_busy` 事件在聊天区域显示临时系统提示（不持久化）
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

  - [x] 8.2 改造 ChatContent.tsx 的 UI 展示和交互逻辑
    - 在聊天区域顶部添加 AI 执行状态栏：空闲时显示"AI 空闲"，执行中显示"AI 正在执行「{convTitle}」"
    - 移除停止按钮，始终显示发送按钮（用户通过 `/stop` 命令停止）
    - 侧边栏点击仅切换 viewingConvId 加载历史消息，不发送改变 ActiveConversation 的请求
    - 发送消息时以 viewingConvId 作为目标对话发送到后端
    - 收到 conv_switched 时更新侧边栏中 ActiveConversation 的高亮标识
    - WebSocket 重连时根据 chat_status_update 恢复 AI 执行状态展示
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_

- [x] 9. Final checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号以确保可追溯性
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
