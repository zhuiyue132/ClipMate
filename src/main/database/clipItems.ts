import type { ClipItem, SearchFilters, SourceAppSummary } from '../../shared/types'
import { getDatabase } from './index'

export interface ClipItemImagePayload {
  contentBase64: string
  thumbnailBase64?: string | null
}

export interface NewClipItemRecord {
  id: string
  type: ClipItem['type']
  content: string
  plainText: string | null
  sourceApp: string | null
  sourceAppName: string | null
  thumbnail: Buffer | null
  createdAt: number
  updatedAt: number
}

export interface FullClipItemRecord {
  id: string
  type: ClipItem['type']
  content: string
  plainText: string | null
  ocrText: string | null
  sourceApp: string | null
  sourceAppName: string | null
  title: string | null
  thumbnail: Buffer | null
  linkMeta: string | null
  isConfidential: number
  createdAt: number
  updatedAt: number
}

export function getClipItems(limit = 50, offset = 0): ClipItem[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM clip_items ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as ClipItem[]
}

export function getClipItemById(id: string): ClipItem | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clip_items WHERE id = ?').get(id) as ClipItem | undefined
  return row ?? null
}

export function getClipItemsByIds(ids: string[]): Map<string, ClipItem> {
  const uniqueIds = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) {
    return new Map()
  }

  const db = getDatabase()
  const placeholders = uniqueIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT * FROM clip_items WHERE id IN (${placeholders})`)
    .all(...uniqueIds) as ClipItem[]
  return new Map(rows.map((row) => [row.id, row]))
}

export function getLatestClipItemRecord(): Pick<
  ClipItem,
  'id' | 'type' | 'content' | 'plain_text' | 'created_at'
> | null {
  const db = getDatabase()
  const row = db
    .prepare(
      'SELECT id, type, content, plain_text, created_at FROM clip_items ORDER BY created_at DESC LIMIT 1'
    )
    .get() as Pick<ClipItem, 'id' | 'type' | 'content' | 'plain_text' | 'created_at'> | undefined

  return row ?? null
}

export function insertClipItem(record: NewClipItemRecord): void {
  insertFullClipItem({
    id: record.id,
    type: record.type,
    content: record.content,
    plainText: record.plainText,
    ocrText: null,
    sourceApp: record.sourceApp,
    sourceAppName: record.sourceAppName,
    title: null,
    thumbnail: record.thumbnail,
    linkMeta: null,
    isConfidential: 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  })
}

export function insertFullClipItem(record: FullClipItemRecord): void {
  const db = getDatabase()
  db.prepare(
    `
      INSERT INTO clip_items (
        id, type, content, plain_text, ocr_text,
        source_app, source_app_name, title,
        thumbnail, link_meta,
        is_pinned, is_confidential,
        created_at, updated_at
      )
      VALUES (
        @id, @type, @content, @plain_text, @ocr_text,
        @source_app, @source_app_name, @title,
        @thumbnail, @link_meta,
        0, @is_confidential,
        @created_at, @updated_at
      )
    `
  ).run({
    id: record.id,
    type: record.type,
    content: record.content,
    plain_text: record.plainText,
    ocr_text: record.ocrText,
    source_app: record.sourceApp,
    source_app_name: record.sourceAppName,
    title: record.title,
    thumbnail: record.thumbnail,
    link_meta: record.linkMeta,
    is_confidential: record.isConfidential,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  })
}

export function touchClipItemTimestamps(id: string, timestamp: number): void {
  const db = getDatabase()
  db.prepare('UPDATE clip_items SET created_at = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    id
  )
}

export function updateClipItemTitle(id: string, title: string | null): void {
  const db = getDatabase()
  const next = title?.trim() ? title.trim() : null
  db.prepare('UPDATE clip_items SET title = ?, updated_at = ? WHERE id = ?').run(
    next,
    Date.now(),
    id
  )
}

export function updateClipItemText(id: string, text: string): void {
  const db = getDatabase()
  const next = text ?? ''
  db.prepare(
    `
      UPDATE clip_items
      SET type = ?, content = ?, plain_text = ?, link_meta = NULL, updated_at = ?
      WHERE id = ?
    `
  ).run('text', next, next, Date.now(), id)
}

export function updateClipItemLink(id: string, url: string): void {
  const db = getDatabase()
  const next = url.trim()
  db.prepare(
    `
      UPDATE clip_items
      SET type = ?, content = ?, plain_text = ?, link_meta = NULL, updated_at = ?
      WHERE id = ?
    `
  ).run('link', next, next, Date.now(), id)
}

export function updateClipItemColor(id: string, color: string): void {
  const db = getDatabase()
  const next = color?.trim() ?? ''
  db.prepare('UPDATE clip_items SET content = ?, plain_text = ?, updated_at = ? WHERE id = ?').run(
    next,
    next,
    Date.now(),
    id
  )
}

export function updateClipItemImage(id: string, payload: ClipItemImagePayload): void {
  const db = getDatabase()
  const thumbnail =
    payload.thumbnailBase64 && payload.thumbnailBase64.length > 0
      ? Buffer.from(payload.thumbnailBase64, 'base64')
      : null

  db.prepare('UPDATE clip_items SET content = ?, thumbnail = ?, updated_at = ? WHERE id = ?').run(
    payload.contentBase64,
    thumbnail,
    Date.now(),
    id
  )
}

export function updateClipItemOcrText(id: string, text: string): void {
  const db = getDatabase()
  db.prepare('UPDATE clip_items SET ocr_text = ?, updated_at = ? WHERE id = ?').run(
    text,
    Date.now(),
    id
  )
}

export function deleteClipItem(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM clip_items WHERE id = ?').run(id)
}

export function deleteClipItems(ids: string[]): void {
  const uniqueIds = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return

  const db = getDatabase()
  const placeholders = uniqueIds.map(() => '?').join(', ')
  db.prepare(`DELETE FROM clip_items WHERE id IN (${placeholders})`).run(...uniqueIds)
}

export function clearClipItems(): void {
  const db = getDatabase()
  db.exec('DELETE FROM clip_items')
}

export function searchClipItems(filters: SearchFilters): ClipItem[] {
  const db = getDatabase()
  const query = (filters.query ?? '').trim()
  const types = filters.types ?? []
  const sourceApp = filters.sourceApp ?? null
  const dateFrom = filters.dateFrom ?? null
  const dateTo = filters.dateTo ?? null
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)
  const offset = Math.max(filters.offset ?? 0, 0)

  const conditions: string[] = []
  const params: unknown[] = []

  if (query) {
    const like = `%${query}%`
    conditions.push('(ci.plain_text LIKE ? OR ci.title LIKE ? OR ci.ocr_text LIKE ?)')
    params.push(like, like, like)
  }

  if (types.length > 0) {
    conditions.push(`ci.type IN (${types.map(() => '?').join(', ')})`)
    params.push(...types)
  }

  if (sourceApp) {
    conditions.push('ci.source_app = ?')
    params.push(sourceApp)
  }

  if (dateFrom !== null) {
    conditions.push('ci.created_at >= ?')
    params.push(dateFrom)
  }

  if (dateTo !== null) {
    conditions.push('ci.created_at <= ?')
    params.push(dateTo)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `
    SELECT ci.*
    FROM clip_items ci
    ${whereClause}
    ORDER BY ci.created_at DESC
    LIMIT ? OFFSET ?
  `

  params.push(limit, offset)
  return db.prepare(sql).all(...params) as ClipItem[]
}

export function getSourceAppSummaries(): SourceAppSummary[] {
  const db = getDatabase()
  const sql = `
    SELECT
      source_app,
      source_app_name,
      COUNT(1) as count
    FROM clip_items
    WHERE source_app IS NOT NULL
    GROUP BY source_app, source_app_name
    ORDER BY count DESC
    LIMIT 80
  `

  return db.prepare(sql).all() as SourceAppSummary[]
}

export function getClipItemsForSync(): ClipItem[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM clip_items ORDER BY created_at DESC').all() as ClipItem[]
}

export function upsertClipItems(items: ClipItem[]): void {
  if (items.length === 0) return

  const db = getDatabase()
  const stmt = db.prepare(
    `
      INSERT INTO clip_items (
        id, type, content, plain_text, ocr_text,
        source_app, source_app_name, title,
        thumbnail, link_meta,
        is_pinned, is_confidential,
        created_at, updated_at
      )
      VALUES (
        @id, @type, @content, @plain_text, @ocr_text,
        @source_app, @source_app_name, @title,
        @thumbnail, @link_meta,
        @is_pinned, @is_confidential,
        @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        content = excluded.content,
        plain_text = excluded.plain_text,
        ocr_text = excluded.ocr_text,
        source_app = excluded.source_app,
        source_app_name = excluded.source_app_name,
        title = excluded.title,
        thumbnail = excluded.thumbnail,
        link_meta = excluded.link_meta,
        is_pinned = excluded.is_pinned,
        is_confidential = excluded.is_confidential,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= clip_items.updated_at
    `
  )

  const tx = db.transaction((rows: ClipItem[]) => {
    for (const row of rows) {
      stmt.run({
        id: row.id,
        type: row.type,
        content: row.content,
        plain_text: row.plain_text,
        ocr_text: row.ocr_text,
        source_app: row.source_app,
        source_app_name: row.source_app_name,
        title: row.title,
        thumbnail: row.thumbnail ? Buffer.from(row.thumbnail) : null,
        link_meta: row.link_meta,
        is_pinned: row.is_pinned,
        is_confidential: row.is_confidential,
        created_at: row.created_at,
        updated_at: row.updated_at
      })
    }
  })

  tx(items)
}
