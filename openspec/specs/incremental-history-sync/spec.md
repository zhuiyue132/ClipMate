# incremental-history-sync Specification

## Purpose

TBD - created by archiving change optimize-interaction-performance. Update Purpose after archive.

## Requirements

### Requirement: History list synchronization uses incremental mutations

The ClipMate desktop app SHALL synchronize history changes between the main process and renderer through structured mutation events or targeted summary fetches, rather than forcing a full recent-history reload for every add, edit, delete, OCR update, or link metadata refresh.

#### Scenario: Single item update only refreshes the affected entry

- **WHEN** one history item is edited, enriched, or re-captured as the latest entry
- **THEN** ClipMate updates only that affected summary record and any directly related derived data instead of reloading the full recent history list

#### Scenario: Reset remains available as an explicit recovery path

- **WHEN** ClipMate detects that incremental synchronization cannot safely reconcile the renderer state
- **THEN** it emits an explicit reset event so the renderer can rebuild the summary store from a fresh snapshot

### Requirement: Search queries operate on lightweight indexed text fields

The ClipMate desktop app SHALL execute history search against dedicated searchable text fields and MUST avoid scanning heavyweight binary or base64 payload fields as part of normal text search execution.

#### Scenario: Text search excludes heavyweight content fields

- **WHEN** the user searches history by text
- **THEN** ClipMate matches against indexed text-oriented fields such as plain text, titles, OCR text, and normalized link text without treating full image payloads as searchable content

#### Scenario: Search results return summary projections

- **WHEN** a text query returns matching history entries
- **THEN** ClipMate returns lightweight summary rows that are sufficient for list rendering and defers full item loading until a detail action requires it

### Requirement: Derived history metadata updates without full list resets

The ClipMate desktop app SHALL keep derived history metadata such as source-app filters and item counts in sync with list mutations without requiring a complete renderer reset when only a subset of values changes.

#### Scenario: Source-app filter options update incrementally

- **WHEN** history changes alter the counts or presence of source applications in the recent result set
- **THEN** ClipMate updates the affected source-app metadata without discarding unrelated list state

#### Scenario: Delete mutation removes only targeted summaries

- **WHEN** the user deletes one or more history items
- **THEN** ClipMate removes only the targeted summaries and adjusts related derived metadata without fetching the entire recent-history payload again
