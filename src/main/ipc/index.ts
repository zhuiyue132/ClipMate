import { app, ipcMain, systemPreferences } from 'electron'
import type { SearchFilters } from '../../shared/types'
import {
  clearPasteStack,
  copyClipItem,
  getPasteStackState,
  isClipboardPaused,
  pasteClipItem,
  pastePasteStack,
  removePasteStackEntry,
  reorderPasteStack,
  setClipboardPaused,
  setPasteStackEnabled
} from '../clipboard'
import { getDatabase } from '../database'
import {
  getApplicationIconDataUrl,
  getAppIconCacheKey,
  type AppIconTarget
} from '../system/appIcons'
import { createSettingsWindow, hideMainWindow, toggleMainWindow } from '../windows'

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
    db.exec('DELETE FROM clip_items')
  })

  ipcMain.handle('db:searchClipItems', (_event, filters: SearchFilters) => {
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

  ipcMain.handle('clip:getStackState', () => {
    return getPasteStackState()
  })

  ipcMain.handle('clip:setStackEnabled', (_event, enabled: boolean) => {
    setPasteStackEnabled(enabled)
  })

  ipcMain.handle('clip:clearStack', () => {
    clearPasteStack()
  })

  ipcMain.handle('clip:removeStackEntry', (_event, entryId: string) => {
    removePasteStackEntry(entryId)
  })

  ipcMain.handle('clip:reorderStack', (_event, entryIds: string[]) => {
    reorderPasteStack(entryIds)
  })

  ipcMain.handle('clip:pasteStack', async () => {
    await pastePasteStack()
  })

  // ===== 窗口操作 =====

  ipcMain.on('window:hide', () => {
    hideMainWindow()
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

  ipcMain.handle('system:getAppIcons', async (_event, targets: AppIconTarget[]) => {
    const uniqueTargets = new Map<string, AppIconTarget>()
    for (const target of targets ?? []) {
      if (!target?.bundleId && !target?.name) continue
      const key = getAppIconCacheKey(target)
      if (!uniqueTargets.has(key)) {
        uniqueTargets.set(key, target)
      }
    }

    const entries = await Promise.all(
      Array.from(uniqueTargets.entries()).map(async ([key, target]) => {
        const icon = await getApplicationIconDataUrl(target)
        return [key, icon] as const
      })
    )

    return Object.fromEntries(entries)
  })
}
