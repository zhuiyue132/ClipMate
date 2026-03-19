export interface ClipItem {
  id: string
  type: 'text' | 'richtext' | 'link' | 'image' | 'file' | 'color'
  content: string
  plain_text: string | null
  ocr_text: string | null
  source_app: string | null
  source_app_name: string | null
  title: string | null
  thumbnail: Uint8Array | null
  link_meta: string | null
  is_pinned: number
  is_confidential: number
  created_at: number
  updated_at: number
}

export interface SearchFilters {
  query?: string
  types?: Array<ClipItem['type']>
  sourceApp?: string | null
  dateFrom?: number | null
  dateTo?: number | null
  limit?: number
  offset?: number
}

export interface SourceAppSummary {
  source_app: string
  source_app_name: string
  count: number
}

export interface PanelSnapshot {
  paused: boolean
  historyItems: ClipItem[]
  sourceApps: SourceAppSummary[]
  pasteStackState: PasteStackState
}

export interface AppIconTarget {
  bundleId: string | null
  name: string | null
}

export interface PasteStackEntry {
  entry_id: string
  item_id: string
  item: ClipItem | null
}

export interface PasteStackState {
  enabled: boolean
  entries: PasteStackEntry[]
}

export interface ExcludedApp {
  bundleId: string
  name: string | null
}

export type ThemePreference = 'system' | 'light' | 'dark'
export type ShortcutAction = keyof ShortcutSettings
export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'error' | 'unavailable'
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unavailable'

export interface GeneralSettings {
  launchAtLogin: boolean
  theme: ThemePreference
  updateFeedUrl: string | null
}

export interface StorageSettings {
  maxItems: number | null
  maxAgeDays: number | null
}

export interface PrivacySettings {
  excludedApps: ExcludedApp[]
  hideOnScreenShare: boolean
  ignoreConcealed: boolean
}

export interface ShortcutSettings {
  togglePanel: string
  quickPasteLatest: string
  pasteLatestPlainText: string
  togglePasteStack: string
  pasteStackPaste: string
  togglePauseCapture: string
  focusSearch: string
  newTextItem: string
  newLinkItem: string
}

export type ScreenPermissionStatus =
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unknown'

export interface SystemPermissionSnapshot {
  accessibility: boolean
  screen: ScreenPermissionStatus
}

export interface SyncSettings {
  enabled: boolean
}

export interface AppSettings {
  general: GeneralSettings
  storage: StorageSettings
  privacy: PrivacySettings
  shortcuts: ShortcutSettings
  sync: SyncSettings
}

export interface SyncState {
  enabled: boolean
  status: SyncStatus
  lastSyncAt: number | null
  lastError: string | null
  path: string | null
}

export interface ShortcutRegistration {
  scope: 'global' | 'local'
  registered: boolean
  accelerator: string
}

export type ShortcutRegistrationState = Record<ShortcutAction, ShortcutRegistration>

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  progress: number | null
  message: string | null
}

export interface SettingsSnapshot {
  settings: AppSettings
  syncState: SyncState
  shortcutState: ShortcutRegistrationState
  updateState: UpdateState
  appVersion: string
  dbPath: string
}

export interface CreateClipItemInput {
  type: 'text' | 'link'
  content: string
  title?: string | null
}

export interface IpcApi {
  // Database
  getClipItems: (limit?: number, offset?: number) => Promise<ClipItem[]>
  getClipItem: (id: string) => Promise<ClipItem | null>
  createClipItem: (input: CreateClipItemInput) => Promise<string>
  updateClipItemTitle: (id: string, title: string | null) => Promise<void>
  updateClipItemText: (id: string, text: string) => Promise<void>
  updateClipItemLink: (id: string, url: string) => Promise<void>
  updateClipItemColor: (id: string, color: string) => Promise<void>
  updateClipItemImage: (
    id: string,
    payload: { contentBase64: string; thumbnailBase64?: string | null }
  ) => Promise<void>
  extractImageOcr: (
    id: string,
    mode: 'copy' | 'create'
  ) => Promise<{ text: string; createdItemId: string | null }>
  deleteClipItem: (id: string) => Promise<void>
  deleteClipItems: (ids: string[]) => Promise<void>
  clearHistory: () => Promise<void>
  searchClipItems: (filters: SearchFilters) => Promise<ClipItem[]>
  getSourceApps: () => Promise<SourceAppSummary[]>

  // Clipboard
  getClipboardState: () => Promise<{ paused: boolean }>
  setClipboardPaused: (paused: boolean) => Promise<void>
  pasteClipItem: (id: string, options?: { plainText?: boolean }) => Promise<void>
  pasteClipItemAsFile: (id: string) => Promise<void>
  copyClipItem: (id: string, options?: { plainText?: boolean }) => Promise<void>
  copyClipItemsAsText: (ids: string[], separator?: string) => Promise<number>
  startImageDrag: (id: string) => void
  onClipItemsChanged: (callback: () => void) => () => void
  onClipStateChanged: (callback: (state: { paused: boolean }) => void) => () => void
  onPanelPreparing: (callback: (requestId: number) => void | Promise<void>) => () => void
  onPreparePanelShow: (
    callback: (requestId: number, snapshot: PanelSnapshot) => void | Promise<void>
  ) => () => void
  getPasteStackState: () => Promise<PasteStackState>
  setPasteStackEnabled: (enabled: boolean) => Promise<void>
  clearPasteStack: () => Promise<void>
  enqueuePasteStackItems: (ids: string[]) => Promise<number>
  removePasteStackEntry: (entryId: string) => Promise<void>
  reorderPasteStack: (entryIds: string[]) => Promise<void>
  pastePasteStack: () => Promise<void>
  onPasteStackChanged: (callback: () => void) => () => void

  // Window
  hideWindow: () => void
  showSettings: () => void
  showPreview: (itemId: string) => void
  closeCurrentWindow: () => void
  quitApp: () => void
  onPreviewItemRequested: (callback: (itemId: string) => void) => () => void

  // System
  getAccessibilityPermission: () => Promise<boolean>
  requestAccessibilityPermission: () => void
  getSystemPermissions: () => Promise<SystemPermissionSnapshot>
  openPrivacySettings: (kind: 'accessibility' | 'screen') => Promise<void>
  getAppIcons: (targets: AppIconTarget[]) => Promise<Record<string, string | null>>
  quickLookFile: (path: string) => Promise<void>

  // Settings & sync
  getSettingsSnapshot: () => Promise<SettingsSnapshot>
  updateSettings: (settings: AppSettings) => Promise<AppSettings>
  triggerSyncNow: () => Promise<SyncState>
  checkForUpdates: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<void>
  onSettingsChanged: (callback: (snapshot: SettingsSnapshot) => void) => () => void
}
