# ClipMate

> 一个面向 macOS 的本地优先剪贴板管理工具，基于 Electron + Vue 3 + SQLite 构建。

ClipMate 运行在菜单栏，持续监听系统剪贴板，自动保存你复制过的文本、链接、图片、文件和颜色值，并提供搜索、预览、直接粘贴、顺序粘贴、OCR、链接元数据和可选 iCloud Drive 同步能力。

这个仓库目前更接近一个功能完整的 `0.x` 版本，而不是已经完全打磨完成的商业发布版：核心工作流已经跑通，但签名、公证、更新源和少量边缘能力仍需要真实发布环境验证。

## 特性

- 自动捕获剪贴板内容，支持 `text`、`richtext`、`link`、`image`、`file`、`color`
- 连续重复复制去重，只更新时间戳，不重复入库
- 菜单栏常驻 + 底部弹出面板，支持全局快捷键呼出
- 单击历史项选中，双击或回车直接粘贴回上一个前台应用
- 文本与链接条目通过独立预览窗口进入编辑态
- 纯文本粘贴、批量删除、多选、右键菜单、条目重命名
- 实时搜索，支持关键词、内容类型、来源应用、日期范围筛选
- 图片 OCR 文本识别，OCR 结果会进入搜索索引
- 链接自动抓取 Open Graph 元数据，可在预览页重新编辑 URL
- 图片预览、旋转、拖拽到外部应用、按文件形式粘贴
- 文件条目支持系统 Quick Look
- Paste Stack 顺序粘贴模式，支持队列可视化、重排、清空
- 应用排除、忽略机密剪贴板、窗口内容保护等隐私设置
- 本地 SQLite 存储，可选 iCloud Drive JSON 同步
- 打包版支持 `electron-updater` 通用更新源

## 当前状态

- 平台：仅 macOS
- 阶段：`v0.1.0`，核心能力已具备，仍在持续打磨
- 数据策略：本地优先，云同步默认关闭
- 参考文档：
  - [产品需求文档](./docs/prd.md)
  - [开发 Todo / 路线图](./docs/todo.md)
  - [发布说明](./docs/release.md)

## 快速开始

### 运行环境

- macOS
- Node.js 20+
- npm 10+
- 建议安装 Xcode Command Line Tools

说明：

- 开发模式下，如果本机没有 `swift`，应用仍可运行，但 OCR worker 不会启动。
- 打包脚本会编译并打包一个 macOS Vision OCR helper。

### 本地开发

```bash
npm ci
npm run dev
```

常用脚本：

```bash
npm run typecheck
npm run lint
npm run build
npm run build:unpack
npm run build:mac
```

### 打包发布

仓库内已包含 macOS 打包配置、通用二进制构建、GitHub Actions 发布工作流，以及自动更新集成。

本地构建：

```bash
npm ci
npm run typecheck
npm run build:mac
```

如果需要签名、公证和自动更新，请参考 [docs/release.md](./docs/release.md)，并配置以下环境变量：

```bash
export CSC_LINK="/path/to/developer-id.p12"
export CSC_KEY_PASSWORD="your-cert-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
export CLIPMATE_UPDATE_URL="https://updates.example.com/clipmate"
```

## 默认快捷键

| 动作                    | 默认快捷键                 |
| ----------------------- | -------------------------- |
| 呼出 / 收起主面板       | `Cmd + Shift + V`          |
| 快速粘贴最近一条        | `Cmd + Shift + Option + V` |
| 以纯文本粘贴最近一条    | `Cmd + Shift + Option + P` |
| 开启 / 关闭 Paste Stack | `Cmd + Shift + S`          |
| 暂停 / 恢复采集         | `Cmd + Shift + P`          |
| 聚焦搜索框              | `Cmd + F`                  |
| 新建文本条目            | `Cmd + N`                  |
| 新建链接条目            | `Cmd + Shift + N`          |
| Paste Stack 逐项粘贴    | `Cmd + V`                  |

说明：

- `Cmd + V` 只会在 Paste Stack 已启用且队列非空时被接管。
- 快捷键都可以在设置页修改。

## 权限与隐私

ClipMate 的设计目标是“本地优先、默认克制”：

- 数据默认写入本地 SQLite 数据库，不依赖外部服务
- 自动粘贴依赖 macOS 辅助功能权限
- 屏幕共享保护当前主要基于 Electron 窗口内容保护
- 可配置应用排除列表，避免记录密码管理器等应用内容
- 可以忽略系统标记为 concealed / transient 的剪贴板内容
- iCloud 同步是可选项，当前通过 iCloud Drive 下的 JSON 文件完成合并同步

当前 iCloud 同步文件路径为：

```text
~/Library/Mobile Documents/com~apple~CloudDocs/ClipMate/clipmate-history.json
```

## 架构概览

### 技术栈

- Electron 33
- Vue 3
- electron-vite
- better-sqlite3
- electron-builder
- electron-updater

### 进程结构

```text
src/main
├── clipboard      # 剪贴板捕获、写回、Paste Stack、拖拽与粘贴
├── database       # SQLite 初始化与条目读写
├── ipc            # main/preload/renderer 通信入口
├── linkMeta       # 链接元数据抓取
├── ocr            # Vision OCR worker
├── settings       # 设置读写与快照
├── sync           # iCloud Drive 同步
├── system         # 前台应用、Quick Look、权限、应用图标
└── windows        # 主面板、预览窗、设置窗、Stack Dock

src/preload        # contextBridge API
src/renderer       # Vue 界面
resources/ocr      # Vision OCR Swift 源码
docs               # PRD、路线图、发布说明
```

### 数据流

1. `ClipboardWatcher` 轮询检测系统剪贴板变化
2. 自动识别内容类型并写入 SQLite
3. OCR / Link Meta worker 在后台补充异步信息
4. Renderer 通过 preload API 获取历史记录、设置和窗口状态
5. 直接粘贴 / 顺序粘贴通过恢复前台应用并触发 `Cmd + V` 完成

## 已实现能力

- 剪贴板监听、历史记录、去重和保留策略
- 搜索、类型过滤、来源应用过滤、日期过滤
- 预览与编辑：文本、链接、图片、文件、颜色
- Paste Stack 顺序粘贴与独立 Dock 窗口
- 菜单栏、设置页、权限状态展示、快捷键配置
- iCloud Drive 同步、自动更新状态展示、发布工作流

更细的完成度和待补项可直接查看 [docs/todo.md](./docs/todo.md)。

## 已知限制

- 仅支持 macOS，未适配 Windows / Linux
- OCR 在开发态依赖本机 `swift`；正式分发依赖打包时生成的 helper
- 自动更新只在打包版本中可用，开发模式下不可用
- “屏幕共享隐藏”当前主要依赖窗口内容保护，不是完整的共享状态感知方案
- 签名、公证、更新源联调、官网 / App Store 发布仍依赖外部账号和真实发布环境
- 目前仓库以类型检查和手动验证为主，尚未建立完整自动化测试体系

## Roadmap

- 补齐少量边缘能力的端到端验证
- 完善发布链路中的签名、公证与自动更新实机验证
- 增加更系统的自动化测试
- 继续打磨 UI、动画和多显示器场景表现

## 贡献

欢迎提交 Issue 和 PR。提交前建议先执行：

```bash
npm run typecheck
npm run lint
```

如果你的修改涉及打包、OCR、自动更新或系统权限，最好在 macOS 真机上补充一轮手动验证。

## License

MIT
