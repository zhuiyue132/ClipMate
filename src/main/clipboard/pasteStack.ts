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

  isEnabled(): boolean {
    return this.enabled
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
    const orderedIds = new Set(entryIds)

    for (const entryId of entryIds) {
      const entry = entryMap.get(entryId)
      if (entry) {
        nextQueue.push(entry)
      }
    }

    for (const entry of this.queue) {
      if (!orderedIds.has(entry.entryId)) {
        nextQueue.push(entry)
      }
    }

    this.queue = nextQueue
    this.onChanged()
  }

  async pasteAll(options: {
    beforeStart?: () => void | Promise<void>
    pasteEntry: (entry: PasteStackQueueEntry) => Promise<boolean>
  }): Promise<void> {
    if (this.pasting) return

    this.pasting = true
    try {
      const entryIds = this.queue.map((entry) => entry.entryId)
      if (entryIds.length === 0) return

      await options.beforeStart?.()

      for (const entryId of entryIds) {
        const entry = this.queue.find((current) => current.entryId === entryId)
        if (!entry) continue

        const pasted = await options.pasteEntry(entry)
        if (!pasted) {
          break
        }

        this.queue = this.queue.filter((current) => current.entryId !== entryId)
        this.onChanged()
      }
    } finally {
      this.pasting = false
    }
  }

  async pasteNext(options: {
    beforeStart?: () => void | Promise<void>
    pasteEntry: (entry: PasteStackQueueEntry) => Promise<boolean>
  }): Promise<boolean> {
    if (this.pasting) return false

    const entry = this.queue[0]
    if (!entry) return false

    this.pasting = true
    try {
      await options.beforeStart?.()
      const pasted = await options.pasteEntry(entry)
      if (!pasted) return false

      this.queue = this.queue.filter((current) => current.entryId !== entry.entryId)
      this.onChanged()
      return true
    } finally {
      this.pasting = false
    }
  }
}
