import { app, ipcMain, systemPreferences } from 'electron'
import { getDatabase } from '../database'
import { toggleMainWindow, createSettingsWindow, getMainWindow } from '../windows'
import { v4 as uuidv4 } from 'uuid'
import type { Pinboard, SearchFilters } from '../../shared/types'
import { copyClipItem, isClipboardPaused, pasteClipItem, setClipboardPaused } from '../clipboard'

export function setupIpcHandlers(): void {
  const updatePinnedFlag = (itemId: string): void => {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(1) as count FROM pinboard_items WHERE item_id = ?')
      .get(itemId) as { count: number }
    db.prepare('UPDATE clip_items SET is_pinned = ? WHERE id = ?').run(
      row.count > 0 ? 1 : 0,
      itemId
    )
  }

  // ===== 数据库操作 =====

  ipcMain.handle('db:getClipItems', (_event, limit = 50, offset = 0) => {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM clip_items ORDER BY created_at DESC LIMIT ? OFFSET ?')
    return stmt.all(limit, offset)
  })

  ipcMain.handle('db:getClipItem', (_event, id: string) => {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM clip_items WHERE id = ?')
    return stmt.get(id) || null
  })

  ipcMain.handle('db:updateClipItemTitle', (_event, id: string, title: string | null) => {
    const db = getDatabase()
    const next = title?.trim() ? title.trim() : null
    db.prepare('UPDATE clip_items SET title = ?, updated_at = ? WHERE id = ?').run(
      next,
      Date.now(),
      id
    )
  })

  ipcMain.handle('db:updateClipItemText', (_event, id: string, text: string) => {
    const db = getDatabase()
    const next = text ?? ''
    db.prepare(
      'UPDATE clip_items SET type = ?, content = ?, plain_text = ?, updated_at = ? WHERE id = ?'
    ).run('text', next, next, Date.now(), id)
  })

  ipcMain.handle('db:updateClipItemColor', (_event, id: string, color: string) => {
    const db = getDatabase()
    const next = color?.trim() ?? ''
    db.prepare(
      'UPDATE clip_items SET content = ?, plain_text = ?, updated_at = ? WHERE id = ?'
    ).run(next, next, Date.now(), id)
  })

  ipcMain.handle(
    'db:updateClipItemImage',
    (_event, id: string, payload: { contentBase64: string; thumbnailBase64?: string | null }) => {
      const db = getDatabase()
      const thumb =
        payload.thumbnailBase64 && payload.thumbnailBase64.length > 0
          ? Buffer.from(payload.thumbnailBase64, 'base64')
          : null
      db.prepare(
        'UPDATE clip_items SET content = ?, thumbnail = ?, updated_at = ? WHERE id = ?'
      ).run(payload.contentBase64, thumb, Date.now(), id)
    }
  )

  ipcMain.handle('db:deleteClipItem', (_event, id: string) => {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM clip_items WHERE id = ?')
    stmt.run(id)
  })

  ipcMain.handle('db:deleteClipItems', (_event, ids: string[]) => {
    const db = getDatabase()
    const list = Array.from(new Set((ids ?? []).filter(Boolean)))
    if (list.length === 0) return
    const placeholders = list.map(() => '?').join(', ')
    db.prepare(`DELETE FROM clip_items WHERE id IN (${placeholders})`).run(...list)
  })

  ipcMain.handle('db:clearHistory', () => {
    const db = getDatabase()
    db.exec('DELETE FROM clip_items WHERE is_pinned = 0')
  })

  ipcMain.handle('db:searchClipItems', (_event, filters: SearchFilters) => {
    const db = getDatabase()
    const query = (filters.query ?? '').trim()
    const types = filters.types ?? []
    const sourceApp = filters.sourceApp ?? null
    const dateFrom = filters.dateFrom ?? null
    const dateTo = filters.dateTo ?? null
    const pinboardId = filters.pinboardId ?? null
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)
    const offset = Math.max(filters.offset ?? 0, 0)

    const conditions: string[] = []
    const params: unknown[] = []

    let fromClause = 'clip_items ci'
    if (pinboardId) {
      fromClause = 'pinboard_items pbi JOIN clip_items ci ON ci.id = pbi.item_id'
      conditions.push('pbi.pinboard_id = ?')
      params.push(pinboardId)
    }

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
    const orderClause = pinboardId ? 'ORDER BY pbi.sort_order ASC' : 'ORDER BY ci.created_at DESC'

    const sql = `
      SELECT ci.*
      FROM ${fromClause}
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `

    params.push(limit, offset)
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('db:getSourceApps', () => {
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
    return db.prepare(sql).all()
  })

  // ===== 剪贴板动作 =====

  ipcMain.handle('clip:getState', () => {
    return { paused: isClipboardPaused() }
  })

  ipcMain.handle('clip:setPaused', (_event, paused: boolean) => {
    setClipboardPaused(paused)
  })

  ipcMain.handle('clip:pasteItem', (_event, id: string, options?: { plainText?: boolean }) => {
    pasteClipItem(id, options)
  })

  ipcMain.handle('clip:copyItem', (_event, id: string, options?: { plainText?: boolean }) => {
    copyClipItem(id, options)
  })

  // ===== Pinboard 操作 =====

  ipcMain.handle('db:getPinboards', () => {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM pinboards ORDER BY sort_order ASC')
    return stmt.all()
  })

  ipcMain.handle('db:createPinboard', (_event, name: string, color: string): Pinboard => {
    const db = getDatabase()
    const id = uuidv4()
    const now = Date.now()
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM pinboards').get() as {
      max: number | null
    }
    const sortOrder = (maxOrder?.max ?? -1) + 1
    const stmt = db.prepare(
      'INSERT INTO pinboards (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(id, name, color, sortOrder, now)
    return { id, name, color, sort_order: sortOrder, created_at: now }
  })

  ipcMain.handle('db:deletePinboard', (_event, id: string) => {
    const db = getDatabase()
    const affected = db
      .prepare('SELECT item_id FROM pinboard_items WHERE pinboard_id = ?')
      .all(id) as Array<{ item_id: string }>
    const deleteItems = db.prepare('DELETE FROM pinboard_items WHERE pinboard_id = ?')
    const deleteBoard = db.prepare('DELETE FROM pinboards WHERE id = ?')
    const transaction = db.transaction(() => {
      deleteItems.run(id)
      deleteBoard.run(id)
      for (const row of affected) updatePinnedFlag(row.item_id)
    })
    transaction()
  })

  ipcMain.handle('db:renamePinboard', (_event, id: string, name: string) => {
    const db = getDatabase()
    db.prepare('UPDATE pinboards SET name = ? WHERE id = ?').run(name, id)
  })

  ipcMain.handle('db:getPinboardItems', (_event, pinboardId: string) => {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT ci.*
      FROM pinboard_items pbi
      JOIN clip_items ci ON ci.id = pbi.item_id
      WHERE pbi.pinboard_id = ?
      ORDER BY pbi.sort_order ASC
    `)
    return stmt.all(pinboardId)
  })

  ipcMain.handle('db:addItemToPinboard', (_event, pinboardId: string, itemId: string) => {
    const db = getDatabase()
    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM pinboard_items WHERE pinboard_id = ?')
      .get(pinboardId) as { max: number | null }
    const sortOrder = (maxOrder?.max ?? -1) + 1

    const insert = db.prepare(
      'INSERT OR IGNORE INTO pinboard_items (pinboard_id, item_id, sort_order) VALUES (?, ?, ?)'
    )

    const tx = db.transaction(() => {
      insert.run(pinboardId, itemId, sortOrder)
      updatePinnedFlag(itemId)
    })
    tx()
  })

  ipcMain.handle('db:addItemsToPinboard', (_event, pinboardId: string, itemIds: string[]) => {
    const db = getDatabase()
    const unique = Array.from(new Set((itemIds ?? []).filter(Boolean)))
    if (unique.length === 0) return

    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM pinboard_items WHERE pinboard_id = ?')
      .get(pinboardId) as { max: number | null }
    let sortOrder = (maxOrder?.max ?? -1) + 1

    const insert = db.prepare(
      'INSERT OR IGNORE INTO pinboard_items (pinboard_id, item_id, sort_order) VALUES (?, ?, ?)'
    )

    const tx = db.transaction(() => {
      for (const itemId of unique) {
        insert.run(pinboardId, itemId, sortOrder++)
        updatePinnedFlag(itemId)
      }
    })
    tx()
  })

  ipcMain.handle('db:removeItemFromPinboard', (_event, pinboardId: string, itemId: string) => {
    const db = getDatabase()
    const del = db.prepare('DELETE FROM pinboard_items WHERE pinboard_id = ? AND item_id = ?')
    const tx = db.transaction(() => {
      del.run(pinboardId, itemId)
      updatePinnedFlag(itemId)
    })
    tx()
  })

  ipcMain.handle('db:reorderPinboardItems', (_event, pinboardId: string, itemIds: string[]) => {
    const db = getDatabase()
    const update = db.prepare(
      'UPDATE pinboard_items SET sort_order = ? WHERE pinboard_id = ? AND item_id = ?'
    )
    const tx = db.transaction(() => {
      itemIds.forEach((itemId, index) => {
        update.run(index, pinboardId, itemId)
      })
    })
    tx()
  })

  // ===== 窗口操作 =====

  ipcMain.on('window:hide', () => {
    getMainWindow()?.hide()
  })

  ipcMain.on('window:toggle', () => {
    toggleMainWindow()
  })

  ipcMain.on('window:showSettings', () => {
    createSettingsWindow()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // ===== 系统权限 =====

  ipcMain.handle('system:getAccessibilityPermission', () => {
    return systemPreferences.isTrustedAccessibilityClient(false)
  })

  ipcMain.on('system:requestAccessibilityPermission', () => {
    systemPreferences.isTrustedAccessibilityClient(true)
  })
}
