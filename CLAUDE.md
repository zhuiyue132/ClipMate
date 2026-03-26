# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClipMate is a macOS-only clipboard manager built with Electron 33 + Vue 3 + SQLite. It captures clipboard history, provides full-text search, OCR for images, link metadata extraction, and iCloud sync.

## Development Commands

```bash
# Setup
npm ci

# Development
npm run dev                    # Start electron-vite dev server (do not run this yourself)
npm run typecheck              # Type check all code
npm run lint                   # Lint and auto-fix
npm run format                 # Format with prettier

# Building
npm run build                  # Production build
npm run build:ocr-helper       # Compile Swift OCR helper
npm run build:mac              # Build macOS .dmg + .zip (includes OCR helper)

# Testing & Verification
npm run verify:ocr             # Run OCR fixture tests (macOS only)
npm run smoke:panel            # Run panel interaction smoke test
npm run perf:benchmark         # Benchmark history performance

# Utilities
npm run ocr:reprocess          # Reprocess OCR for images
```

## Architecture

### Entry Points

- **Main process**: `src/main/index.ts` - App initialization, coordinates all subsystems
- **Preload**: `src/preload/index.ts` - contextBridge API for renderer IPC
- **Renderer**: `src/renderer/src/App.vue` - Main panel UI (>3k lines)
- **Shared types**: `src/shared/types.ts` - All TypeScript interfaces

### Main Process Structure

```
src/main/
├── clipboard/      - Watcher (220ms polling), content detection, paste simulation
├── database/       - SQLite with FTS5 search, clip_items table
├── ipc/            - IPC handler registration
├── ocr/            - Vision OCR worker (Swift helper or fallback)
├── linkMeta/       - Link metadata extraction worker
├── sync/           - iCloud Drive JSON sync (last-write-wins)
├── system/         - Frontmost app, Quick Look, permissions, app icons
├── windows/        - Window management (main, preview, settings, stack dock)
├── settings/       - Settings persistence (userData/settings.json)
├── history/        - Retention policies
├── shortcuts.ts    - Global keyboard shortcuts
├── tray.ts         - Menubar tray
└── index.ts        - Main orchestrator
```

### Renderer Structure

- `App.vue` - Main panel (horizontal card flow, search, filters)
- `PreviewView.vue` - Preview/edit window
- `SettingsView.vue` - Settings UI (5 tabs)
- `StackDockView.vue` - Paste Stack visualization
- Hash-based routing via `window.location.hash` (no router library)

### Database

Single table `clip_items` in SQLite (WAL mode, FTS5 full-text search):

- Fields: id (UUID), type, content, plain_text, ocr_text, source_app, title, thumbnail, link_meta, is_pinned, created_at, etc.
- FTS5 index on plain_text, title, ocr_text, link_text
- Path: `Electron.app.getPath('userData')/clipmate.db`
- Search/summary logic: `src/main/database/clipItems.ts` - don't re-process in renderer

### Key Data Flows

1. **Clipboard capture**: Watcher polls → detect type → write to SQLite → broadcast `history:mutation` to all windows
2. **Panel show**: Build snapshot (last 200 items + metadata) → reconcile clipboard → render
3. **Direct paste**: Hide panel → restore prior app → write to clipboard → inject `Cmd+V` via osascript → suppress capture temporarily
4. **Search**: FTS5 full-text search or LIKE fallback on pre-built summary fields

### IPC Communication

All IPC channels defined in `src/preload/index.ts` and handled in `src/main/ipc/`. The stable boundary between Main/Renderer is `src/shared/types.ts` + the preload IPC API.

- Renderer invokes via `window.api.methodName()`
- Main broadcasts events via `webContents.send('event:name', data)`
- Context isolation enabled, no node integration in renderer

## Platform Constraints

- osascript for paste simulation and app switching
- Vision framework for OCR (Swift helper: `resources/ocr/vision_ocr.swift`)
- Quick Look, Menubar/tray, Accessibility permission (auto-paste), Screen recording permission (content protection)
- OCR in dev requires local Swift toolchain; packaged builds bundle precompiled universal binary
- Auto-update only works in packaged app, not dev mode

## Code Modification Guidelines

### New features cross boundaries

New capabilities often touch `shared types → preload → ipc → main → renderer` as a chain. Assess the full path before starting.

### App.vue is the maintenance hotspot

At >3k lines, avoid adding more logic here. Prioritize controlling scope and consider extraction.

### Search and summaries live in the database layer

`src/main/database/clipItems.ts` handles FTS, summary building, and queries. Don't replicate data processing in renderer.

### When adding IPC handlers

1. Define handler in `src/main/ipc/`
2. Register in `src/main/ipc/index.ts`
3. Expose via `src/preload/index.ts` contextBridge
4. Update `src/shared/types.ts` for type safety
5. Use parameterized queries for database operations

### OCR modifications

- Worker: `src/main/ocr/worker.ts`
- Runtime: `src/main/ocr/runtime.ts` (uses `execFile`, not `exec`)
- Verification: `npm run verify:ocr` (requires fixtures)

### Real macOS testing required

Changes to clipboard, shortcuts, or app switching need real macOS behavior validation - don't rely solely on code reading.

### Distinguish "wired" vs "validated"

For packaging, signing, notarization, auto-update, and system permissions: distinguish between "implementation exists in code" and "tested in actual release environment."

## Tech Stack

- **Electron**: 33, **Vue**: 3.5 (Composition API with `<script setup>`), **TypeScript**: strict mode
- **Database**: better-sqlite3 with WAL, FTS5
- **Build**: electron-vite + electron-builder
- **Icons**: @tabler/icons-vue (UI), dynamic app icons via system API
- **Linting**: ESLint 9 flat config + Prettier (semi: false, singleQuote: true, printWidth: 100)
- **Pre-commit**: Husky + lint-staged

## Terminology

- 主面板 (main panel): the clipboard card window
- 预览面板 (preview panel): the preview window opened from a clip item card
- 设置面板 (settings panel): the settings window

## Additional Documentation

- Product overview: `README.md`
- PRD: `docs/prd.md`
- Release guide: `docs/release.md`
- Agent guidance: `AGENTS.md`
- Detailed context: `.codex/project-context.md`
