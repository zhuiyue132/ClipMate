## 1. Baseline And Contracts

- [x] 1.1 Add shared types and IPC contracts for history summaries, mutation events, and panel performance markers.
- [x] 1.2 Capture the current baseline for panel-open latency, search response time, scroll smoothness, and idle CPU usage before the refactor.

## 2. Lightweight History Data Path

- [x] 2.1 Introduce summary-oriented database queries and mappers so the panel list no longer depends on full `ClipItem` payloads by default.
- [x] 2.2 Add normalized text-search support with an FTS-backed path and a lightweight fallback that excludes heavyweight content fields.
- [x] 2.3 Update panel snapshot creation and search IPC handlers to return summary payloads while preserving id-based full-detail reads for preview and edit flows.

## 3. Incremental Renderer Synchronization

- [x] 3.1 Replace full-history refresh events with structured history mutation events for add, update, delete, reset, and derived metadata changes.
- [x] 3.2 Refactor the panel renderer state so history updates patch the local summary store without resetting selection, active card, or scroll position.
- [x] 3.3 Update preview, inline edit, and other detail actions to fetch full item data lazily only when the action requires original content.

## 4. Interaction And Background Work

- [x] 4.1 Replace the main-process timer-driven panel animation with a native or renderer-driven transition that reduces frame-loop work on the Electron main thread.
- [x] 4.2 Decouple panel first paint from clipboard catch-up so the panel can appear immediately and receive follow-up summary mutations if fresher clipboard data arrives.
- [x] 4.3 Rework source-app icon loading into an asynchronous, cached, visible-card-scoped queue that does not block panel interaction.
- [x] 4.4 Implement adaptive clipboard watcher scheduling and patch-based OCR / link metadata updates to reduce idle overhead and avoid full list refreshes.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm run build` after the refactor and fix any regressions in shared types, IPC wiring, or renderer state.
- [x] 5.2 Smoke test panel open, history scrolling, search, preview, edit, and live clipboard updates with a mixed dataset to confirm the new incremental behavior is correct.
- [x] 5.3 Compare the post-change panel-open, search, and idle-resource metrics against the baseline and record whether the improvement is materially noticeable.
