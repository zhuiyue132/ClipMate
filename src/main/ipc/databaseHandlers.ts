import { clipboard } from 'electron'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { CreateClipItemInput, SearchFilters } from '../../shared/types'
import {
  clearClipItems,
  deleteClipItem,
  deleteClipItems,
  getClipItemById,
  getClipItems,
  getSourceAppSummaries,
  insertFullClipItem,
  searchClipItems,
  updateClipItemColor,
  updateClipItemImage,
  updateClipItemLink,
  updateClipItemText,
  updateClipItemTitle
} from '../database/clipItems'
import { refreshLinkMetaForItem } from '../linkMeta'

export function registerDatabaseIpcHandlers(): void {
  ipcMain.handle('db:getClipItems', (_event, limit = 50, offset = 0) => {
    return getClipItems(limit, offset)
  })

  ipcMain.handle('db:getClipItem', (_event, id: string) => {
    return getClipItemById(id)
  })

  ipcMain.handle('db:createClipItem', async (_event, input: CreateClipItemInput) => {
    const type = input.type === 'link' ? 'link' : 'text'
    const content = input.content.trim()
    const title = input.title?.trim() || null
    const now = Date.now()
    const id = randomUUID()

    insertFullClipItem({
      id,
      type,
      content,
      plainText: content,
      ocrText: null,
      sourceApp: 'com.clipmate.app',
      sourceAppName: 'ClipMate',
      title,
      thumbnail: null,
      linkMeta: null,
      isConfidential: 0,
      createdAt: now,
      updatedAt: now
    })

    if (type === 'link') {
      await refreshLinkMetaForItem(id)
    }

    return id
  })

  ipcMain.handle('db:updateClipItemTitle', (_event, id: string, title: string | null) => {
    updateClipItemTitle(id, title)
  })

  ipcMain.handle('db:updateClipItemText', (_event, id: string, text: string) => {
    updateClipItemText(id, text)
  })

  ipcMain.handle('db:updateClipItemLink', async (_event, id: string, url: string) => {
    updateClipItemLink(id, url)
    await refreshLinkMetaForItem(id)
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

  ipcMain.handle('db:extractImageOcr', (_event, id: string, mode: 'copy' | 'create') => {
    const item = getClipItemById(id)
    const text = item?.ocr_text?.trim() ?? ''
    if (!text) {
      return { text: '', createdItemId: null }
    }

    if (mode === 'copy') {
      clipboard.writeText(text)
      return { text, createdItemId: null }
    }

    const now = Date.now()
    const createdItemId = randomUUID()
    insertFullClipItem({
      id: createdItemId,
      type: 'text',
      content: text,
      plainText: text,
      ocrText: null,
      sourceApp: 'com.clipmate.app',
      sourceAppName: 'ClipMate',
      title: item?.title ? `${item.title} · OCR` : 'OCR 提取文本',
      thumbnail: null,
      linkMeta: null,
      isConfidential: 0,
      createdAt: now,
      updatedAt: now
    })

    return { text, createdItemId }
  })

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
