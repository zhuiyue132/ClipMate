import { ipcMain } from 'electron'
import {
  clearPasteStack,
  copyClipItemsAsText,
  copyClipItem,
  enqueuePasteStackItems,
  getPasteStackState,
  isClipboardPaused,
  pasteClipItem,
  pasteClipItemAsFile,
  pasteLatestClipItem,
  pastePasteStack,
  removePasteStackEntry,
  reorderPasteStack,
  setClipboardPaused,
  setPasteStackEnabled,
  startImageDrag,
  togglePasteStackEnabled
} from '../clipboard'

export function registerClipboardIpcHandlers(): void {
  ipcMain.handle('clip:getState', () => {
    return { paused: isClipboardPaused() }
  })

  ipcMain.handle('clip:setPaused', (_event, paused: boolean) => {
    setClipboardPaused(paused)
  })

  ipcMain.handle('clip:pasteItem', (_event, id: string, options?: { plainText?: boolean }) => {
    pasteClipItem(id, options)
  })

  ipcMain.handle('clip:pasteItemAsFile', (_event, id: string) => {
    pasteClipItemAsFile(id)
  })

  ipcMain.handle('clip:copyItem', (_event, id: string, options?: { plainText?: boolean }) => {
    copyClipItem(id, options)
  })

  ipcMain.handle('clip:copyItemsAsText', (_event, ids: string[], separator?: string) => {
    return copyClipItemsAsText(ids, separator)
  })

  ipcMain.handle('clip:pasteLatestItem', (_event, options?: { plainText?: boolean }) => {
    pasteLatestClipItem(options)
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

  ipcMain.handle('clip:enqueueStackItems', (_event, ids: string[]) => {
    return enqueuePasteStackItems(ids)
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

  ipcMain.handle('clip:toggleStackEnabled', () => {
    togglePasteStackEnabled()
  })

  ipcMain.on('clip:startImageDrag', (event, id: string) => {
    startImageDrag(event.sender, id)
  })
}
