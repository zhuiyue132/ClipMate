import Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'

const HISTORY_LIMIT = 200
const SEARCH_LIMIT = 200
const SEED_COUNT = 600
const SEARCH_QUERY = 'project alpha'
const LEGACY_POLL_MS = 220
const OPTIMIZED_IDLE_POLL_MS = 660

const LARGE_IMAGE_BASE64 = Buffer.alloc(160 * 1024, 7).toString('base64')
const THUMBNAIL_BUFFER = Buffer.alloc(8 * 1024, 19)

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateText(value, limit = 220) {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return null
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function parseLinkMeta(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function parseFilePaths(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.paths) ? parsed.paths : []
  } catch {
    return []
  }
}

function buildSummary(row) {
  const meta = parseLinkMeta(row.link_meta)
  const filePaths = row.type === 'file' ? parseFilePaths(row.lightweight_content) : []
  const fileLabel = filePaths[0]?.split('/').pop() ?? null
  const fileCount = filePaths.length || null
  const linkTitle = truncateText(meta?.title, 140)
  const linkDescription = truncateText(meta?.description, 180)
  const linkUrl = row.type === 'link' ? truncateText(row.lightweight_content, 200) : null

  let contentPreview = truncateText(row.plain_text)
  if (row.type === 'image') contentPreview = '图片'
  if (row.type === 'file') {
    contentPreview =
      fileLabel && fileCount && fileCount > 1 ? `${fileLabel} 等 ${fileCount} 个文件` : fileLabel || '文件'
  }
  if (row.type === 'link') {
    contentPreview = linkTitle || linkUrl || truncateText(row.plain_text)
  }
  if (row.type === 'color') {
    contentPreview = truncateText(row.lightweight_content, 60)
  }

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    source_app: row.source_app,
    source_app_name: row.source_app_name,
    plain_text_preview: truncateText(row.plain_text),
    content_preview: contentPreview,
    ocr_text_preview: truncateText(row.ocr_text),
    image_preview: row.type === 'image' ? `data:image/png;base64,${row.thumbnail.toString('base64')}` : null,
    link_title: linkTitle,
    link_description: linkDescription,
    link_url: linkUrl,
    file_label: fileLabel,
    file_count: fileCount,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function buildFtsQuery(query) {
  return Array.from(normalizeWhitespace(query).matchAll(/[\p{Letter}\p{Number}_]+/gu))
    .map((match) => match[0])
    .map((token) => `${token}*`)
    .join(' AND ')
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE clip_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      plain_text TEXT,
      ocr_text TEXT,
      source_app TEXT,
      source_app_name TEXT,
      title TEXT,
      thumbnail BLOB,
      link_meta TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_confidential INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX idx_clip_items_created_at ON clip_items(created_at DESC);
    CREATE INDEX idx_clip_items_type ON clip_items(type);
    CREATE INDEX idx_clip_items_source_app ON clip_items(source_app);

    CREATE VIRTUAL TABLE clip_items_fts USING fts5(
      id UNINDEXED,
      plain_text,
      title,
      ocr_text,
      link_text
    );
  `)
}

function seedData(db) {
  const insertItem = db.prepare(`
    INSERT INTO clip_items (
      id, type, content, plain_text, ocr_text,
      source_app, source_app_name, title,
      thumbnail, link_meta,
      is_pinned, is_confidential,
      created_at, updated_at
    ) VALUES (
      @id, @type, @content, @plain_text, @ocr_text,
      @source_app, @source_app_name, @title,
      @thumbnail, @link_meta,
      0, 0,
      @created_at, @updated_at
    )
  `)

  const insertFts = db.prepare(`
    INSERT INTO clip_items_fts (id, plain_text, title, ocr_text, link_text)
    VALUES (@id, @plain_text, @title, @ocr_text, @link_text)
  `)

  const tx = db.transaction(() => {
    for (let index = 0; index < SEED_COUNT; index += 1) {
      const createdAt = Date.now() - index * 37_000
      const kind = index % 20
      let row

      if (kind < 7) {
        row = {
          id: `text-${index}`,
          type: kind % 2 === 0 ? 'text' : 'richtext',
          content:
            kind % 2 === 0
              ? `ClipMate project alpha note ${index} for search benchmark and panel rendering`
              : `<p>ClipMate <strong>project alpha</strong> rich text block ${index}</p>`,
          plain_text: `ClipMate project alpha note ${index} for search benchmark and panel rendering`,
          ocr_text: null,
          source_app: 'com.apple.TextEdit',
          source_app_name: 'TextEdit',
          title: `Note ${index}`,
          thumbnail: null,
          link_meta: null,
          created_at: createdAt,
          updated_at: createdAt
        }
      } else if (kind < 10) {
        row = {
          id: `link-${index}`,
          type: 'link',
          content: `https://example.com/project-alpha/${index}`,
          plain_text: `https://example.com/project-alpha/${index}`,
          ocr_text: null,
          source_app: 'com.apple.Safari',
          source_app_name: 'Safari',
          title: `Alpha Link ${index}`,
          thumbnail: null,
          link_meta: JSON.stringify({
            title: `Project Alpha Landing ${index}`,
            description: `Commercial-style interaction benchmark page ${index} for ClipMate project alpha`
          }),
          created_at: createdAt,
          updated_at: createdAt
        }
      } else if (kind < 13) {
        row = {
          id: `image-${index}`,
          type: 'image',
          content: LARGE_IMAGE_BASE64,
          plain_text: null,
          ocr_text: `project alpha screenshot ${index}`,
          source_app: 'com.apple.Preview',
          source_app_name: 'Preview',
          title: `Screenshot ${index}`,
          thumbnail: THUMBNAIL_BUFFER,
          link_meta: null,
          created_at: createdAt,
          updated_at: createdAt
        }
      } else if (kind < 17) {
        row = {
          id: `file-${index}`,
          type: 'file',
          content: JSON.stringify({
            paths: [
              `/Users/demo/Documents/Project Alpha ${index}.pdf`,
              `/Users/demo/Documents/Project Alpha ${index}.png`
            ]
          }),
          plain_text: `/Users/demo/Documents/Project Alpha ${index}.pdf\n/Users/demo/Documents/Project Alpha ${index}.png`,
          ocr_text: null,
          source_app: 'com.apple.finder',
          source_app_name: 'Finder',
          title: `Files ${index}`,
          thumbnail: null,
          link_meta: null,
          created_at: createdAt,
          updated_at: createdAt
        }
      } else {
        row = {
          id: `color-${index}`,
          type: 'color',
          content: '#33a1ff',
          plain_text: '#33a1ff',
          ocr_text: null,
          source_app: 'com.apple.Keynote',
          source_app_name: 'Keynote',
          title: `Color ${index}`,
          thumbnail: null,
          link_meta: null,
          created_at: createdAt,
          updated_at: createdAt
        }
      }

      insertItem.run(row)
      const meta = parseLinkMeta(row.link_meta)
      insertFts.run({
        id: row.id,
        plain_text: normalizeWhitespace(row.plain_text),
        title: normalizeWhitespace(row.title),
        ocr_text: normalizeWhitespace(row.ocr_text),
        link_text:
          row.type === 'link'
            ? normalizeWhitespace(
                [row.content, meta?.title ?? '', meta?.description ?? ''].filter(Boolean).join(' ')
              )
            : ''
      })
    }
  })

  tx()
}

function benchmark(fn, iterations = 45) {
  for (let index = 0; index < 5; index += 1) {
    fn()
  }

  const timings = []
  let result = null
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    result = fn()
    timings.push(performance.now() - startedAt)
  }

  const sorted = [...timings].sort((left, right) => left - right)
  const avg = timings.reduce((sum, value) => sum + value, 0) / timings.length
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return { avgMs: avg, p95Ms: p95, result }
}

function stringifyBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function main() {
  const db = new Database(':memory:')
  createSchema(db)
  seedData(db)

  const legacyHistoryStmt = db.prepare(`
    SELECT *
    FROM clip_items
    ORDER BY created_at DESC
    LIMIT ? OFFSET 0
  `)

  const optimizedHistoryStmt = db.prepare(`
    SELECT
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
    FROM clip_items ci
    ORDER BY ci.created_at DESC
    LIMIT ? OFFSET 0
  `)

  const legacySearchStmt = db.prepare(`
    SELECT *
    FROM clip_items
    WHERE (
      plain_text LIKE ? OR
      title LIKE ? OR
      ocr_text LIKE ? OR
      content LIKE ? OR
      link_meta LIKE ?
    )
    ORDER BY created_at DESC
    LIMIT ? OFFSET 0
  `)

  const optimizedSearchStmt = db.prepare(`
    SELECT
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
    FROM clip_items_fts
    JOIN clip_items ci ON ci.id = clip_items_fts.id
    WHERE clip_items_fts MATCH ?
    ORDER BY ci.created_at DESC
    LIMIT ? OFFSET 0
  `)

  const legacyHistory = benchmark(() => legacyHistoryStmt.all(HISTORY_LIMIT))
  const optimizedHistory = benchmark(() =>
    optimizedHistoryStmt.all(HISTORY_LIMIT).map((row) => buildSummary(row))
  )

  const like = `%${SEARCH_QUERY}%`
  const legacySearch = benchmark(() =>
    legacySearchStmt.all(like, like, like, like, like, SEARCH_LIMIT)
  )
  const optimizedSearch = benchmark(() =>
    optimizedSearchStmt.all(buildFtsQuery(SEARCH_QUERY), SEARCH_LIMIT).map((row) => buildSummary(row))
  )

  const report = {
    dataset: {
      seededItems: SEED_COUNT,
      historyLimit: HISTORY_LIMIT,
      searchLimit: SEARCH_LIMIT,
      searchQuery: SEARCH_QUERY
    },
    legacy: {
      historyAvgMs: Number(legacyHistory.avgMs.toFixed(3)),
      historyP95Ms: Number(legacyHistory.p95Ms.toFixed(3)),
      historyPayloadBytes: stringifyBytes(legacyHistory.result),
      searchAvgMs: Number(legacySearch.avgMs.toFixed(3)),
      searchP95Ms: Number(legacySearch.p95Ms.toFixed(3)),
      searchPayloadBytes: stringifyBytes(legacySearch.result),
      idlePollsPerMinute: Math.round(60_000 / LEGACY_POLL_MS)
    },
    optimized: {
      historyAvgMs: Number(optimizedHistory.avgMs.toFixed(3)),
      historyP95Ms: Number(optimizedHistory.p95Ms.toFixed(3)),
      historyPayloadBytes: stringifyBytes(optimizedHistory.result),
      searchAvgMs: Number(optimizedSearch.avgMs.toFixed(3)),
      searchP95Ms: Number(optimizedSearch.p95Ms.toFixed(3)),
      searchPayloadBytes: stringifyBytes(optimizedSearch.result),
      idlePollsPerMinute: Math.round(60_000 / OPTIMIZED_IDLE_POLL_MS)
    }
  }

  report.improvement = {
    historyPayloadReductionPct: Number(
      (
        ((report.legacy.historyPayloadBytes - report.optimized.historyPayloadBytes) /
          report.legacy.historyPayloadBytes) *
        100
      ).toFixed(2)
    ),
    searchPayloadReductionPct: Number(
      (
        ((report.legacy.searchPayloadBytes - report.optimized.searchPayloadBytes) /
          report.legacy.searchPayloadBytes) *
        100
      ).toFixed(2)
    ),
    idlePollReductionPct: Number(
      (
        ((report.legacy.idlePollsPerMinute - report.optimized.idlePollsPerMinute) /
          report.legacy.idlePollsPerMinute) *
        100
      ).toFixed(2)
    )
  }

  console.log(JSON.stringify(report, null, 2))
  setImmediate(() => process.exit(0))
}

main()
