# 实现任务

## 任务 1：类型定义与纯函数
- [x] 1.1 在 types/index.ts 中新增 PathViewState 接口，扩展 FileManagerTab 增加 pathCache 字段
- [x] 1.2 创建 pathCache 工具函数文件，实现 setPathCache 和 getPathCache 纯函数（含 LRU 淘汰，上限 50）

## 任务 2：Store 层扩展
- [x] 2.1 在 store.ts 的 addFmTab 中为 newTab 初始化 pathCache: {}

## 任务 3：TabPanel 导航保存视图状态
- [x] 3.1 改造 navigateTo、goBack、goForward、handleNavigateNode，在切换路径前保存当前 files 和 scrollTop 到 pathCache

## 任务 4：TabPanel 缓存恢复与静默刷新
- [x] 4.1 改造 currentPath 变化的 useEffect：缓存命中时立即渲染缓存 files 并设置 pendingScrollRef，缓存未命中时清空 files 并显示 loading
- [x] 4.2 新增 loadFilesSilent 函数（不触发 loading，带竞态检查）
- [x] 4.3 新增滚动恢复 useEffect：files 更新后通过 requestAnimationFrame 恢复 pendingScrollRef

## 任务 5：FileList 滚动位置上报
- [x] 5.1 FileList 新增 onScrollChange prop，添加 150ms 节流的 onScroll 处理
- [x] 5.2 TabPanel 传入 onScrollChange 回调，实时更新 pathCache 中当前路径的 scrollTop

## 任务 6：watch 回调缓存同步
- [x] 6.1 改造 fsService.watch 回调，更新 files 的同时同步更新 pathCache（保持 scrollTop 不变）

## 任务 7：loadFiles 写入缓存
- [x] 7.1 改造 loadFiles 和 task 完成刷新逻辑，加载完成后将结果写入 pathCache
