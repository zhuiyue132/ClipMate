import type { ClipItem, ClipItemSummary, SearchFilters, SourceAppSummary } from '../../shared/types'
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

interface ClipItemSummaryRow {
  id: string
  type: ClipItem['type']
  title: string | null
  source_app: string | null
  source_app_name: string | null
  plain_text: string | null
  ocr_text: string | null
  lightweight_content: string | null
  thumbnail: Buffer | null
  link_meta: string | null
  created_at: number
  updated_at: number
}

interface LinkMetaShape {
  title?: string
  description?: string
}

interface SearchDoc {
  id: string
  plainText: string
  title: string
  ocrText: string
  linkText: string
}

const SUMMARY_TEXT_LIMIT = 220
const SUMMARY_SELECT_COLUMNS = `
  ci.id,
  ci.type,
  ci.title,
  ci.source_app,
  ci.source_app_name,
  ci.plain_text,
  ci.ocr_text,
  CASE
    WHEN ci.type IN ('link', 'color', 'file') THEN ci.content
    ELSE NULL
  END AS lightweight_content,
  ci.thumbnail,
  ci.link_meta,
  ci.created_at,
  ci.updated_at
`

let searchIndexState: 'unknown' | 'ready' | 'failed' = 'unknown'
let searchIndexBootstrapped = false

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function truncateText(value: string | null | undefined, limit = SUMMARY_TEXT_LIMIT): string | null {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return null
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function parseLinkMeta(linkMeta: string | null | undefined): LinkMetaShape | null {
  if (!linkMeta) return null
  try {
    return JSON.parse(linkMeta) as LinkMetaShape
  } catch {
    return null
  }
}

function parseFilePaths(content: string | null | undefined): string[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content) as { paths?: string[] }
    return Array.isArray(parsed.paths) ? parsed.paths.filter(Boolean) : []
  } catch {
    return []
  }
}

function toFileLabel(filePaths: string[], plainText: string | null): string | null {
  const firstPath = filePaths[0]
  if (firstPath) {
    const parts = firstPath.split('/')
    return parts.at(-1) ?? firstPath
  }

  const firstLine = plainText
    ?.split('\n')
    .map((value) => value.trim())
    .find(Boolean)
  return firstLine ?? null
}

function bufferToDataUrl(buffer: Buffer | null): string | null {
  if (!buffer || buffer.length === 0) return null
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function buildClipItemSummary(row: ClipItemSummaryRow): ClipItemSummary {
  const meta = parseLinkMeta(row.link_meta)
  const plainTextPreview = truncateText(row.plain_text)
  const ocrTextPreview = truncateText(row.ocr_text)
  const linkTitle = truncateText(meta?.title, 140)
  const linkDescription = truncateText(meta?.description, 180)
  const imagePreview = row.type === 'image' ? bufferToDataUrl(row.thumbnail) : null
  const linkUrl = row.type === 'link' ? truncateText(row.lightweight_content, 200) : null
  const filePaths = row.type === 'file' ? parseFilePaths(row.lightweight_content) : []
  const fileLabel = row.type === 'file' ? toFileLabel(filePaths, row.plain_text) : null
  const fileCount = row.type === 'file' ? filePaths.length || null : null

  let contentPreview: string | null
  switch (row.type) {
    case 'image':
      contentPreview = '图片'
      break
    case 'file':
      if (fileLabel && fileCount && fileCount > 1) {
        contentPreview = `${fileLabel} 等 ${fileCount} 个文件`
      } else {
        contentPreview = fileLabel ?? '文件'
      }
      break
    case 'link':
      contentPreview = linkTitle ?? linkUrl ?? plainTextPreview
      break
    case 'color':
      contentPreview = truncateText(row.lightweight_content, 60)
      break
    default:
      contentPreview = plainTextPreview
      break
  }

  return {
    id: row.id,
    type: row.type,
    title: row.title?.trim() || null,
    source_app: row.source_app,
    source_app_name: row.source_app_name,
    plain_text_preview: plainTextPreview,
    content_preview: contentPreview,
    ocr_text_preview: ocrTextPreview,
    image_preview: imagePreview,
    link_title: linkTitle,
    link_description: linkDescription,
    link_url: linkUrl,
    file_label: fileLabel,
    file_count: fileCount,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function readClipItemRowById(id: string): ClipItem | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clip_items WHERE id = ?').get(id) as ClipItem | undefined
  return row ?? null
}

function buildSearchDoc(row: ClipItem): SearchDoc {
  const meta = parseLinkMeta(row.link_meta)
  const linkText =
    row.type === 'link'
      ? normalizeWhitespace(
          [row.content, meta?.title ?? '', meta?.description ?? ''].filter(Boolean).join(' ')
        )
      : ''

  return {
    id: row.id,
    plainText: normalizeWhitespace(row.plain_text),
    title: normalizeWhitespace(row.title),
    ocrText: normalizeWhitespace(row.ocr_text),
    linkText
  }
}

function ensureSearchIndexSchema(): boolean {
  const db = getDatabase()

  if (searchIndexState === 'failed') return false
  if (searchIndexState === 'unknown') {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS clip_items_fts USING fts5(
          id UNINDEXED,
          plain_text,
          title,
          ocr_text,
          link_text
        );
      `)
      searchIndexState = 'ready'
    } catch (error) {
      searchIndexState = 'failed'
      console.warn(
        '[database] failed to initialize clip_items_fts, falling back to LIKE search',
        error
      )
      return false
    }
  }

  if (!searchIndexBootstrapped) {
    const counts = db
      .prepare(
        `
        SELECT
          (SELECT COUNT(1) FROM clip_items) AS itemCount,
          (SELECT COUNT(1) FROM clip_items_fts) AS indexCount
      `
      )
      .get() as { itemCount: number; indexCount: number }

    if (counts.itemCount !== counts.indexCount) {
      rebuildSearchIndex()
    }
    searchIndexBootstrapped = true
  }

  return true
}

function rebuildSearchIndex(): void {
  const db = getDatabase()
  if (searchIndexState !== 'ready' && !ensureSearchIndexSchema()) return

  const rows = db.prepare('SELECT * FROM clip_items').all() as ClipItem[]
  const insertStmt = db.prepare(
    `
      INSERT INTO clip_items_fts (id, plain_text, title, ocr_text, link_text)
      VALUES (@id, @plain_text, @title, @ocr_text, @link_text)
    `
  )

  const tx = db.transaction((items: ClipItem[]) => {
    db.prepare('DELETE FROM clip_items_fts').run()
    for (const row of items) {
      const doc = buildSearchDoc(row)
      insertStmt.run({
        id: doc.id,
        plain_text: doc.plainText,
        title: doc.title,
        ocr_text: doc.ocrText,
        link_text: doc.linkText
      })
    }
  })

  tx(rows)
  searchIndexBootstrapped = true
}

function upsertSearchIndexEntry(id: string): void {
  if (!ensureSearchIndexSchema()) return

  const db = getDatabase()
  const row = readClipItemRowById(id)
  if (!row) {
    db.prepare('DELETE FROM clip_items_fts WHERE id = ?').run(id)
    return
  }

  const doc = buildSearchDoc(row)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM clip_items_fts WHERE id = ?').run(id)
    db.prepare(
      `
        INSERT INTO clip_items_fts (id, plain_text, title, ocr_text, link_text)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(doc.id, doc.plainText, doc.title, doc.ocrText, doc.linkText)
  })

  tx()
}

function deleteSearchIndexEntries(ids: string[]): void {
  if (!ensureSearchIndexSchema()) return

  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (uniqueIds.length === 0) return

  const db = getDatabase()
  const placeholders = uniqueIds.map(() => '?').join(', ')
  db.prepare(`DELETE FROM clip_items_fts WHERE id IN (${placeholders})`).run(...uniqueIds)
}

function clearSearchIndex(): void {
  if (!ensureSearchIndexSchema()) return
  const db = getDatabase()
  db.prepare('DELETE FROM clip_items_fts').run()
  searchIndexBootstrapped = true
}

function buildSummaryRows(sql: string, ...params: unknown[]): ClipItemSummary[] {
  const db = getDatabase()
  const rows = db.prepare(sql).all(...params) as ClipItemSummaryRow[]
  return rows.map(buildClipItemSummary)
}

function buildFtsQuery(query: string): string | null {
  const tokens = Array.from(normalizeWhitespace(query).matchAll(/[\p{Letter}\p{Number}_]+/gu)).map(
    (match) => match[0]
  )

  if (tokens.length === 0) return null
  return tokens.map((token) => `${token}*`).join(' AND ')
}

export function getClipItems(limit = 50, offset = 0): ClipItemSummary[] {
  return buildSummaryRows(
    `
      SELECT ${SUMMARY_SELECT_COLUMNS}
      FROM clip_items ci
      ORDER BY ci.created_at DESC
      LIMIT ? OFFSET ?
    `,
    limit,
    offset
  )
}

export function getClipItemSummaryById(id: string): ClipItemSummary | null {
  const [row] = buildSummaryRows(
    `
      SELECT ${SUMMARY_SELECT_COLUMNS}
      FROM clip_items ci
      WHERE ci.id = ?
      LIMIT 1
    `,
    id
  )

  return row ?? null
}

export function getClipItemById(id: string): ClipItem | null {
  return readClipItemRowById(id)
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

  upsertSearchIndexEntry(record.id)
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
  upsertSearchIndexEntry(id)
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
  upsertSearchIndexEntry(id)
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
  upsertSearchIndexEntry(id)
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
  upsertSearchIndexEntry(id)
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
  upsertSearchIndexEntry(id)
}

export function updateClipItemOcrText(id: string, text: string): void {
  const db = getDatabase()
  db.prepare('UPDATE clip_items SET ocr_text = ?, updated_at = ? WHERE id = ?').run(
    text,
    Date.now(),
    id
  )
  upsertSearchIndexEntry(id)
}

export function updateClipItemLinkMeta(id: string, linkMeta: string | null): void {
  const db = getDatabase()
  db.prepare('UPDATE clip_items SET link_meta = ?, updated_at = ? WHERE id = ?').run(
    linkMeta,
    Date.now(),
    id
  )
  upsertSearchIndexEntry(id)
}

export function deleteClipItem(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM clip_items WHERE id = ?').run(id)
  deleteSearchIndexEntries([id])
}

export function deleteClipItems(ids: string[]): void {
  const uniqueIds = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return

  const db = getDatabase()
  const placeholders = uniqueIds.map(() => '?').join(', ')
  db.prepare(`DELETE FROM clip_items WHERE id IN (${placeholders})`).run(...uniqueIds)
  deleteSearchIndexEntries(uniqueIds)
}

export function clearClipItems(): void {
  const db = getDatabase()
  db.exec('DELETE FROM clip_items')
  clearSearchIndex()
}

export function searchClipItems(filters: SearchFilters): ClipItemSummary[] {
  const query = (filters.query ?? '').trim()
  const types = filters.types ?? []
  const sourceApp = filters.sourceApp ?? null
  const dateFrom = filters.dateFrom ?? null
  const dateTo = filters.dateTo ?? null
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)
  const offset = Math.max(filters.offset ?? 0, 0)
  const ftsQuery = query ? buildFtsQuery(query) : null
  const useFts = Boolean(ftsQuery) && ensureSearchIndexSchema()

  const conditions: string[] = []
  const params: unknown[] = []
  const fromClause = useFts
    ? 'FROM clip_items_fts JOIN clip_items ci ON ci.id = clip_items_fts.id'
    : 'FROM clip_items ci'

  if (useFts && ftsQuery) {
    conditions.push('clip_items_fts MATCH ?')
    params.push(ftsQuery)
  } else if (query) {
    const like = `%${query}%`
    conditions.push(
      "(ci.plain_text LIKE ? OR ci.title LIKE ? OR ci.ocr_text LIKE ? OR (ci.type = 'link' AND ci.content LIKE ?))"
    )
    params.push(like, like, like, like)
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
    SELECT ${SUMMARY_SELECT_COLUMNS}
    ${fromClause}
    ${whereClause}
    ORDER BY ci.created_at DESC
    LIMIT ? OFFSET ?
  `

  params.push(limit, offset)
  return buildSummaryRows(sql, ...params)
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
  rebuildSearchIndex()
}
