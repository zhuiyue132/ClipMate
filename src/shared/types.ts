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
  pinboardId?: string | null
  limit?: number
  offset?: number
}

export interface SourceAppSummary {
  source_app: string
  source_app_name: string
  count: number
}

export interface Pinboard {
  id: string
  name: string
  color: string
  sort_order: number
  created_at: number
}

export interface PinboardItem {
  pinboard_id: string
  item_id: string
  sort_order: number
}

export interface IpcApi {
  // Database
  getClipItems: (limit?: number, offset?: number) => Promise<ClipItem[]>
  getClipItem: (id: string) => Promise<ClipItem | null>
  updateClipItemTitle: (id: string, title: string | null) => Promise<void>
  updateClipItemText: (id: string, text: string) => Promise<void>
  updateClipItemColor: (id: string, color: string) => Promise<void>
  updateClipItemImage: (
    id: string,
    payload: { contentBase64: string; thumbnailBase64?: string | null }
  ) => Promise<void>
  deleteClipItem: (id: string) => Promise<void>
  deleteClipItems: (ids: string[]) => Promise<void>
  clearHistory: () => Promise<void>
  searchClipItems: (filters: SearchFilters) => Promise<ClipItem[]>
  getSourceApps: () => Promise<SourceAppSummary[]>

  // Clipboard
  getClipboardState: () => Promise<{ paused: boolean }>
  setClipboardPaused: (paused: boolean) => Promise<void>
  pasteClipItem: (id: string, options?: { plainText?: boolean }) => Promise<void>
  copyClipItem: (id: string, options?: { plainText?: boolean }) => Promise<void>
  onClipItemsChanged: (callback: () => void) => () => void
  onClipStateChanged: (callback: (state: { paused: boolean }) => void) => () => void

  // Pinboard
  getPinboards: () => Promise<Pinboard[]>
  createPinboard: (name: string, color: string) => Promise<Pinboard>
  deletePinboard: (id: string) => Promise<void>
  renamePinboard: (id: string, name: string) => Promise<void>
  getPinboardItems: (pinboardId: string) => Promise<ClipItem[]>
  addItemToPinboard: (pinboardId: string, itemId: string) => Promise<void>
  addItemsToPinboard: (pinboardId: string, itemIds: string[]) => Promise<void>
  removeItemFromPinboard: (pinboardId: string, itemId: string) => Promise<void>
  reorderPinboardItems: (pinboardId: string, itemIds: string[]) => Promise<void>

  // Window
  hideWindow: () => void
  showSettings: () => void
  quitApp: () => void

  // System
  getAccessibilityPermission: () => Promise<boolean>
  requestAccessibilityPermission: () => void
}
