import { ipcMain } from 'electron'
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
}
