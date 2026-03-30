import { clipboard, Notification } from 'electron'
import {
  getClipItemById,
  getClipItemSummaryById,
  getClipItemsByIds,
  getLatestClipItemRecord,
  getSourceAppSummaries
} from '../database/clipItems'
import { getMainWindow, syncStackDockWindow } from '../windows'
import { activateApp, sendCmdVKeystroke, type FrontmostAppInfo } from '../system/frontmostApp'
import type { PasteStackState } from '../../shared/types'
import {
  broadcastHistoryUpsert,
  broadcastClipStateChanged,
  broadcastPasteStackChanged
} from '../events'
import { syncPasteStackPasteShortcut, withPasteStackPasteShortcutSuspended } from '../shortcuts'
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
const WEBSITE_SCREENSHOT_CAPTURE_ENABLED = process.env.CLIPMATE_SITE_SCREENSHOTS === '1'

function broadcastHistoryUpsertById(
  id: string,
  reason: 'clipboard-capture' | 'clipboard-duplicate' | 'reconcile'
): void {
  const summary = getClipItemSummaryById(id)
  if (!summary) return
  broadcastHistoryUpsert([summary], getSourceAppSummaries(), reason)
}

function notifyStackChanged(): void {
  const state = pasteStack.getState()
  syncStackDockWindow(state)
  syncPasteStackPasteShortcut(state.enabled && state.entries.length > 0)
  broadcastPasteStackChanged()
}

function showPasteStackEnabledNotification(): void {
  if (WEBSITE_SCREENSHOT_CAPTURE_ENABLED) return
  if (!Notification.isSupported()) return

  new Notification({
    title: 'ClipMate',
    body: 'PasteStack 已启用',
    silent: true
  }).show()
}

function showPasteStackDisabledNotification(): void {
  if (WEBSITE_SCREENSHOT_CAPTURE_ENABLED) return
  if (!Notification.isSupported()) return

  new Notification({
    title: 'ClipMate',
    body: 'PasteStack 已退出',
    silent: true
  }).show()
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
  watcher = new ClipboardWatcher(220, ({ id, isDuplicate }) => {
    broadcastHistoryUpsertById(id, isDuplicate ? 'clipboard-duplicate' : 'clipboard-capture')
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

function rememberWrittenClipItem(
  item: Pick<NonNullable<ReturnType<typeof getClipItemById>>, 'id'>
): void {
  watcher?.rememberClipboardWrite(item.id)
}

function rememberCurrentClipboard(): void {
  watcher?.rememberClipboardWrite()
}

export function recordLastActiveApp(app: FrontmostAppInfo): void {
  lastActiveApp = app
}

export function getPasteStackState(): PasteStackState {
  return pasteStack.getState()
}

export function setPasteStackEnabled(enabled: boolean): void {
  const wasEnabled = pasteStack.isEnabled()
  pasteStack.setEnabled(enabled)

  if (enabled && !wasEnabled) {
    showPasteStackEnabledNotification()
  } else if (!enabled && wasEnabled) {
    showPasteStackDisabledNotification()
  }
}

export function togglePasteStackEnabled(): void {
  setPasteStackEnabled(!pasteStack.isEnabled())
}

export function clearPasteStack(): void {
  pasteStack.clear()
}

export function enqueuePasteStackItems(ids: string[]): number {
  const orderedIds = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))))
  if (orderedIds.length === 0) return 0

  setPasteStackEnabled(true)
  let added = 0
  for (const id of orderedIds) {
    if (getClipItemById(id)) {
      pasteStack.enqueue(id)
      added += 1
    }
  }

  return added
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

async function writeClipItemAndPaste(
  item: NonNullable<ReturnType<typeof getClipItemById>>,
  options?: { plainText?: boolean; suppressMs?: number; keystrokeDelaySeconds?: number }
): Promise<boolean> {
  writeClipItemToClipboard(item, { plainText: options?.plainText ?? false })
  rememberWrittenClipItem(item)
  suppressNextClipboardCapture(options?.suppressMs ?? 1500)

  return withPasteStackPasteShortcutSuspended(async () => {
    const pasted = sendCmdVKeystroke(options?.keystrokeDelaySeconds ?? 0.05)
    if (pasted) {
      await delay(120)
    }
    return pasted
  })
}

export async function pastePasteStack(): Promise<void> {
  await pasteStack.pasteAll({
    beforeStart: () => {
      getMainWindow()?.hide()
      activateLastTargetApp()
    },
    pasteEntry: async (entry) => {
      const item = getClipItemById(entry.itemId)
      if (!item) return false

      return writeClipItemAndPaste(item, {
        plainText: false,
        suppressMs: 1500,
        keystrokeDelaySeconds: 0.04
      })
    }
  })
}

export async function pasteNextFromPasteStackShortcut(): Promise<boolean> {
  return pasteStack.pasteNext({
    beforeStart: () => {
      getMainWindow()?.hide()
    },
    pasteEntry: async (entry) => {
      const item = getClipItemById(entry.itemId)
      if (!item) return false

      return writeClipItemAndPaste(item, {
        plainText: false,
        suppressMs: 1500,
        keystrokeDelaySeconds: 0.008
      })
    }
  })
}

export function pasteClipItem(id: string, options?: { plainText?: boolean }): void {
  const item = getClipItemById(id)
  if (!item) return

  // 先隐藏面板，避免按键落在自身窗口上
  getMainWindow()?.hide()
  activateLastTargetApp()
  void writeClipItemAndPaste(item, {
    plainText: options?.plainText ?? false,
    suppressMs: 800,
    keystrokeDelaySeconds: 0.05
  })
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
  rememberWrittenClipItem(item)
  suppressNextClipboardCapture()
}

export function copyClipItemsAsText(ids: string[], separator = '\n\n'): number {
  const orderedIds = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))))
  if (orderedIds.length === 0) return 0

  const items = getClipItemsByIds(orderedIds)
  const textValueForItem = (item: NonNullable<ReturnType<typeof getClipItemById>>): string => {
    if (item.type === 'file') {
      try {
        const parsed = JSON.parse(item.content) as { paths?: string[] }
        return (parsed.paths ?? []).join('\n')
      } catch {
        return item.plain_text?.trim() || ''
      }
    }

    if (item.type === 'image') {
      return item.title?.trim() || item.ocr_text?.trim() || '[图片]'
    }

    return item.plain_text?.trim() || item.content?.trim() || ''
  }

  const values = orderedIds
    .map((id) => items.get(id))
    .filter((item): item is NonNullable<ReturnType<typeof getClipItemById>> => Boolean(item))
    .map((item) => textValueForItem(item))
    .filter(Boolean)
  const text = values.join(separator)

  if (!text) return 0

  clipboard.writeText(text)
  rememberCurrentClipboard()
  suppressNextClipboardCapture()
  return values.length
}

export function pasteClipItemAsFile(id: string): void {
  const item = getClipItemById(id)
  if (!item || item.type !== 'image') return

  const filePath = writeBase64ImageToTempFile(item.id, item.content)
  writeFilePathsToClipboard([filePath])
  rememberCurrentClipboard()
  suppressNextClipboardCapture(1500)

  getMainWindow()?.hide()
  activateLastTargetApp()
  void withPasteStackPasteShortcutSuspended(async () => {
    sendCmdVKeystroke(0.05)
    await delay(120)
  })
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
