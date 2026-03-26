## Why

ClipMate 作为一个常驻型剪贴板工具，主价值不只是“功能齐”，而是任何时候呼出、滚动、搜索、复制和预览都要足够顺滑，不能让用户感觉到明显卡顿。当前实现里主进程、IPC、数据库和渲染层都存在高频全量刷新与同步阻塞路径，已经直接损伤了产品的商业级体验，需要一次系统性的性能优化来把响应速度和稳定性都拉起来。

## What Changes

- 为主面板打开、列表滚动、搜索筛选、批量操作和预览切换建立明确的交互性能要求，避免“功能可用但手感发涩”继续成为默认状态。
- 将主面板数据准备与条目变更同步从“整量快照 + 整量重拉”改为增量化、分层化的数据路径，减少大对象跨 IPC 传输和渲染层重复工作。
- 优化历史列表数据模型与查询方式，避免列表首屏和搜索阶段传输完整图片内容、链接元数据和其他重字段，改为按场景加载。
- 调整主窗口显示动画、剪贴板监听、图标提取和后台元数据任务的调度方式，减少主线程阻塞与无效 CPU 消耗。
- 增加针对关键交互链路的性能验证要求，用可重复的指标证明打开速度、搜索响应和空闲占用有明显改善。

## Capabilities

### New Capabilities

- `panel-performance`: 定义主面板打开、滚动、搜索、选择和预览入口在常规历史规模下必须保持流畅响应的行为要求。
- `incremental-history-sync`: 定义面板数据准备与历史变更广播必须采用增量同步和轻量载荷，避免每次变化都重建整份面板状态。
- `background-work-efficiency`: 定义剪贴板监听、应用图标提取、OCR / 链接元数据补全等后台工作必须避免长时间阻塞主线程，并在空闲时保持可接受资源占用。

### Modified Capabilities

- None.

## Impact

- Affected code: `src/renderer/src/App.vue`, `src/renderer/src/PreviewView.vue`, `src/preload/index.ts`, `src/main/index.ts`, `src/main/panelSnapshot.ts`, `src/main/windows/mainWindow.ts`, `src/main/clipboard/index.ts`, `src/main/clipboard/watcher.ts`, `src/main/ipc/databaseHandlers.ts`, `src/main/ipc/systemHandlers.ts`, `src/main/system/appIcons.ts`, `src/main/database/clipItems.ts`
- Affected data flow: panel snapshot loading, clip item change notifications, search/filter queries, app icon hydration, preview/detail fetching
- Affected systems: Electron main process responsiveness, IPC payload size, SQLite query efficiency, renderer render/update cost, background polling and enrichment workers
- Verification impact: 需要补充性能基线与回归验证，包括主面板展示时延、搜索反馈时延、列表操作流畅度以及空闲 CPU 占用
