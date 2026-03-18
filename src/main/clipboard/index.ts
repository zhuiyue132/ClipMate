import { getClipItemById, getLatestClipItemRecord } from '../database/clipItems'
import { getMainWindow } from '../windows'
import { activateApp, sendCmdVKeystroke, type FrontmostAppInfo } from '../system/frontmostApp'
import type { PasteStackState } from '../../shared/types'
import { createClipboardSignature, getClipboardSignature } from './content'
import { writeClipItemToClipboard } from './io'
import { PasteStackManager } from './pasteStack'
import { ClipboardWatcher } from './watcher'

let watcher: ClipboardWatcher | null = null
let lastActiveApp: FrontmostAppInfo | null = null
let burstIntervalId: NodeJS.Timeout | null = null
let burstTimeoutId: NodeJS.Timeout | null = null
let burstResolve: (() => void) | null = null
const pasteStack = new PasteStackManager(notifyStackChanged)

function notifyStackChanged(): void {
  getMainWindow()?.webContents.send('clip:stackChanged')
}

function stopClipboardCaptureBurst(): void {
  if (burstIntervalId) {
    clearInterval(burstIntervalId)
    burstIntervalId = null
  }
  if (burstTimeoutId) {
    clearTimeout(burstTimeoutId)
    burstTimeoutId = null
  }
  if (burstResolve) {
    burstResolve()
    burstResolve = null
  }
}

export function startClipboardWatcher(): void {
  if (watcher) return
  watcher = new ClipboardWatcher(220, ({ id }) => {
    getMainWindow()?.webContents.send('clip:itemsChanged')
    pasteStack.enqueue(id)
  })
  watcher.start()
}

export function stopClipboardWatcher(): void {
  stopClipboardCaptureBurst()
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

export function captureClipboardNow(): void {
  watcher?.captureNow()
}

export function captureClipboardBurst(durationMs = 450, intervalMs = 50): Promise<void> {
  if (!watcher) return Promise.resolve()

  watcher.captureNow()
  stopClipboardCaptureBurst()

  return new Promise((resolve) => {
    burstResolve = resolve
    burstIntervalId = setInterval(() => {
      watcher?.captureNow()
    }, intervalMs)

    burstTimeoutId = setTimeout(() => {
      stopClipboardCaptureBurst()
    }, durationMs)
  })
}

function getLatestClipboardSignature(): string | null {
  const latest = getLatestClipItemRecord()
  return latest ? createClipboardSignature(latest) : null
}

export async function captureClipboardBeforePanelShow(): Promise<void> {
  if (!watcher) return

  const maxWaitMs = 420
  const intervalMs = 40
  const settleMs = 90
  const start = Date.now()
  watcher.captureNow()

  let lastSignature = getClipboardSignature()
  let latestSignature = getLatestClipboardSignature()
  if (lastSignature === latestSignature) {
    return
  }

  let lastSignatureChangedAt = Date.now()

  while (true) {
    if (Date.now() - start >= maxWaitMs) {
      return
    }

    await delay(intervalMs)
    watcher.captureNow()

    const currentSignature = getClipboardSignature()
    if (currentSignature !== lastSignature) {
      lastSignature = currentSignature
      lastSignatureChangedAt = Date.now()
    }

    latestSignature = getLatestClipboardSignature()
    const settledFor = Date.now() - lastSignatureChangedAt
    const clipboardCaughtUp = currentSignature === latestSignature

    if (clipboardCaughtUp && settledFor >= settleMs) {
      return
    }
  }
}

export function suppressNextClipboardCapture(ms = 800): void {
  watcher?.suppressCapture(ms)
}

export function recordLastActiveApp(app: FrontmostAppInfo): void {
  lastActiveApp = app
}

export function getPasteStackState(): PasteStackState {
  return pasteStack.getState()
}

export function setPasteStackEnabled(enabled: boolean): void {
  pasteStack.setEnabled(enabled)
}

export function clearPasteStack(): void {
  pasteStack.clear()
}

export function removePasteStackEntry(entryId: string): void {
  pasteStack.removeEntry(entryId)
}

export function reorderPasteStack(entryIds: string[]): void {
  pasteStack.reorder(entryIds)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function pastePasteStack(): Promise<void> {
  await pasteStack.pasteAll({
    beforeStart: () => {
      getMainWindow()?.hide()
      if (lastActiveApp) {
        activateApp(lastActiveApp)
      }
    },
    pasteEntry: async (entry) => {
      const item = getClipItemById(entry.itemId)
      if (!item) return

      writeClipItemToClipboard(item, { plainText: false })
      suppressNextClipboardCapture(1500)
      sendCmdVKeystroke()
      await delay(120)
    }
  })
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
