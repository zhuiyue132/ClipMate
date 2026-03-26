# AGENTS.md

面向后续进入本仓库工作的 agent。

## 1. 启动时先读

- 详细项目上下文：`.codex/project-context.md`
- 结构化扫描结果：`.codex/context-scan.json`

如果你在初始化阶段补充了新的高价值事实，优先更新以上两个文件；只有“长期稳定、值得每次默认加载”的规则才写回本文件。

## 2. 项目事实

- 项目是仅面向 macOS 的 Electron 剪贴板管理工具。
- 主入口：
  - Main：`src/main/index.ts`
  - Preload：`src/preload/index.ts`
  - Renderer：`src/renderer/src/App.vue`
  - Main/Renderer 共享契约：`src/shared/types.ts`
- 关键运行依赖包含 `osascript`、`open -b`、Vision OCR helper / Swift、Quick Look、菜单栏托盘行为。

## 3. 修改时的基本判断

- 涉及新能力时，先判断是否会同时影响 `shared types -> preload -> ipc -> main -> renderer` 这条链。
- 涉及搜索、摘要、列表展示时，先看 `src/main/database/clipItems.ts`，不要先在 renderer 重做数据处理。
- 涉及主面板交互时，优先控制 `src/renderer/src/App.vue` 的改动范围；该文件已很大，避免继续堆积无边界逻辑。
- 涉及粘贴、快捷键、前台应用切换时，默认以真实 macOS 行为验证为准，不要只凭代码阅读下结论。

## 4. 验证优先级

按任务风险选择验证方式，优先使用：

```bash
npm run typecheck
npm run lint
CLIPMATE_SMOKE_TEST=1 electron-vite preview
```

如果改动涉及打包、签名、公证、自动更新、系统权限或 OCR，要明确区分：

- 仓库代码已接线
- 真实发布 / 真机环境已验证

不要混为一谈。
