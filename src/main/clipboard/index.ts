import { clipboard, nativeImage } from 'electron'
import { getDatabase } from '../database'
import { getMainWindow } from '../windows'
import { activateApp, sendCmdVKeystroke, type FrontmostAppInfo } from '../system/frontmostApp'
import type { ClipItem } from '../../shared/types'
import { ClipboardWatcher } from './watcher'

let watcher: ClipboardWatcher | null = null
let lastActiveApp: FrontmostAppInfo | null = null

export function startClipboardWatcher(): void {
  if (watcher) return
  watcher = new ClipboardWatcher(350, () => {
    getMainWindow()?.webContents.send('clip:itemsChanged')
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
