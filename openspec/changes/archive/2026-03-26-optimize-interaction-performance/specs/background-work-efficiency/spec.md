## ADDED Requirements

### Requirement: Clipboard capture uses adaptive background scheduling

The ClipMate desktop app SHALL adjust clipboard polling and reconciliation work based on recent activity, using higher-frequency capture only around active clipboard changes or paste flows and avoiding continuous peak-rate polling while the system is idle.

#### Scenario: Idle clipboard capture avoids peak polling rate

- **WHEN** the system clipboard remains unchanged for an extended idle period
- **THEN** ClipMate reduces background capture frequency while still remaining able to detect the next clipboard change

#### Scenario: Active clipboard flow temporarily increases capture urgency

- **WHEN** the user triggers a paste flow or opens the panel right after copying content
- **THEN** ClipMate temporarily increases capture urgency to reconcile the freshest clipboard entry before returning to the lower idle schedule

### Requirement: App icon and metadata enrichment do not block panel interaction

The ClipMate desktop app SHALL resolve source-application icons, OCR results, and link metadata through asynchronous background work that does not block panel opening or list interaction.

#### Scenario: Visible app icons load progressively

- **WHEN** the history list contains entries whose source-application icons are not yet cached
- **THEN** ClipMate loads those icons progressively for visible cards without blocking initial panel render or keyboard navigation

#### Scenario: Metadata enrichment patches only affected entries

- **WHEN** OCR or link metadata becomes available for a history item after it has already appeared in the list
- **THEN** ClipMate patches the affected entry in place instead of forcing a full history refresh

### Requirement: Window transitions avoid long-running main-thread animation loops

The ClipMate desktop app SHALL perform main panel show and hide transitions without relying on sustained JavaScript timer loops in the Electron main process for the full duration of the animation.

#### Scenario: Show transition avoids timer-driven frame loop

- **WHEN** the user opens the main panel
- **THEN** ClipMate uses a native or renderer-driven transition path that does not require a high-frequency JavaScript loop in the main process to advance each frame

#### Scenario: Hide transition remains smooth while background work continues

- **WHEN** the user closes the main panel while clipboard or metadata work is still ongoing
- **THEN** ClipMate completes the hide transition without the background work causing a visible stutter in the transition itself
