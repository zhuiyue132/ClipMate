# ClipMate - Todo List

> Mac 剪贴板管理工具 | Electron + Vue3 + Vite

---

## 🏗️ Phase 0 · 项目初始化

- [x] 初始化 Electron + Vue3 + Vite 项目结构
- [x] 配置 electron-builder 打包配置（macOS .dmg / .app）
- [x] 配置 Vite 多进程构建（main / preload / renderer）
- [x] 配置 IPC 通信层（main ↔ renderer）
- [x] 配置 SQLite 本地数据库（better-sqlite3）
- [x] 配置 ESLint + Prettier + Husky
- [x] 搭建基础窗口管理（主窗口 + 悬浮窗口）
- [x] 配置 macOS 系统权限申请（辅助功能 / 屏幕录制）

---

## 📋 Phase 1 · 核心剪贴板引擎

- [x] 实现剪贴板监听器（轮询 / native API）
- [x] 识别并区分剪贴板内容类型：文本 / 富文本 / 链接 / 图片 / 文件 / 颜色值
- [x] 自动保存复制内容到本地数据库
- [x] 去重逻辑：连续复制相同内容只保存一条
- [x] 实现"暂停收集"开关（Pause Paste）
- [x] 基础历史记录列表展示（时间倒序）
- [x] 点击 item 直接粘贴到当前应用（Direct Paste）
- [x] 支持纯文本粘贴（去除富文本格式）
- [x] 全局快捷键呼出 / 收起主面板

---

## 🗂️ Phase 2 · Pinboard（固定板）

- [x] 创建 / 重命名 / 删除 Pinboard
- [x] 将任意 item Pin 到指定 Pinboard
- [x] Pinboard 列表侧边栏展示
- [x] Pinboard 内 item 排序（手动拖拽排序）
- [x] 从 Pinboard 中移除 item
- [x] Pinboard 内容持久化到本地数据库

---

## 🔍 Phase 3 · 搜索功能

- [x] 实时全文搜索历史记录
- [x] 搜索结果高亮关键词
- [x] 按内容类型过滤（文本 / 图片 / 链接 / 文件）
- [x] 按来源应用过滤
- [x] 按日期范围过滤（今天 / 本周 / 自定义）
- [x] 图片 OCR 文字识别并加入搜索索引（Vision framework）

---

## 👁️ Phase 4 · 预览与编辑

- [x] 空格键快速预览 item（Quick Look 风格）
- [x] 文本 item 内联编辑
- [x] 链接 item 内置 WebView 预览
- [x] 链接自动抓取元数据（标题 + 缩略图）
- [x] 图片预览 + 旋转操作
- [x] 颜色值预览 + 内置颜色选择器调整
- [x] item 重命名
- [x] item 右键上下文菜单（复制 / 固定 / 重命名 / 删除 / 分享）
- [x] 多选 item（Shift / Cmd + 点击）执行批量操作

---

## 📦 Phase 5 · Paste Stack（顺序粘贴）

- [ ] 进入 Stack 模式：依次复制多项内容入队列
- [ ] 按顺序逐一自动粘贴
- [ ] Stack 队列可视化展示
- [ ] 随时取消 / 重置 Stack

---

## 🖼️ Phase 6 · 图片增强

- [ ] 图片以缩略图形式展示在历史列表
- [ ] 支持将图片作为文件拖拽到其他应用
- [ ] 支持将图片粘贴为文件（而非内存数据）
- [ ] 文档扫描（调用 iPhone Continuity Camera，存入 Paste）

---

## 🔒 Phase 7 · 隐私与安全

- [ ] 应用排除规则（黑名单 App 的复制内容不被记录）
- [ ] 屏幕共享时隐藏 Paste 窗口
- [ ] 自动识别并忽略系统标记的"机密"剪贴板内容
- [ ] 数据全部本地存储，无网络上传

---

## ☁️ Phase 8 · iCloud 同步

- [ ] 接入 CloudKit / iCloud Drive 同步方案
- [ ] 跨设备同步历史记录与 Pinboard
- [ ] 同步冲突处理策略（last-write-wins）
- [ ] 同步状态展示（同步中 / 已同步 / 离线）

---

## ⌨️ Phase 9 · 快捷键与自动化

- [ ] 全局快捷键管理界面（可自定义所有快捷键）
- [ ] QuickPaste（快速粘贴最近一条）
- [ ] 快捷键循环切换 Pinboard
- [ ] 支持 macOS Shortcuts App 集成（Shortcuts action）
- [ ] 新建文本 / 链接条目（不依赖复制操作）

---

## 🎨 Phase 10 · UI / UX 打磨

- [ ] 菜单栏状态图标 + 右键快捷菜单
- [ ] 可调整窗口大小
- [ ] 紧凑模式（Compact Mode）
- [ ] 深色 / 浅色模式自动跟随系统
- [ ] 窗口跟随鼠标出现在当前 App 旁
- [ ] 流畅的打开 / 关闭动画
- [ ] 列表滚动性能优化（虚拟列表）

---

## ⚙️ Phase 11 · 设置与偏好

- [ ] 通用设置页（开机启动 / 快捷键 / 语言）
- [ ] 隐私设置页（黑名单 App / 屏幕共享 / 机密内容）
- [ ] 存储设置页（历史保留数量 / 自动清理规则）
- [ ] 同步设置页（iCloud 开关 / 同步状态）
- [ ] 数据管理（手动清空历史 / 导出 / 导入）

---

## 🚀 Phase 12 · 打包与发布

- [ ] 代码签名（Apple Developer 证书）
- [ ] Notarization 公证
- [ ] 构建 .dmg 安装包
- [ ] 自动更新机制（electron-updater）
- [ ] 发布到官网 / 提交 Mac App Store 审核
