import Database from 'better-sqlite3'

function parseArgs(argv) {
  const ids = []
  let dbPath = null
  let allImages = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--db') {
      dbPath = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (arg === '--id') {
      const id = argv[index + 1] ?? null
      if (id) {
        ids.push(id)
      }
      index += 1
      continue
    }

    if (arg === '--all-images') {
      allImages = true
    }
  }

  return { dbPath, ids, allImages }
}

function printUsage() {
  console.log(`Usage:
  npm run ocr:reprocess -- --db /absolute/path/to/clipmate.db --id <clip-item-id>
  npm run ocr:reprocess -- --db /absolute/path/to/clipmate.db --all-images`)
}

const { dbPath, ids, allImages } = parseArgs(process.argv.slice(2))

if (!dbPath || (!allImages && ids.length === 0)) {
  printUsage()
  process.exit(1)
}

const db = new Database(dbPath)

try {
  let changed = 0
  const now = Date.now()

  if (allImages) {
    const result = db
      .prepare(
        `
        UPDATE clip_items
        SET ocr_text = NULL, updated_at = ?
        WHERE type = 'image'
      `
      )
      .run(now)

    changed = result.changes
  } else {
    const uniqueIds = Array.from(new Set(ids))
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const result = db
      .prepare(
        `
        UPDATE clip_items
        SET ocr_text = NULL, updated_at = ?
        WHERE type = 'image' AND id IN (${placeholders})
      `
      )
      .run(now, ...uniqueIds)

    changed = result.changes
  }

  console.log(`[ocr] reset ${changed} image item(s). Relaunch ClipMate or wait for the OCR worker to reprocess them.`)
} finally {
  db.close()
}
