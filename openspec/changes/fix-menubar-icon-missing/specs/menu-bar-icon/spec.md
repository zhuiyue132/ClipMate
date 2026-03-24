## ADDED Requirements

### Requirement: ClipMate shows a visible menu bar icon on launch

The ClipMate desktop app SHALL create a visible macOS menu bar icon whenever the application finishes launching, and this behavior MUST work in both development runs and packaged application runs.

#### Scenario: Development launch shows the menu bar icon

- **WHEN** a developer starts ClipMate with the local development command on macOS
- **THEN** ClipMate creates a visible menu bar icon that can be found in the system menu bar

#### Scenario: Packaged launch shows the menu bar icon

- **WHEN** a user opens the packaged ClipMate application on macOS
- **THEN** ClipMate creates a visible menu bar icon that can be found in the system menu bar

#### Scenario: Primary icon asset cannot be loaded

- **WHEN** ClipMate cannot load its preferred menu bar icon asset during startup
- **THEN** ClipMate still creates a visible fallback menu bar icon instead of leaving the menu bar entry blank

### Requirement: ClipMate distinguishes capture pause state in the menu bar icon

The ClipMate desktop app SHALL show a visually distinct menu bar icon when clipboard capture is paused and SHALL restore the normal icon when capture resumes.

#### Scenario: Pause changes the menu bar icon

- **WHEN** the user pauses clipboard capture from the menu bar menu or a shortcut
- **THEN** the menu bar icon updates to the paused-state variant

#### Scenario: Resume restores the menu bar icon

- **WHEN** the user resumes clipboard capture
- **THEN** the menu bar icon updates back to the normal-state variant

### Requirement: ClipMate preserves existing menu bar interactions

The ClipMate desktop app SHALL preserve its existing menu bar behaviors after the icon fix, including opening the panel from the icon and exposing the quick actions menu.

#### Scenario: Left click opens the panel

- **WHEN** the user left-clicks the ClipMate menu bar icon
- **THEN** ClipMate toggles the main panel visibility

#### Scenario: Context menu remains available

- **WHEN** the user opens the ClipMate menu bar icon context menu
- **THEN** the menu includes pause capture, settings, and quit actions
