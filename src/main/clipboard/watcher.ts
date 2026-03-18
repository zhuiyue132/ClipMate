import { v4 as uuidv4 } from 'uuid'
import {
  getLatestClipItemRecord,
  insertClipItem,
  touchClipItemTimestamps
} from '../database/clipItems'
import { getFrontmostAppInfo } from '../system/frontmostApp'
import { createClipboardSignature, readClipboardContent } from './content'

export class ClipboardWatcher {
  private intervalId: NodeJS.Timeout | null = null
  private paused = false
  private lastSeenSignature: string | null = null
  private lastSaved: { id: string; signature: string } | null = null
  private pendingSignature: string | null = null
  private ignoreUntil = 0

  constructor(
    private readonly pollMs: number,
    private readonly onItemsChanged: (info: { id: string; isDuplicate: boolean }) => void
  ) {}

  start(): void {
    if (this.intervalId) return

    this.primeLastSaved()
    this.poll()

    this.intervalId = setInterval(() => {
      this.poll()
    }, this.pollMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  isPaused(): boolean {
    return this.paused
  }

  setPaused(next: boolean): void {
    this.paused = next
  }

  captureNow(): void {
    this.poll()
  }

  suppressCapture(ms: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, Date.now() + ms)
  }

  private primeLastSaved(): void {
    const latest = getLatestClipItemRecord()
    if (latest?.id) {
      this.lastSaved = { id: latest.id, signature: createClipboardSignature(latest) }
    }
  }

  private poll(): void {
    try {
      this.tick()
    } catch (error) {
      console.error('[clipboard] failed to capture clipboard content', error)
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

    if (sig !== this.pendingSignature) {
      this.pendingSignature = sig
      return
    }

    this.pendingSignature = null
    this.lastSeenSignature = sig

    if (this.paused) return

    const now = Date.now()
    const appInfo = getFrontmostAppInfo()

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

    this.lastSaved = { id, signature: sig }
    this.onItemsChanged({ id, isDuplicate: false })
  }
}
