# 需求文档

## 简介

文件管理器在跨目录导航时存在滚动位置丢失和内容闪烁两个体验问题。本需求定义了路径级视图状态缓存机制，通过为每个 Tab 引入以路径为 key 的 `PathViewState` 缓存（包含 `files` 和 `scrollTop`），实现导航时优先从缓存瞬间恢复渲染、再后台静默刷新的浏览器 bfcache 式体验。

## 术语表

- **FileManagerTab**: 文件管理器中的单个标签页实例，包含路径、历史记录、文件列表等状态
- **PathViewState**: 单个路径的视图状态缓存对象，包含 files、scrollTop、timestamp 三个字段
- **pathCache**: FileManagerTab 上以路径字符串为 key、PathViewState 为 value 的缓存映射
- **LRU**: Least Recently Used，最近最少使用淘汰策略
- **PATH_CACHE_MAX**: pathCache 的最大条目数上限，固定为 50
- **静默刷新**: 后台发起 API 请求获取最新文件列表，不触发 loading 状态的刷新方式
- **scrollTop**: 滚动容器的垂直滚动偏移量（像素值）
- **TabPanel**: 文件管理器标签页面板组件，负责导航逻辑和文件列表渲染
- **FileList**: 文件列表展示组件，负责渲染文件条目和上报滚动位置
- **fsService.watch**: 文件系统监听服务，实时推送目录内容变更

## 需求

### 需求 1：路径级视图状态数据结构

**用户故事:** 作为开发者，我希望 FileManagerTab 具备路径级视图状态缓存结构，以便每个路径的文件列表和滚动位置可以独立存储和恢复。

#### 验收标准

1. THE FileManagerTab SHALL 包含一个 pathCache 字段，类型为以路径字符串为 key、PathViewState 为 value 的 Record
2. THE PathViewState SHALL 包含 files（FileInfo 数组）、scrollTop（非负数值）和 timestamp（时间戳数值）三个字段
3. WHEN 创建新的 FileManagerTab 时，THE pathCache SHALL 初始化为空对象

### 需求 2：缓存写入与 LRU 淘汰

**用户故事:** 作为用户，我希望路径缓存自动管理容量，以便内存使用保持在合理范围内。

#### 验收标准

1. WHEN 向 pathCache 写入一个路径的视图状态时，THE setPathCache 函数 SHALL 将该条目的 timestamp 设置为当前时间
2. WHEN pathCache 的条目数超过 PATH_CACHE_MAX（50）时，THE setPathCache 函数 SHALL 淘汰 timestamp 最小的条目
3. WHEN setPathCache 执行完成后，THE pathCache SHALL 包含刚写入的路径条目
4. THE setPathCache 函数 SHALL 以纯函数方式返回新的 pathCache 对象，不修改输入参数

### 需求 3：缓存读取与 LRU 更新

**用户故事:** 作为用户，我希望访问缓存时自动更新访问时间，以便常用路径不会被错误淘汰。

#### 验收标准

1. WHEN 从 pathCache 读取一个存在的路径时，THE getPathCache 函数 SHALL 返回该路径的 PathViewState 数据
2. WHEN 从 pathCache 读取一个存在的路径时，THE getPathCache 函数 SHALL 将该条目的 timestamp 更新为当前时间
3. WHEN 从 pathCache 读取一个不存在的路径时，THE getPathCache 函数 SHALL 返回 null

### 需求 4：导航时保存当前视图状态

**用户故事:** 作为用户，我希望离开当前目录时自动保存滚动位置和文件列表，以便返回时能恢复到离开时的状态。

#### 验收标准

1. WHEN 用户导航到子目录时，THE TabPanel SHALL 在切换路径前将当前路径的 files 和 scrollTop 写入 pathCache
2. WHEN 用户点击后退按钮时，THE TabPanel SHALL 在切换路径前将当前路径的 files 和 scrollTop 写入 pathCache
3. WHEN 用户点击前进按钮时，THE TabPanel SHALL 在切换路径前将当前路径的 files 和 scrollTop 写入 pathCache

### 需求 5：导航时从缓存恢复视图

**用户故事:** 作为用户，我希望进入已访问过的目录时能瞬间看到之前的内容，而不是先看到空白或 loading。

#### 验收标准

1. WHEN currentPath 变化且 pathCache 中存在该路径的缓存时，THE TabPanel SHALL 立即使用缓存的 files 渲染文件列表
2. WHEN currentPath 变化且 pathCache 中存在该路径的缓存时，THE TabPanel SHALL 在 DOM 更新后通过 requestAnimationFrame 恢复缓存的 scrollTop
3. WHEN currentPath 变化且 pathCache 中不存在该路径的缓存时，THE TabPanel SHALL 显示 loading 状态并发起文件列表加载
4. WHEN 缓存命中并完成渲染后，THE TabPanel SHALL 发起静默刷新获取最新文件列表

### 需求 6：静默刷新与竞态安全

**用户故事:** 作为用户，我希望缓存数据在后台自动更新为最新状态，同时快速连续导航不会导致数据错乱。

#### 验收标准

1. THE loadFilesSilent 函数 SHALL 在发起 API 请求时不触发 loading 状态变更
2. WHEN loadFilesSilent 的 API 响应返回时，THE loadFilesSilent 函数 SHALL 检查响应对应的路径是否仍等于当前 currentPath
3. IF loadFilesSilent 的响应路径与当前 currentPath 不一致，THEN THE loadFilesSilent 函数 SHALL 丢弃该响应不做任何更新
4. WHEN loadFilesSilent 成功获取最新数据且路径匹配时，THE loadFilesSilent 函数 SHALL 更新 files 状态和 pathCache 中对应条目

### 需求 7：滚动位置上报

**用户故事:** 作为用户，我希望滚动位置被持续跟踪，以便在任何时刻离开目录都能保存准确的滚动位置。

#### 验收标准

1. WHEN 用户在 FileList 中滚动时，THE FileList SHALL 通过 onScrollChange 回调上报当前 scrollTop 值
2. THE FileList SHALL 对 onScroll 事件进行节流处理，节流间隔为 150 毫秒

### 需求 8：watch 回调缓存同步

**用户故事:** 作为用户，我希望文件系统的实时变更能同步更新到缓存中，以便缓存数据保持最新。

#### 验收标准

1. WHEN fsService.watch 回调触发文件列表更新时，THE TabPanel SHALL 同时更新 files 状态和 pathCache 中当前路径的缓存条目
2. WHEN fsService.watch 回调更新缓存时，THE TabPanel SHALL 保持当前的 scrollTop 值不变

### 需求 9：Tab 关闭缓存释放

**用户故事:** 作为用户，我希望关闭标签页后相关缓存自动释放，以便不会造成内存泄漏。

#### 验收标准

1. WHEN 用户关闭一个 FileManagerTab 时，THE 系统 SHALL 从 fmTabs 数组中移除该 Tab 对象，使其 pathCache 随 JavaScript 垃圾回收自动释放

### 需求 10：静默刷新失败处理

**用户故事:** 作为用户，我希望后台刷新失败时不影响已显示的缓存内容，以便我仍然可以正常浏览。

#### 验收标准

1. IF loadFilesSilent 的 API 请求失败，THEN THE loadFilesSilent 函数 SHALL 仅记录错误日志，不修改当前 files 状态和已渲染的视图
