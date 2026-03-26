# panel-performance Specification

## Purpose

TBD - created by archiving change optimize-interaction-performance. Update Purpose after archive.

## Requirements

### Requirement: ClipMate panel opens with progressive hydration and remains interactive

The ClipMate desktop app SHALL show the main panel from a lightweight history snapshot and MUST keep the panel interactive while any remaining clipboard reconciliation or detail hydration continues in the background.

#### Scenario: Panel open does not wait for full history payload

- **WHEN** the user opens the ClipMate panel while the history contains mixed text, image, link, and file items
- **THEN** ClipMate shows the panel shell and a usable history list from lightweight summary data before any non-essential detail payload finishes loading

#### Scenario: Clipboard catch-up arrives after the panel is already visible

- **WHEN** the clipboard watcher detects a new item during the panel-open reconciliation window
- **THEN** ClipMate inserts or updates the affected history card as a follow-up change instead of delaying the first visible panel frame

### Requirement: Panel search and history updates preserve user interaction state

The ClipMate desktop app SHALL update search results, filters, and incoming history changes without resetting unrelated interaction state such as the current selection, active card, or scroll position, unless the affected item is removed from the visible result set.

#### Scenario: Search query updates without clearing unrelated UI state

- **WHEN** the user types a text query or changes a history filter while the panel is open
- **THEN** ClipMate refreshes only the visible result set and keeps unrelated panel controls responsive during the update

#### Scenario: Background history change does not reset browsing context

- **WHEN** a new clipboard item or metadata update arrives while the user is browsing older history cards
- **THEN** ClipMate applies the change without forcing the panel back to the first card or clearing the user's current selection unless the selected item no longer exists

### Requirement: Preview and edit flows load full item details on demand

The ClipMate desktop app SHALL allow the history list to be rendered from summary data and MUST fetch the full `ClipItem` payload only for actions that require the original content, such as preview, full editing, image operations, or original clipboard writes.

#### Scenario: List cards avoid full item payload by default

- **WHEN** the panel renders the history list
- **THEN** each card uses summary fields that are sufficient for the list view and does not require the full original content payload to appear

#### Scenario: Preview loads the full item lazily

- **WHEN** the user opens a preview or edit action for a history entry
- **THEN** ClipMate loads the full item payload for that entry on demand without requiring the entire history list to be upgraded to full objects
