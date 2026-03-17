import { app, ipcMain, systemPreferences } from 'electron'
import { getDatabase } from '../database'
import { toggleMainWindow, createSettingsWindow, getMainWindow } from '../windows'
import { v4 as uuidv4 } from 'uuid'
import type { Pinboard } from '../../shared/types'
import { copyClipItem, isClipboardPaused, pasteClipItem, setClipboardPaused } from '../clipboard'

export function setupIpcHandlers(): void {
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
    const deleteItems = db.prepare('DELETE FROM pinboard_items WHERE pinboard_id = ?')
    const deleteBoard = db.prepare('DELETE FROM pinboards WHERE id = ?')
    const transaction = db.transaction(() => {
      deleteItems.run(id)
      deleteBoard.run(id)
    })
    transaction()
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
