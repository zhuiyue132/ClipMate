import { app, ipcMain, systemPreferences } from 'electron'
import { getDatabase } from '../database'
import { toggleMainWindow, createSettingsWindow, getMainWindow } from '../windows'
import { v4 as uuidv4 } from 'uuid'
import type { Pinboard } from '../../shared/types'
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

  ipcMain.handle('db:deleteClipItem', (_event, id: string) => {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM clip_items WHERE id = ?')
    stmt.run(id)
  })

  ipcMain.handle('db:clearHistory', () => {
    const db = getDatabase()
    db.exec('DELETE FROM clip_items WHERE is_pinned = 0')
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
