# ClipMate Project Context

最后更新：2026-03-26

## 1. 这个项目是什么

- `ClipMate` 是一个仅面向 macOS 的本地优先剪贴板管理工具。
- 技术栈是 `Electron 33 + Vue 3 + electron-vite + better-sqlite3`。
- 产品形态是菜单栏常驻应用，核心能力包括剪贴板采集、搜索、直接粘贴、Paste Stack、OCR、链接元数据、可选 iCloud Drive 同步和打包版自动更新。

## 2. 先看哪几个文件

- 应用启动与主流程编排：`src/main/index.ts`
- Main/Renderer 契约：`src/shared/types.ts`
- Preload 暴露 API：`src/preload/index.ts`
- 剪贴板采集与粘贴：`src/main/clipboard/index.ts`
- 剪贴板轮询与去重：`src/main/clipboard/watcher.ts`
- SQLite 初始化：`src/main/database/index.ts`
- 条目 CRUD / FTS 搜索 / summary 构建：`src/main/database/clipItems.ts`
- 设置持久化与默认值：`src/main/settings/store.ts`
- 全局快捷键注册：`src/main/shortcuts.ts`
- 主面板窗口动画与定位：`src/main/windows/mainWindow.ts`
- 渲染层主界面：`src/renderer/src/App.vue`
- 设置页：`src/renderer/src/SettingsView.vue`
- 预览页：`src/renderer/src/PreviewView.vue`

## 3. 主业务链路

### 3.1 采集链路

1. `src/main/index.ts` 在 app ready 后初始化数据库、设置、IPC、窗口、托盘、同步、更新器、OCR 和链接元数据 worker。
2. `startClipboardWatcher()` 启动 `ClipboardWatcher`，默认轮询间隔 `220ms`，并根据活跃度动态调整。
3. `src/main/clipboard/content.ts` 读取系统剪贴板并识别类型。
4. `src/main/clipboard/watcher.ts` 做两阶段确认、重复内容去重、排除应用过滤、concealed 内容过滤。
5. 新条目写入 `clip_items`，然后通过 `history:mutation` 广播给所有窗口。

### 3.2 面板展示链路

1. 主窗口呼出前，`showMainWindowFromCurrentApp()` 会记录前台 App、构建 `PanelSnapshot`、发送性能 mark。
2. `buildPanelSnapshot()` 当前会直接取最近 `200` 条历史 + source apps + Paste Stack 状态。
3. Renderer 在 `App.vue` 中接收 `window:preparePanelShow` 和 `history:mutation`，优先增量更新，再在必要时全量刷新。
4. 历史列表不是传统纵向列表，而是横向卡片流，并做了简单虚拟化。

### 3.3 直接粘贴链路

1. Renderer 调 `window.api.pasteClipItem()`。
2. Main 隐藏面板，恢复先前前台 App。
3. 将条目写回系统剪贴板后，通过 `osascript` 发送 `Cmd+V`。
4. 为避免自触发回采，watcher 会暂时 suppress capture。

### 3.4 搜索链路

- 搜索索引在 `src/main/database/clipItems.ts` 里，优先使用 SQLite `fts5`。
- 索引字段覆盖 `plain_text`、`title`、`ocr_text`、`link_text`。
- FTS 初始化失败时会降级为 `LIKE` 搜索。
- Renderer 只在有 query 时走远端搜索；纯筛选时在前端已有数据上过滤。

## 4. 数据与本地文件

### 4.1 SQLite

- 数据库路径：Electron `userData/clipmate.db`
- 表：`clip_items`
- 当前是单表模型，没有复杂关系表。
- 已开启 `WAL` 与 `foreign_keys = ON`。
- 历史保留策略由 `src/main/history/retention.ts` 在写入后执行。

### 4.2 设置

- 设置文件路径：Electron `userData/settings.json`
- 默认配置在 `src/main/settings/store.ts`
- 更新设置会立即触发副作用：快捷键重注册、开机启动、内容保护、保留策略、iCloud 同步、托盘刷新、设置广播。

### 4.3 iCloud 同步

- 不是 CloudKit API；当前实现是 iCloud Drive 下的 JSON 文件合并。
- 文件路径：`~/Library/Mobile Documents/com~apple~CloudDocs/ClipMate/clipmate-history.json`
- 合并策略：按 `updated_at` 做 last-write-wins。

## 5. 常见改动入口速查

### 5.1 改剪贴板采集规则

- `src/main/clipboard/content.ts`
- `src/main/clipboard/watcher.ts`
- 如新增新类型，通常还要联动：
  - `src/shared/types.ts`
  - `src/main/database/index.ts`
  - `src/main/database/clipItems.ts`
  - `src/main/clipboard/io.ts`
  - Renderer 卡片与预览组件

### 5.2 改搜索、筛选、预览摘要

- 搜索 SQL / FTS / summary 逻辑都在 `src/main/database/clipItems.ts`
- 面板搜索交互和筛选状态主要在 `src/renderer/src/App.vue`

### 5.3 改快捷键

- 类型定义：`src/shared/types.ts`
- 默认值：`src/main/settings/store.ts`
- 注册逻辑：`src/main/shortcuts.ts`
- 设置界面：`src/renderer/src/SettingsView.vue`

### 5.4 改面板性能或首屏体验

- 主进程首屏快照：`src/main/panelSnapshot.ts`
- 性能事件：`src/main/index.ts` + `src/main/events.ts`
- 虚拟列表和卡片渲染：`src/renderer/src/App.vue`
- 冒烟回归：`src/main/smoke/panelFlow.ts`

### 5.5 改预览窗口或多窗口行为

- 窗口创建：`src/main/windows/*`
- 路由加载方式：`src/main/windows/common.ts`
- Preview / Settings / Stack Dock 都是通过 hash route 进入同一个 renderer 入口

### 5.6 改托盘、图标或菜单栏交互

- `src/main/tray.ts`
- 应用图标与普通态托盘图标现在以 `build/iconset-source/clipmate.iconset` 为源，通过 `build/prepare-icons.mjs` 生成 `build/icon.icns`、`build/icon.png` 和 `build/tray/clipmate-tray*.png`
- 暂停态托盘图标不参与生成，固定使用项目内的 `build/tray/clipmate-tray-paused.png`
- 打包资源来自 `build/tray/*`，同时内置 fallback icon
- Renderer 侧统一使用 `@tabler/icons-vue`，图标封装在 `src/renderer/src/components/UiIcon.vue`
- 历史卡片来源应用图标仍通过 `system:getAppIcons` 动态获取，不走第三方图标库

### 5.7 改 OCR、链接元数据、同步或自动更新

- OCR：`src/main/ocr/worker.ts`
- Link Meta：`src/main/linkMeta/worker.ts`
- iCloud 同步：`src/main/sync/icloudDrive.ts`
- 自动更新：`src/main/updater/index.ts`

## 6. 当前工程上最值得记住的事实

- 平台强绑定 macOS。很多核心能力依赖 `osascript`、`open -b`、Vision OCR、Quick Look 和菜单栏行为。
- 渲染层主面板高度集中在 `src/renderer/src/App.vue`，文件已超过 `3k` 行。改动这里时要优先控制范围，避免顺手继续堆逻辑。
- Main/Renderer 的稳定边界不是组件，而是 `src/shared/types.ts` + `src/preload/index.ts` 暴露的 IPC API。
- 主面板首屏为了性能，采用“先 snapshot 再 reconcile clipboard”的模式，不是每次展示时都等完整刷新。
- 数据层已经有 FTS 和 summary 预处理，不要在 Renderer 重复做重搜索或大字段转换。
- 同步能力目前偏“工程可用”，不是成熟的多端同步产品设计，冲突策略非常简单。

## 7. 当前高风险/高价值关注点

- 自动化测试体系还不完整。仓库主要依赖 `typecheck`、`lint` 和可选的 panel smoke test。
- `App.vue` 是明显的维护热点，继续增量功能时应优先考虑拆分状态和交互职责。
- 屏幕共享隐藏、签名、公证、自动更新等发布能力在文档中已说明仍需真实环境验证，不能只看仓库代码就视为 fully done。
- OCR 在开发态依赖本机 `swift` 或预编译 helper；本地环境缺失时功能会静默不可用。
- 自动更新只在打包版可用，开发态无法真实验证。

## 8. 当前最有用的命令

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
npm run build:icons
npm run build:unpack
npm run build:mac
CLIPMATE_SMOKE_TEST=1 electron-vite preview
```

说明：

- `build:mac` 会先准备 OCR helper，再执行 Electron 打包。
- `CLIPMATE_SMOKE_TEST=1 electron-vite preview` 会在预览态跑 `src/main/smoke/panelFlow.ts` 的面板冒烟流程。

## 9. 文档与规格现状

- 产品说明：`README.md`
- PRD：`docs/prd.md`
- 进度与复核待办：`docs/todo.md`
- 发布说明：`docs/release.md`
- OpenSpec 当前没有活跃 change，只有 `openspec/specs/*` 和 `openspec/changes/archive/*` 历史记录。

## 10. 后续协作建议

- 新需求先判断是否触及 `shared types + preload + ipc + database + App.vue` 这一整条链，很多功能看似 UI 改动，实际会跨边界。
- 任何涉及粘贴、快捷键、前台应用切换的改动，都要以真实 macOS 行为为准，不能只依赖逻辑阅读。
- 任何涉及发布、权限、更新、OCR 的结论，都应区分“仓库内已接线”与“真实环境已验证”。
