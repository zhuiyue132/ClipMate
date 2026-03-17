import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'clipmate.db')
}

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  db = new Database(dbPath)

  // 开启 WAL 模式以提升并发性能
  db.pragma('journal_mode = WAL')

  createTables(db)
  return db
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('text', 'richtext', 'link', 'image', 'file', 'color')),
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

    CREATE INDEX IF NOT EXISTS idx_clip_items_created_at ON clip_items(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clip_items_type ON clip_items(type);
    CREATE INDEX IF NOT EXISTS idx_clip_items_source_app ON clip_items(source_app);

    CREATE TABLE IF NOT EXISTS pinboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#007AFF',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pinboard_items (
      pinboard_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (pinboard_id, item_id),
      FOREIGN KEY (pinboard_id) REFERENCES pinboards(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES clip_items(id) ON DELETE CASCADE
    );
  `)
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
