import { getClipItemById, getLatestClipItemRecord } from '../database/clipItems'
import { getMainWindow } from '../windows'
import { activateApp, sendCmdVKeystroke, type FrontmostAppInfo } from '../system/frontmostApp'
import type { PasteStackState } from '../../shared/types'
import {
  broadcastClipItemsChanged,
  broadcastClipStateChanged,
  broadcastPasteStackChanged
} from '../events'
import { createClipboardSignature, getClipboardSignature } from './content'
import {
  createDragIconFromBase64,
  writeBase64ImageToTempFile,
  writeFilePathsToClipboard
} from './files'
import { writeClipItemToClipboard } from './io'
import { PasteStackManager } from './pasteStack'
import { ClipboardWatcher } from './watcher'

let watcher: ClipboardWatcher | null = null
let lastActiveApp: FrontmostAppInfo | null = null
let burstIntervalId: NodeJS.Timeout | null = null
let burstTimeoutId: NodeJS.Timeout | null = null
let burstResolve: (() => void) | null = null
const pasteStack = new PasteStackManager(notifyStackChanged)
const clipboardStateListeners = new Set<(paused: boolean) => void>()

function notifyStackChanged(): void {
  broadcastPasteStackChanged()
}

function activateLastTargetApp(): void {
  if (lastActiveApp) {
    activateApp(lastActiveApp)
  }
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
    broadcastClipItemsChanged()
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
  broadcastClipStateChanged(paused)

  for (const listener of clipboardStateListeners) {
    listener(paused)
  }
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

export function togglePasteStackEnabled(): void {
  pasteStack.setEnabled(!pasteStack.getState().enabled)
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
      activateLastTargetApp()
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
  activateLastTargetApp()
  sendCmdVKeystroke()
}

export function pasteLatestClipItem(options?: { plainText?: boolean }): void {
  const latest = getLatestClipItemRecord()
  if (!latest?.id) return

  pasteClipItem(latest.id, options)
}

export function copyClipItem(id: string, options?: { plainText?: boolean }): void {
  const item = getClipItemById(id)
  if (!item) return
  writeClipItemToClipboard(item, { plainText: options?.plainText ?? false })
  suppressNextClipboardCapture()
}

export function pasteClipItemAsFile(id: string): void {
  const item = getClipItemById(id)
  if (!item || item.type !== 'image') return

  const filePath = writeBase64ImageToTempFile(item.id, item.content)
  writeFilePathsToClipboard([filePath])
  suppressNextClipboardCapture(1500)

  getMainWindow()?.hide()
  activateLastTargetApp()
  sendCmdVKeystroke()
}

export function startImageDrag(
  webContents: Electron.WebContents,
  id: string
): { filePath: string } | null {
  const item = getClipItemById(id)
  if (!item || item.type !== 'image') return null

  const filePath = writeBase64ImageToTempFile(item.id, item.content)
  const icon = createDragIconFromBase64(item.content)

  webContents.startDrag({
    file: filePath,
    icon
  })

  return { filePath }
}

export function subscribeClipboardState(listener: (paused: boolean) => void): () => void {
  clipboardStateListeners.add(listener)
  return () => {
    clipboardStateListeners.delete(listener)
  }
}
