# 需求文档：AI 后台独立执行器

## 简介

将 AI 聊天系统重构为后台独立执行模式。AI 作为后端的后台进程运行，不依赖前端连接。前端仅作为命令入口和状态展示。当前端关闭时，AI 继续执行之前的任务；当前端重新打开时，从数据库恢复状态。核心改动包括：引入消息队列顺序执行、BroadcastSink 多端输出、全局活跃对话管理、忙碌状态拒绝机制，以及前端 UI 适配。

## 术语表

- **AIExecutor**: 后端 AI 执行器组件，负责消息队列管理、BroadcastSink 管理和活跃对话调度
- **MessageQueue**: AIExecutor 内部的消息队列，基于 Go channel + goroutine 实现，顺序执行用户消息
- **BroadcastSink**: 实现 `ChatSink` 接口的广播分发器，持有多个子 Sink（如 wsSink），将 AI 事件广播到所有已注册的端点
- **ActiveConversation**: 全局唯一的活跃对话，存储在数据库 preferences 表中，所有端点共享
- **ChatSink**: 已有的 AI 输出接口（`OnDelta`、`OnDone`、`OnError` 等方法），`HandleChat` 通过该接口输出事件
- **wsSink**: 已有的 WebSocket 实现的 ChatSink，将 AI 事件通过 WebSocket 发送到前端
- **Endpoint**: 连接到系统的客户端端点，当前为 WebSocket 前端，未来可扩展为飞书、Telegram 等
- **ViewingConversation**: 前端当前正在查看的对话，仅用于展示历史记录，不影响 ActiveConversation
- **TransientMessage**: 临时消息，仅发送到前端展示，不持久化到数据库（如忙碌拒绝提示）

## 需求

### 需求 1：AIExecutor 消息队列

**用户故事：** 作为系统管理员，我希望 AI 消息通过队列顺序执行，以便 AI 执行不依赖前端连接且不会并发冲突。

#### 验收标准

1. THE AIExecutor SHALL 在后端启动时初始化，包含一个基于 Go channel 的 MessageQueue 和一个消费 goroutine
2. WHEN 用户通过任意 Endpoint 发送消息时，THE AIExecutor SHALL 将消息放入 MessageQueue 顺序排队
3. THE AIExecutor SHALL 从 MessageQueue 中逐条取出消息，调用 `Service.HandleChat` 执行，同一时间仅执行一条消息
4. WHEN 前端 WebSocket 断开连接时，THE AIExecutor SHALL 继续执行当前正在处理的消息，不中断 AI 执行
5. WHEN 前端 WebSocket 重新连接时，THE AIExecutor SHALL 允许前端从数据库恢复已完成的对话状态，并接收正在执行任务的实时事件

### 需求 2：BroadcastSink 多端广播

**用户故事：** 作为系统管理员，我希望 AI 输出事件能广播到所有已连接的端点，以便多端同时查看 AI 执行状态。

#### 验收标准

1. THE BroadcastSink SHALL 实现 `ChatSink` 接口，内部持有一个可动态增减的子 Sink 列表
2. WHEN 一个 Endpoint 连接时，THE BroadcastSink SHALL 将该 Endpoint 对应的 Sink 注册到子 Sink 列表中
3. WHEN 一个 Endpoint 断开连接时，THE BroadcastSink SHALL 将该 Endpoint 对应的 Sink 从子 Sink 列表中移除
4. WHEN BroadcastSink 收到 AI 事件（OnDelta、OnDone、OnError 等）时，THE BroadcastSink SHALL 将事件转发到所有已注册的子 Sink
5. WHILE 子 Sink 列表为空时，THE BroadcastSink SHALL 正常接收 AI 事件但不执行任何转发操作，AI 执行结果仅通过数据库持久化保留
6. IF 某个子 Sink 的转发操作失败，THEN THE BroadcastSink SHALL 移除该失败的子 Sink 并继续向其余子 Sink 转发，不影响 AI 执行

### 需求 3：全局活跃对话管理

**用户故事：** 作为用户，我希望系统维护一个全局活跃对话，以便所有端点共享同一个对话上下文。

#### 验收标准

1. THE AIExecutor SHALL 在数据库 preferences 表中存储全局唯一的 ActiveConversation ID
2. WHEN 用户在任意 Endpoint 发送消息到某个对话时，THE AIExecutor SHALL 将该对话设置为 ActiveConversation
3. WHEN 用户在前端侧边栏点击某个对话时，THE 前端 SHALL 仅切换 ViewingConversation 展示该对话的历史记录，不改变 ActiveConversation
4. WHEN ActiveConversation 发生变更时，THE AIExecutor SHALL 通过 BroadcastSink 向所有已连接的 Endpoint 发送 `conv_switched` 消息

### 需求 4：忙碌状态与消息拒绝

**用户故事：** 作为用户，我希望在 AI 忙碌时收到明确的反馈，以便了解当前执行状态并决定是否等待或停止。

#### 验收标准

1. WHILE AIExecutor 正在执行对话 A 的消息时，WHEN 用户向同一对话 A 发送新消息，THE AIExecutor SHALL 将该消息放入 MessageQueue 排队等待当前执行完成后再处理
2. WHILE AIExecutor 正在执行对话 A 的消息时，WHEN 用户向不同对话 B 发送消息，THE AIExecutor SHALL 拒绝该消息并通过 Endpoint 返回 `chat_busy` 类型的 TransientMessage，内容包含当前正在执行的对话名称和 `/stop` 提示
3. THE `chat_busy` TransientMessage SHALL 不持久化到数据库，仅作为临时通知发送到发起请求的 Endpoint
4. WHEN 用户发送 `/stop` 命令时，THE AIExecutor SHALL 取消当前正在执行的 AI 任务，使系统恢复到空闲状态，允许用户向任意对话发送消息

### 需求 5：AI 执行状态广播

**用户故事：** 作为用户，我希望实时了解 AI 的执行状态，以便知道 AI 是否空闲、正在执行或有排队消息。

#### 验收标准

1. WHEN AIExecutor 的执行状态发生变化（空闲、执行中、队列中有等待消息）时，THE AIExecutor SHALL 通过 BroadcastSink 向所有已连接的 Endpoint 发送 `chat_status_update` 消息
2. THE `chat_status_update` 消息 SHALL 包含以下字段：执行状态（idle/running）、当前执行的对话 ID、当前执行的对话标题、队列中等待的消息数量
3. WHEN 一个新的 Endpoint 连接时，THE AIExecutor SHALL 立即向该 Endpoint 发送当前的执行状态

### 需求 6：对话管理斜杠命令

**用户故事：** 作为用户，我希望通过斜杠命令管理对话，以便在任意端点（UI、飞书、Telegram）进行对话切换和创建。

#### 验收标准

1. WHEN 用户发送 `/conv list` 命令时，THE 系统 SHALL 返回所有对话的列表，包含对话 ID 和标题
2. WHEN 用户发送 `/conv switch <id>` 命令时，THE AIExecutor SHALL 将指定对话设置为 ActiveConversation，并通过 BroadcastSink 广播 `conv_switched` 消息
3. WHEN 用户发送 `/conv new` 命令时，THE 系统 SHALL 创建一个新的空对话并将其设置为 ActiveConversation
4. IF 用户发送 `/conv switch` 时指定的对话 ID 不存在，THEN THE 系统 SHALL 返回错误提示说明该对话不存在

### 需求 7：WebSocket 消息类型扩展

**用户故事：** 作为前端开发者，我希望 WebSocket 协议支持新的消息类型，以便前端能处理忙碌拒绝、状态更新和对话切换事件。

#### 验收标准

1. THE WebSocket 协议 SHALL 支持 `chat_busy` 服务端消息类型，包含被拒绝的对话 ID、当前正在执行的对话标题和 `/stop` 提示文本
2. THE WebSocket 协议 SHALL 支持 `chat_status_update` 服务端消息类型，包含执行状态（idle/running）、当前对话 ID、当前对话标题和队列大小
3. THE WebSocket 协议 SHALL 支持 `conv_switched` 服务端消息类型，包含新的 ActiveConversation ID 和标题
4. THE 前端 chatService SHALL 注册对 `chat_busy`、`chat_status_update`、`conv_switched` 三种新消息类型的处理器，并通过事件系统通知 UI 组件

### 需求 8：前端 UI 适配

**用户故事：** 作为用户，我希望前端 UI 清晰展示 AI 执行状态，并区分"查看对话"和"激活对话"的操作。

#### 验收标准

1. THE 前端聊天界面 SHALL 在聊天区域顶部显示 AI 执行状态栏，展示当前状态（空闲或正在执行任务及实时输出信息）
2. THE 前端输入区域 SHALL 始终显示发送按钮，移除原有的停止按钮（用户通过 `/stop` 命令停止执行）
3. WHEN 用户在侧边栏点击对话时，THE 前端 SHALL 仅切换 ViewingConversation 加载并展示该对话的历史消息，不发送任何改变 ActiveConversation 的请求
4. WHEN 用户在某个对话中发送消息时，THE 前端 SHALL 将该对话作为目标对话发送到后端，由后端决定是否激活该对话或拒绝
5. WHEN 前端收到 `chat_busy` 消息时，THE 前端 SHALL 在聊天界面中显示临时的系统提示，告知用户 AI 正在执行其他对话并提示使用 `/stop`
6. WHEN 前端收到 `conv_switched` 消息时，THE 前端 SHALL 更新侧边栏中 ActiveConversation 的高亮标识
7. WHEN 前端 WebSocket 重新连接时，THE 前端 SHALL 从数据库加载当前 ViewingConversation 的最新消息，并根据收到的 `chat_status_update` 恢复 AI 执行状态展示

### 需求 9：handleChatSend 路由改造

**用户故事：** 作为后端开发者，我希望 `handleChatSend` 通过 AIExecutor 路由消息，而非直接调用 `HandleChat`，以便实现队列化执行和忙碌拒绝。

#### 验收标准

1. WHEN `handleChatSend` 收到用户消息时，THE `handleChatSend` SHALL 调用 `AIExecutor.Enqueue(convID, content)` 方法将消息入队，不再直接调用 `Service.HandleChat`
2. WHEN `AIExecutor.Enqueue` 返回拒绝结果时，THE `handleChatSend` SHALL 通过当前 WebSocket 连接向用户发送 `chat_busy` TransientMessage
3. THE `Service.HandleChat` 方法 SHALL 保持现有接口和逻辑不变，仅由 AIExecutor 的消费 goroutine 调用
4. WHEN 用户发送斜杠命令时，THE `handleChatSend` SHALL 继续直接执行命令处理逻辑，斜杠命令不经过 AIExecutor 消息队列
