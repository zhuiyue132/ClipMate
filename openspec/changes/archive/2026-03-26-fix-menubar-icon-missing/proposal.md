## Why

ClipMate 已将“菜单栏常驻图标”作为核心交互入口，但当前开发环境和打包后的应用都出现菜单栏图标不显示的问题，导致用户无法通过菜单栏发现应用、打开主面板或识别暂停状态。这个问题直接破坏了产品主流程，需要通过规格和实现一起修复。

## What Changes

- 为 ClipMate 补充菜单栏图标可见性的行为规格，明确开发态与打包态都必须成功创建并显示图标。
- 调整托盘图标加载方案，改为使用可稳定被 macOS 菜单栏识别的图像资源与回退策略，而不是仅依赖运行时生成的模板图。
- 保留现有左键打开面板、右键菜单与暂停状态视觉区分，并把这些行为纳入可验证范围。
- 增加针对图标资源存在性、开发态加载和打包产物携带的验证要求，避免后续回归。

## Capabilities

### New Capabilities

- `menu-bar-icon`: 定义 ClipMate 菜单栏图标在开发态、打包态和暂停状态下的可见性与交互要求。

### Modified Capabilities

- None.

## Impact

- Affected code: `src/main/tray.ts`, `src/main/index.ts`, `electron-builder.config.mjs`, `package.json`
- Affected assets/resources: `build/` 下的应用图标资源与打包附带资源
- Affected behavior: macOS 菜单栏图标显示、暂停状态视觉反馈、开发态与打包态启动体验
- Verification impact: 需要补充开发态运行检查、打包产物检查与基础回归验证
