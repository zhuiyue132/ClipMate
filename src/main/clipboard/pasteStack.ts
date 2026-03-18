import { randomUUID } from 'node:crypto'
import type { PasteStackState } from '../../shared/types'
import { getClipItemsByIds } from '../database/clipItems'

export interface PasteStackQueueEntry {
  entryId: string
  itemId: string
  createdAt: number
}

export class PasteStackManager {
  private enabled = false
  private queue: PasteStackQueueEntry[] = []
  private pasting = false

  constructor(private readonly onChanged: () => void) {}

  enqueue(itemId: string): void {
    if (!this.enabled) return

    this.queue.push({ entryId: randomUUID(), itemId, createdAt: Date.now() })
    this.onChanged()
  }

  getState(): PasteStackState {
    const ids = Array.from(new Set(this.queue.map((entry) => entry.itemId)))
    const itemsMap = getClipItemsByIds(ids)

    return {
      enabled: this.enabled,
      entries: this.queue.map((entry) => ({
        entry_id: entry.entryId,
        item_id: entry.itemId,
        item: itemsMap.get(entry.itemId) ?? null
      }))
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.queue = []
    }
    this.onChanged()
  }

  clear(): void {
    this.queue = []
    this.onChanged()
  }

  removeEntry(entryId: string): void {
    this.queue = this.queue.filter((entry) => entry.entryId !== entryId)
    this.onChanged()
  }

  reorder(entryIds: string[]): void {
    const entryMap = new Map(this.queue.map((entry) => [entry.entryId, entry] as const))
    const nextQueue: PasteStackQueueEntry[] = []

    for (const entryId of entryIds) {
      const entry = entryMap.get(entryId)
      if (entry) {
        nextQueue.push(entry)
      }
    }

    this.queue = nextQueue
    this.onChanged()
  }

  async pasteAll(options: {
    beforeStart?: () => void | Promise<void>
    pasteEntry: (entry: PasteStackQueueEntry) => Promise<void>
  }): Promise<void> {
    if (this.pasting) return

    this.pasting = true
    try {
      const entries = [...this.queue]
      if (entries.length === 0) return

      await options.beforeStart?.()

      for (const entry of entries) {
        await options.pasteEntry(entry)
      }

      this.queue = []
      this.onChanged()
    } finally {
      this.pasting = false
    }
  }
}
