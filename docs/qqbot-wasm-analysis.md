# QQBot Wasm 插件现状梳理

## 范围

本文基于当前实现梳理 QQBot Wasm 插件的：

- 消息入口与下行回复路径
- routeKey 与 conversationId 的绑定方式
- 附件上行/下行处理路径
- 当前实现中的主要隐患、架构问题与补丁式修复痕迹

涉及核心文件：

- `apps/qqbot-ai-bot/main.go`
- `apps/qqbot-ai-bot/hostapi.go`
- `webos-backend/internal/wasm/capabilities.go`
- `webos-backend/internal/handler/handle_chat.go`
- `webos-backend/internal/handler/wasm_bridge.go`
- `webos-backend/internal/ai/executor.go`

---

## 一、整体消息链路

### 1. 插件事件入口

QQBot 插件通过 Wasm 导出的 `on_event` 接收宿主推送事件：

- `apps/qqbot-ai-bot/main.go:198`

事件在 `on_event` 中按类型分发：

- `host.response`：异步 HTTP/WS 调用响应
- `host.event`：宿主 WebSocket 事件
- `chat.delta` / `chat.done` / `chat.error`
- `chat.command_result`
- `chat.media`
- `system.notify`
- `tick`

对应分发逻辑：

- `apps/qqbot-ai-bot/main.go:214`

---

### 2. QQ 原始消息入口

QQBot 使用长连接模式接入 QQ 网关：

1. `ensureInit()` 读取配置、注册 client context、开始建连
   - `apps/qqbot-ai-bot/main.go:151`
2. `getAccessTokenAndConnect()` 获取 access token
   - `apps/qqbot-ai-bot/main.go:240`
3. `getGatewayAndConnect()` 获取 gateway url 并调用 `ws.connect`
   - `apps/qqbot-ai-bot/main.go:279`
4. `handleHostEvent()` 接宿主转发的 `ws.open/ws.message/ws.close/ws.error`
   - `apps/qqbot-ai-bot/main.go:307`
5. `handleWSMessage()` 解析 QQ 网关下发包
   - `apps/qqbot-ai-bot/main.go:477`
6. `handleDispatchEvent()` 再按 QQ 事件类型分发：
   - `C2C_MESSAGE_CREATE` -> `handleC2CMessage()`
   - `GROUP_AT_MESSAGE_CREATE` -> `handleGroupAtMessage()`
   - `MESSAGE_CREATE` -> `handleChannelMessage()`
   - `READY` -> Ready 状态日志
   - `apps/qqbot-ai-bot/main.go:529`

---

### 3. 进入 AI 的路径

用户消息最终通过 Wasm capability `chat.send` 送入后端 AI 服务：

QQBot 侧：

- `apps/qqbot-ai-bot/main.go:618`
- `apps/qqbot-ai-bot/main.go:683`
- `apps/qqbot-ai-bot/main.go:724`
- `apps/qqbot-ai-bot/main.go:1149`

后端注册与处理：

1. capability 注册：`webos-backend/internal/wasm/capabilities.go:101`
2. capability handler：`webos-backend/internal/wasm/capabilities.go:222`
3. chat handler：`webos-backend/internal/handler/handle_chat.go:104`
4. `chatSvc.SendMessage(...)` 入队 / 命令执行

如果内容是 slash command，则在 executor 中走独立命令分支：

- `webos-backend/internal/ai/executor.go:257`
- `webos-backend/internal/ai/executor.go:260`

---

## 二、会话绑定模型

### 1. routeKey 设计

QQBot 没有直接把 QQ 会话对象映射到 AI conversation，而是先抽象出 routeKey：

- 私聊：`c2c:<userID>`
  - `apps/qqbot-ai-bot/main.go:51`
- 群聊：`group:<groupID>`
  - `apps/qqbot-ai-bot/main.go:55`
- 频道：`channel:<channelID>`
  - `apps/qqbot-ai-bot/main.go:59`

routeKey 代表“消息来源路由”。

---

### 2. routeKey 与 conversationId 双向映射

核心函数：

- `getCurrentConversationID()`
  - `apps/qqbot-ai-bot/main.go:67`
- `setCurrentConversationID()`
  - `apps/qqbot-ai-bot/main.go:83`
- `bindActiveRoute()`
  - `apps/qqbot-ai-bot/main.go:101`
- `ensureConversationID()`
  - `apps/qqbot-ai-bot/main.go:106`

逻辑如下：

1. 收到用户消息后先生成 routeKey
2. 尝试从内存 `routeConversations` 取当前会话 ID
3. 如果内存没有，则从 KV 读取 `qq_conv:<routeKey>`
4. 如果仍没有，则调用 `chat.send` 创建新 AI 会话
5. 后续在 `chat.delta/chat.done/chat.error/chat.media/chat.command_result` 中，用真实 `conversationId` 回填映射

### 3. 当前模型的优点

这个方向本身是合理的：

- QQ 路由与 AI conversation 解耦
- 同一个私聊/群/频道可以稳定落入同一个 AI 上下文
- 插件重启后仍可通过 KV 恢复绑定关系

---

## 三、消息时序图

### 1. 普通文本消息 -> AI -> 回复

```text
QQ 用户
  │
  │ 发送消息
  ▼
QQ Gateway
  │
  │ WebSocket 事件
  ▼
QQBot Wasm 插件
  │
  ├─ handleC2CMessage / handleGroupAtMessage / handleChannelMessage
  │
  ├─ 计算 routeKey
  │
  ├─ 查 routeKey -> conversationId
  │    ├─ 命中：直接使用
  │    └─ 未命中：ensureConversationID() 触发 chat.send 创建会话
  │
  └─ request("chat.send", ...)
       ▼
WebOS Backend capability router
       ▼
chatSvc.SendMessage(...)
       ▼
AIExecutor / AI Service
       ▼
Wasm Event Sink
       │
       ├─ chat.delta
       ├─ chat.done
       ├─ chat.error
       ├─ chat.command_result
       └─ chat.media
       ▼
QQBot Wasm 插件
  │
  ├─ conversationId -> routeKey
  ├─ 聚合 delta / 处理 command / 处理 media
  └─ sendQQReply / sendQQAttachment
       ▼
QQ OpenAPI
       ▼
QQ 用户收到回复
```

---

### 2. 私聊附件上行时序

```text
QQ 用户发送附件 + 文本
  ▼
handleC2CMessage()
  │
  ├─ 遍历 attachments
  ├─ 为每个附件发起 http.request(saveTo=...)
  └─ pendingDownloads[requestId] = *PendingDownload
       ▼
host.response(http.request)
       ▼
handleHTTPResponse()
       ▼
handleDownloadComplete(pd, savedPath, err)
  │
  ├─ 累积下载结果
  └─ 全部完成后 sendTextToAI(pd)
       │
       ├─ 把本地文件转成 [文件: local_1:/opt/webos/uploads/...]
       └─ request("chat.send", ...)
            ▼
AI 服务处理附件上下文
```

---

### 3. Token / Gateway / 心跳状态时序

```text
tick
  ▼
ensureInit()
  ▼
getAccessTokenAndConnect()
  ▼
HTTP POST TokenAPI
  ▼
getGatewayAndConnect()
  ▼
HTTP GET /gateway
  ▼
ws.connect
  ▼
ws.open
  ▼
等待 QQ Hello(op=10)
  ▼
handleHello()
  ├─ 设置 heartbeatInterval
  ├─ wsReady = true
  └─ sendIdentify()
       ▼
READY / MESSAGE 事件

后续 tick:
- 按 heartbeatInterval 发送心跳
- token 临期时主动断线重连
- ws 断开时周期性重连
```

---

## 四、状态图

### 1. 连接状态

```text
[未初始化]
   │ tick
   ▼
[已读取配置]
   │
   ▼
[获取 Access Token]
   │ 成功
   ▼
[获取 Gateway]
   │ 成功
   ▼
[WS Connecting]
   │ ws.open
   ▼
[等待 Hello]
   │ op=10 Hello
   ▼
[WS Ready]
   │
   ├─ tick 发送心跳
   ├─ token 即将过期 -> 主动关闭并重连
   └─ ws.close / ws.error -> 回到未就绪状态
```

关键状态变量：

- `wsConnID` `apps/qqbot-ai-bot/main.go:27`
- `wsConnecting` `apps/qqbot-ai-bot/main.go:28`
- `wsReady` `apps/qqbot-ai-bot/main.go:29`
- `heartbeatInterval` `apps/qqbot-ai-bot/main.go:33`
- `lastSeq` `apps/qqbot-ai-bot/main.go:34`
- `tokenExpire` `apps/qqbot-ai-bot/main.go:39`

---

### 2. 路由与会话状态

```text
routeKey(c2c/group/channel)
   │
   ├─ routeConversations[routeKey] -> convID
   ├─ KV: qq_conv:<routeKey> -> convID
   └─ conversationRoutes[convID] -> routeKey

activeRouteKey
   └─ 当前实现里的“最近活动路由”游标
```

关键状态变量：

- `routeConversations` `apps/qqbot-ai-bot/main.go:46`
- `conversationRoutes` `apps/qqbot-ai-bot/main.go:47`
- `activeRouteKey` `apps/qqbot-ai-bot/main.go:48`

---

### 3. 回复聚合状态

```text
chat.delta(convA) ─┐
chat.delta(convA) ─┼─> replyBuf (全局)
chat.delta(convB) ─┘

chat.done(convX)
   └─ 读取并清空 replyBuf，然后发送
```

关键状态变量：

- `replyBuf` `apps/qqbot-ai-bot/main.go:22`
- `deltaCount` `apps/qqbot-ai-bot/main.go:23`
- `inCodeBlock` `apps/qqbot-ai-bot/main.go:24`

这里是当前实现最危险的全局共享状态之一。

---

## 五、下行回复逻辑

### 1. 文本回复

- `onChatDelta()` 将流式回复写入全局 `replyBuf`
  - `apps/qqbot-ai-bot/main.go:757`
- `onChatDone()` 读取 `replyBuf` 后调用 `sendQQReply()`
  - `apps/qqbot-ai-bot/main.go:775`
- `onChatError()` 直接回错误文本
  - `apps/qqbot-ai-bot/main.go:796`
- `onCommandResult()` 将命令结果发回对应路由
  - `apps/qqbot-ai-bot/main.go:814`
- `onSystemNotify()` 将系统通知发送到 `activeRouteKey`
  - `apps/qqbot-ai-bot/main.go:853`

`sendQQReply()` 最终按 routeKey 选择发送方法：

- `group:` -> `sendQQGroupMessage()`
- `channel:` -> `sendQQGroupMessage()`
- `c2c:` -> `sendQQC2CMessage()`

位置：

- `apps/qqbot-ai-bot/main.go:931`

---

### 2. 媒体回复

AI 媒体事件入口：

- `onChatMedia()` `apps/qqbot-ai-bot/main.go:889`

随后调用：

- `sendQQAttachment()` `apps/qqbot-ai-bot/main.go:946`

再按 routeKey 分发到：

- 私聊图片：`sendQQC2CImage()`
- 群图片：`sendQQGroupImage()`
- 私聊文件：`sendQQC2CFile()`
- 群文件：`sendQQGroupFile()`

---

## 六、主要问题与隐患

### 1. 全局 `replyBuf` 会导致多会话串流

相关位置：

- `apps/qqbot-ai-bot/main.go:22`
- `apps/qqbot-ai-bot/main.go:771`
- `apps/qqbot-ai-bot/main.go:788`

当前所有 conversation 共用一个 `replyBuf`。如果多个会话的 `chat.delta` 交错到达，文本会被拼进同一个缓冲区，`chat.done` 时谁先结束，谁就可能拿到混杂后的回复。

**影响：**

- 串会话
- 错发回复
- 并发下稳定性差

这是当前最严重的问题之一。

---

### 2. `activeRouteKey` 是全局游标，很多事件靠“猜当前路由”兜底

相关位置：

- `apps/qqbot-ai-bot/main.go:48`
- `apps/qqbot-ai-bot/main.go:731`
- `apps/qqbot-ai-bot/main.go:853`

`conversationRouteKey()` 在无法通过 `conversationId` 找到 routeKey 时，会回退到 `activeRouteKey`。`onSystemNotify()` 甚至完全依赖 `activeRouteKey`。

这意味着：

- 某些事件没有显式路由时，会落到“最近活跃路由”
- 多用户/多群交错时，系统通知和命令结果可能串路由

这是典型补丁式修复痕迹：先让消息能发出去，再用全局活动指针兜底。

---

### 3. 群/频道会话按 groupID / channelID 共享，粒度过粗

相关位置：

- `apps/qqbot-ai-bot/main.go:55`
- `apps/qqbot-ai-bot/main.go:59`

现在：

- 同一个群里，所有 @bot 的用户共享一个 AI conversation
- 同一个频道里，所有用户共享一个 AI conversation

这会带来：

- 上下文污染
- 用户之间互相影响模型状态/会话切换
- 难以解释“为什么 bot 记住了别人刚说的话”

这不一定是 bug，但一定是需要明确的产品/架构决策。

---

### 4. `channel:` 路由实际复用群发送方法，语义可疑

相关位置：

- `apps/qqbot-ai-bot/main.go:939`
- `apps/qqbot-ai-bot/main.go:940`

`sendQQReply()` 中 `channel:` 分支调用的是 `sendQQGroupMessage()`。从命名和 API 语义上看，这很可疑：频道消息不应天然等于群消息。

如果这是 QQ 平台接口兼容导致的复用，需要显式说明；否则这很可能是暂时跑通后的补丁写法。

---

### 5. `stripQQAtMention()` 实现明显错误

位置：

- `apps/qqbot-ai-bot/main.go:1156`

当前实现：

```go
return strings.TrimSpace(strings.TrimPrefix(text, "<@!"))
```

它并没有删除整个 mention，只是去掉了 `<@!` 前缀，尾部 `123>` 仍会残留。

例如：

```text
<@!123456> 帮我总结
```

可能被处理成：

```text
123456> 帮我总结
```

这是明确的逻辑 bug。

---

### 6. 发送成功判断靠 `strings.Contains(resp, "\"id\"")`

相关位置：

- `apps/qqbot-ai-bot/main.go:1014`
- `apps/qqbot-ai-bot/main.go:1056`
- 图片/文件发送回调中也有类似逻辑

问题：

- 错误响应也可能带 `id`
- 返回结构变动后会误判
- 无法拿到结构化错误信息

这是典型“字符串判断响应是否成功”的 patch 风格。

---

### 7. 附件下载状态管理依赖共享可变对象

相关位置：

- `apps/qqbot-ai-bot/main.go:247`
- `apps/qqbot-ai-bot/main.go:257`
- `apps/qqbot-ai-bot/main.go:627`
- `apps/qqbot-ai-bot/main.go:1094`

每个附件请求都把同一个 `*PendingDownload` 放进 `pendingDownloads[reqID]`。从当前运行方式看可能能工作，但它依赖：

- 回调不会出现竞争问题
- `Done/Paths` 更新不会重入冲突
- 单线程事件模型永远成立

这在结构上不稳健。

---

### 8. 授权边界只覆盖私聊，不覆盖群/频道

相关位置：

- `apps/qqbot-ai-bot/main.go:576`
- `apps/qqbot-ai-bot/main.go:1086`

当前授权逻辑只在 C2C 私聊中检查：

- 首个用户自动授权
- 未授权则拒绝

但群/频道消息没有类似权限约束。结果是：

- 私聊是“白名单模式”
- 群/频道近似“开放模式”

权限边界不一致。

---

### 9. 会话创建靠发送占位消息驱动，语义不干净

位置：

- `apps/qqbot-ai-bot/main.go:106`

`ensureConversationID()` 在没有现成 conversation 时，会调用 `chat.send` 创建会话；如果用户文本为空，还会发送 `[QQ 会话初始化]` 作为占位内容。

问题在于：

- “创建会话”和“发送真实消息”被混在一条路径里
- 初始化动作会进入正常消息处理链
- 调试和追踪时不容易区分系统初始化消息与用户真实输入

这会放大后续的路由绑定复杂度。

---

### 10. Wasm capability 权限检查当前是全开放

位置：

- `webos-backend/internal/wasm/capabilities.go:148`

```go
func (r *CapabilityRouter) CheckPermission(appID, method string) bool {
    return true
}
```

这意味着当前 Wasm app 能访问的能力边界非常宽。对 bot 插件来说，这属于系统级安全风险，而不只是 QQBot 局部问题。

---

## 七、哪些地方最像“打补丁式修复”

最明显的是这些点：

1. `activeRouteKey` 作为全局当前路由
2. `conversationRouteKey()` 找不到映射时 fallback 到 `activeRouteKey`
3. `onSystemNotify()` 直接往 `activeRouteKey` 发
4. `channel:` 复用 `sendQQGroupMessage()`
5. HTTP 成功判断依赖字符串 contains
6. `stripQQAtMention()` 是最小可运行实现，不是协议级处理

这些点的共同特征是：

- 先让当前场景跑通
- 没有把状态边界真正建清楚
- 新需求一叠上去就容易继续加补丁

---

## 八、当前架构评价

### 合理部分

- `routeKey -> conversationId` 的抽象方向是对的
- QQ 平台协议处理和 WebOS AI 会话处理之间有明确适配层
- 附件下载到本地后，用 `[文件: local_1:...]` 交给 AI 的桥接方案合理

### 不合理部分

当前最大的问题是：

**平台路由状态、流式回复状态、会话绑定状态都堆在插件全局变量里。**

包括：

- `activeRouteKey`
- `replyBuf`
- `deltaCount`
- `routeConversations`
- `conversationRoutes`
- `pendingDownloads`

这种结构在单一 happy path 下可以工作，但一旦：

- 多用户同时交互
- 命令和普通消息交错
- 媒体/通知/系统事件穿插
- 后端并发行为改变

就会快速出现串路由、串会话、串回复问题。

---

## 九、建议的修复优先级

### P0

1. 将回复缓冲从全局 `replyBuf` 改为按 `conversationId` 或 `routeKey` 隔离
2. 去掉 `activeRouteKey` 作为主路由依据，所有回包尽量显式绑定 route
3. 修复 `stripQQAtMention()`

### P1

4. 明确 channel 与 group 的发送 API 语义，不再混用
5. 将系统通知/命令结果改为显式目标路由，而不是依赖“最近活跃路由”
6. 所有 QQ OpenAPI 响应改为结构化解析

### P2

7. 重新审视群/频道的会话粒度（按群共享 / 按用户 / 按 thread）
8. 将“创建会话”与“发送首条消息”解耦
9. 建立 Wasm capability 权限边界

---

## 十、简版结论

**QQBot 当前实现的主链路是通的，但它依赖大量插件级全局状态。**

最核心的问题不是某一个接口调用，而是：

- 回复聚合是全局的
- 路由兜底是全局的
- 通知投递也依赖全局最近活跃状态

这使得它在单路 happy path 下看起来没问题，但一旦进入多会话、多事件交错场景，就容易出现隐蔽的错路由和串回复。

如果后续要重构，最优先应先拆掉“全局 replyBuf + 全局 activeRouteKey”这两个状态中心。
