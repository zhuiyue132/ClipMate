import type { StorageSettings } from '../../shared/types'
import { getDatabase } from '../database'

export function enforceHistoryRetention(storage: StorageSettings): void {
  const db = getDatabase()

  const tx = db.transaction(() => {
    if (storage.maxAgeDays !== null) {
      const minCreatedAt = Date.now() - storage.maxAgeDays * 24 * 60 * 60 * 1000
      db.prepare('DELETE FROM clip_items WHERE created_at < ?').run(minCreatedAt)
    }

    if (storage.maxItems !== null) {
      db.prepare(
        `
          DELETE FROM clip_items
          WHERE id IN (
            SELECT id
            FROM clip_items
            ORDER BY created_at DESC
            LIMIT -1 OFFSET ?
          )
        `
      ).run(storage.maxItems)
    }
  })

  tx()
}
