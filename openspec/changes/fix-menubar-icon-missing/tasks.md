## 1. Tray Icon Assets

- [x] 1.1 Add tracked menu bar template icon assets for the normal and paused states, including Retina-friendly sizes.
- [x] 1.2 Update the packaging resource configuration so the tray icon assets are available to the packaged macOS app.

## 2. Main Process Tray Loading

- [x] 2.1 Refactor `src/main/tray.ts` to load file-backed menu bar icons through a single resolver that works in both development and packaged modes.
- [x] 2.2 Add fallback icon creation and clear logging when the preferred tray icon asset cannot be loaded.
- [x] 2.3 Keep the existing left-click toggle, context menu actions, and paused-state icon switching while using the new icon loading path.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` after the tray icon changes and fix any typing regressions.
- [x] 3.2 Smoke test `npm run dev` on macOS to confirm the menu bar icon is visible and changes between normal and paused states.
- [x] 3.3 Build and launch the packaged app to confirm the menu bar icon assets are present and the icon remains visible after packaging.
