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
npm run build:mac              # Build macOS .dmg + .zip with code signing

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

### Database Schema

Single table `clip_items`:

- Fields: id (UUID), type, content, plain_text, ocr_text, source_app, title, thumbnail, link_meta, is_pinned, created_at, etc.
- FTS5 index on plain_text, title, ocr_text, link_text
- Path: `Electron.app.getPath('userData')/clipmate.db`

### Key Data Flows

1. **Clipboard capture**: Watcher polls → detect type → write to SQLite → broadcast `history:mutation` to all windows
2. **Panel show**: Build snapshot (last 200 items + metadata) → reconcile clipboard → render
3. **Direct paste**: Hide panel → restore prior app → write to clipboard → inject `Cmd+V` via osascript → suppress capture temporarily
4. **Search**: FTS5 full-text search or LIKE fallback on pre-built summary fields

### IPC Communication

All IPC channels defined in `src/preload/index.ts` and handled in `src/main/ipc/`.

Key patterns:

- Renderer invokes via `window.api.methodName()`
- Main broadcasts events via `webContents.send('event:name', data)`
- Context isolation enabled, no node integration in renderer

## Platform Constraints

**macOS-only dependencies:**

- osascript for paste simulation and app switching
- Vision framework for OCR (Swift helper: `resources/ocr/vision_ocr.swift`)
- Quick Look integration
- Menubar/tray behavior
- Accessibility permission required for auto-paste
- Screen recording permission for content protection

**Swift OCR helper:**

- Source: `resources/ocr/vision_ocr.swift`
- Build: `npm run build:ocr-helper` compiles to `build/generated-resources/ocr/vision_ocr`
- Packaged builds bundle precompiled universal binary

## Code Modification Patterns

### When modifying clipboard capture

- Update `src/main/clipboard/watcher.ts` for polling logic
- Update `src/main/clipboard/content.ts` for type detection
- Broadcast `history:mutation` events after database writes
- Test with `npm run smoke:panel`

### When modifying panel UI

- Main panel: `src/renderer/src/App.vue` (>3k lines, high-risk area)
- Update `src/shared/types.ts` for new data structures
- Panel snapshot logic: `src/main/panelSnapshot.ts`
- Test panel show/hide, search, filters, card selection

### When adding IPC handlers

1. Define handler in `src/main/ipc/`
2. Register in `src/main/ipc/index.ts`
3. Expose via `src/preload/index.ts` contextBridge
4. Update `src/shared/types.ts` for type safety
5. Use parameterized queries for database operations

### When modifying OCR

- Worker: `src/main/ocr/worker.ts`
- Runtime: `src/main/ocr/runtime.ts` (uses `execFile`, not `exec`)
- Verification: `npm run verify:ocr` (requires fixtures)
- Image storage: `src/main/ocr/imageStorage.ts`
