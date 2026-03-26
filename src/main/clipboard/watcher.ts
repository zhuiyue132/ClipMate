import { v4 as uuidv4 } from 'uuid'
import {
  getLatestClipItemRecord,
  insertClipItem,
  touchClipItemTimestamps
} from '../database/clipItems'
import { enforceHistoryRetention } from '../history/retention'
import { getSettings } from '../settings/store'
import { getFrontmostAppInfo } from '../system/frontmostApp'
import {
  createClipboardSignature,
  hasConcealedClipboardMarker,
  readClipboardContent
} from './content'

function isExcludedApp(bundleId: string | null): boolean {
  if (!bundleId) return false
  const excludedApps = getSettings().privacy.excludedApps
  return excludedApps.some((item) => item.bundleId === bundleId)
}

export class ClipboardWatcher {
  private timerId: NodeJS.Timeout | null = null
  private paused = false
  private lastSeenSignature: string | null = null
  private lastSaved: { id: string; signature: string } | null = null
  private pendingSignature: string | null = null
  private ignoreUntil = 0
  private boostUntil = 0

  constructor(
    private readonly pollMs: number,
    private readonly onItemsChanged: (info: { id: string; isDuplicate: boolean }) => void
  ) {}

  start(): void {
    if (this.timerId) return

    this.primeLastSaved()
    this.boostActivity(1200)
    this.poll()
  }

  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  isPaused(): boolean {
    return this.paused
  }

  setPaused(next: boolean): void {
    this.paused = next
  }

  captureNow(): void {
    this.boostActivity(1500)
    this.poll()
  }

  suppressCapture(ms: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, Date.now() + ms)
    this.boostActivity(Math.max(ms, 1200))
  }

  rememberClipboardWrite(itemId?: string | null): void {
    const content = readClipboardContent()
    if (!content) return

    const signature = createClipboardSignature({
      type: content.type,
      content: content.content,
      plain_text: content.plain_text
    })

    this.lastSeenSignature = signature
    this.pendingSignature = null
    this.boostActivity(1800)
    if (itemId) {
      this.lastSaved = { id: itemId, signature }
    }
  }

  private primeLastSaved(): void {
    const latest = getLatestClipItemRecord()
    if (latest?.id) {
      this.lastSaved = { id: latest.id, signature: createClipboardSignature(latest) }
    }
  }

  private activePollMs(): number {
    return Math.max(120, Math.floor(this.pollMs * 0.65))
  }

  private idlePollMs(): number {
    return Math.max(540, this.pollMs * 3)
  }

  private boostActivity(ms = 1500): void {
    this.boostUntil = Math.max(this.boostUntil, Date.now() + ms)
  }

  private nextDelayMs(): number {
    return Date.now() < this.boostUntil ? this.activePollMs() : this.idlePollMs()
  }

  private scheduleNextPoll(delayMs = this.nextDelayMs()): void {
    if (this.timerId) {
      clearTimeout(this.timerId)
    }
    this.timerId = setTimeout(() => {
      this.poll()
    }, delayMs)
  }

  private poll(): void {
    try {
      this.tick()
    } catch (error) {
      console.error('[clipboard] failed to capture clipboard content', error)
    } finally {
      this.scheduleNextPoll()
    }
  }

  private tick(): void {
    if (Date.now() < this.ignoreUntil) return

    const content = readClipboardContent()
    if (!content) {
      this.pendingSignature = null
      return
    }

    const sig = createClipboardSignature({
      type: content.type,
      content: content.content,
      plain_text: content.plain_text
    })

    if (sig === this.lastSeenSignature) {
      this.pendingSignature = null
      return
    }

    this.boostActivity(1800)

    if (sig !== this.pendingSignature) {
      this.pendingSignature = sig
      return
    }

    this.pendingSignature = null
    this.lastSeenSignature = sig

    if (this.paused) return

    const now = Date.now()
    const appInfo = getFrontmostAppInfo()
    const settings = getSettings()

    if (isExcludedApp(appInfo.bundleId)) {
      return
    }

    if (settings.privacy.ignoreConcealed && hasConcealedClipboardMarker()) {
      return
    }

    if (this.lastSaved?.signature === sig) {
      touchClipItemTimestamps(this.lastSaved.id, now)
      this.onItemsChanged({ id: this.lastSaved.id, isDuplicate: true })
      return
    }

    const id = uuidv4()
    insertClipItem({
      id,
      type: content.type,
      content: content.content,
      plainText: content.plain_text,
      sourceApp: appInfo.bundleId,
      sourceAppName: appInfo.name,
      thumbnail: content.type === 'image' ? content.thumbnail : null,
      createdAt: now,
      updatedAt: now
    })
    enforceHistoryRetention(settings.storage)

    this.lastSaved = { id, signature: sig }
    this.onItemsChanged({ id, isDuplicate: false })
  }
}
