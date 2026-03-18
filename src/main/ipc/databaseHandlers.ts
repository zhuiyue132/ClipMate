import { ipcMain } from 'electron'
import type { SearchFilters } from '../../shared/types'
import {
  clearClipItems,
  deleteClipItem,
  deleteClipItems,
  getClipItemById,
  getClipItems,
  getSourceAppSummaries,
  searchClipItems,
  updateClipItemColor,
  updateClipItemImage,
  updateClipItemText,
  updateClipItemTitle
} from '../database/clipItems'

export function registerDatabaseIpcHandlers(): void {
  ipcMain.handle('db:getClipItems', (_event, limit = 50, offset = 0) => {
    return getClipItems(limit, offset)
  })

  ipcMain.handle('db:getClipItem', (_event, id: string) => {
    return getClipItemById(id)
  })

  ipcMain.handle('db:updateClipItemTitle', (_event, id: string, title: string | null) => {
    updateClipItemTitle(id, title)
  })

  ipcMain.handle('db:updateClipItemText', (_event, id: string, text: string) => {
    updateClipItemText(id, text)
  })

  ipcMain.handle('db:updateClipItemColor', (_event, id: string, color: string) => {
    updateClipItemColor(id, color)
  })

  ipcMain.handle(
    'db:updateClipItemImage',
    (_event, id: string, payload: { contentBase64: string; thumbnailBase64?: string | null }) => {
      updateClipItemImage(id, payload)
    }
  )

  ipcMain.handle('db:deleteClipItem', (_event, id: string) => {
    deleteClipItem(id)
  })

  ipcMain.handle('db:deleteClipItems', (_event, ids: string[]) => {
    deleteClipItems(ids)
  })

  ipcMain.handle('db:clearHistory', () => {
    clearClipItems()
  })

  ipcMain.handle('db:searchClipItems', (_event, filters: SearchFilters) => {
    return searchClipItems(filters)
  })

  ipcMain.handle('db:getSourceApps', () => {
    return getSourceAppSummaries()
  })
}
