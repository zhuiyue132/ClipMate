export interface ClipItem {
  id: string
  type: 'text' | 'richtext' | 'link' | 'image' | 'file' | 'color'
  content: string
  plain_text: string | null
  ocr_text: string | null
  source_app: string | null
  source_app_name: string | null
  title: string | null
  thumbnail: Buffer | null
  link_meta: string | null
  is_pinned: number
  is_confidential: number
  created_at: number
  updated_at: number
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
  deleteClipItem: (id: string) => Promise<void>
  clearHistory: () => Promise<void>

  // Pinboard
  getPinboards: () => Promise<Pinboard[]>
  createPinboard: (name: string, color: string) => Promise<Pinboard>
  deletePinboard: (id: string) => Promise<void>

  // Window
  hideWindow: () => void
  showSettings: () => void

  // System
  getAccessibilityPermission: () => Promise<boolean>
  requestAccessibilityPermission: () => void
}
