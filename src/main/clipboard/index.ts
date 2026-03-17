import { clipboard, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { getDatabase } from '../database'
import { getMainWindow } from '../windows'
import { activateApp, sendCmdVKeystroke, type FrontmostAppInfo } from '../system/frontmostApp'
import type { ClipItem, PasteStackState } from '../../shared/types'
import { ClipboardWatcher } from './watcher'

let watcher: ClipboardWatcher | null = null
let lastActiveApp: FrontmostAppInfo | null = null
let stackEnabled = false
let stackQueue: Array<{ entryId: string; itemId: string; createdAt: number }> = []
let stackPasting = false

function notifyStackChanged(): void {
  getMainWindow()?.webContents.send('clip:stackChanged')
}

export function startClipboardWatcher(): void {
  if (watcher) return
  watcher = new ClipboardWatcher(350, ({ id }) => {
    getMainWindow()?.webContents.send('clip:itemsChanged')
    if (stackEnabled) {
      stackQueue.push({ entryId: randomUUID(), itemId: id, createdAt: Date.now() })
      notifyStackChanged()
    }
  })
  watcher.start()
}

export function stopClipboardWatcher(): void {
  watcher?.stop()
  watcher = null
}

export function isClipboardPaused(): boolean {
  return watcher?.isPaused() ?? false
}

export function setClipboardPaused(paused: boolean): void {
  watcher?.setPaused(paused)
  getMainWindow()?.webContents.send('clip:stateChanged', { paused })
}

export function suppressNextClipboardCapture(ms = 800): void {
  watcher?.suppressCapture(ms)
}

export function recordLastActiveApp(app: FrontmostAppInfo): void {
  lastActiveApp = app
}

export function getPasteStackState(): PasteStackState {
  const ids = Array.from(new Set(stackQueue.map((e) => e.itemId)))
  const itemsMap = new Map<string, ClipItem>()

  if (ids.length > 0) {
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(', ')
    const rows = db
      .prepare(`SELECT * FROM clip_items WHERE id IN (${placeholders})`)
      .all(...ids) as ClipItem[]
    rows.forEach((row) => itemsMap.set(row.id, row))
  }

  return {
    enabled: stackEnabled,
    entries: stackQueue.map((entry) => ({
      entry_id: entry.entryId,
      item_id: entry.itemId,
      item: itemsMap.get(entry.itemId) ?? null
    }))
  }
}

export function setPasteStackEnabled(enabled: boolean): void {
  stackEnabled = enabled
  if (!stackEnabled) {
    stackQueue = []
  }
  notifyStackChanged()
}

export function clearPasteStack(): void {
  stackQueue = []
  notifyStackChanged()
}

export function removePasteStackEntry(entryId: string): void {
  stackQueue = stackQueue.filter((e) => e.entryId !== entryId)
  notifyStackChanged()
}

export function reorderPasteStack(entryIds: string[]): void {
  const map = new Map(stackQueue.map((e) => [e.entryId, e] as const))
  const next: typeof stackQueue = []
  for (const id of entryIds) {
    const entry = map.get(id)
    if (entry) next.push(entry)
  }
  stackQueue = next
  notifyStackChanged()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function pastePasteStack(): Promise<void> {
  if (stackPasting) return
  stackPasting = true

  try {
    const entries = [...stackQueue]
    if (entries.length === 0) return

    // 先隐藏面板，避免按键落在自身窗口上
    getMainWindow()?.hide()

    if (lastActiveApp) {
      activateApp(lastActiveApp)
    }

    for (const entry of entries) {
      const item = getClipItemById(entry.itemId)
      if (!item) continue

      writeClipItemToClipboard(item, { plainText: false })
      suppressNextClipboardCapture(1500)
      sendCmdVKeystroke()
      await delay(120)
    }

    stackQueue = []
    notifyStackChanged()
  } finally {
    stackPasting = false
  }
}

function getClipItemById(id: string): ClipItem | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clip_items WHERE id = ?').get(id) as ClipItem | undefined
  return row ?? null
}

export function pasteClipItem(id: string, options?: { plainText?: boolean }): void {
  const item = getClipItemById(id)
  if (!item) return

  writeClipItemToClipboard(item, { plainText: options?.plainText ?? false })
  suppressNextClipboardCapture()

  // 先隐藏面板，避免按键落在自身窗口上
  getMainWindow()?.hide()

  if (lastActiveApp) {
    activateApp(lastActiveApp)
  }

  sendCmdVKeystroke()
}

export function copyClipItem(id: string, options?: { plainText?: boolean }): void {
  const item = getClipItemById(id)
  if (!item) return
  writeClipItemToClipboard(item, { plainText: options?.plainText ?? false })
  suppressNextClipboardCapture()
}

export function writeClipItemToClipboard(item: ClipItem, options: { plainText: boolean }): void {
  if (item.type === 'image') {
    const buf = Buffer.from(item.content, 'base64')
    const img = nativeImage.createFromBuffer(buf)
    clipboard.writeImage(img)
    return
  }

  if (item.type === 'richtext' && !options.plainText) {
    clipboard.write({
      html: item.content,
      text: item.plain_text ?? ''
    })
    return
  }

  clipboard.writeText(item.plain_text ?? item.content ?? '')
}
