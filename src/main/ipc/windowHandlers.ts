import { app, BrowserWindow, ipcMain } from 'electron'
import {
  createPreviewWindow,
  createSettingsWindow,
  hideMainWindow,
  toggleMainWindow
} from '../windows'
import type { PreviewOpenMode, SettingsTabId } from '../../shared/types'

export function registerWindowIpcHandlers(): void {
  ipcMain.on('window:hide', () => {
    hideMainWindow()
  })

  ipcMain.on('window:toggle', () => {
    toggleMainWindow()
  })

  ipcMain.on('window:showSettings', (_event, options?: { tab?: SettingsTabId }) => {
    createSettingsWindow(options)
  })

  ipcMain.on(
    'window:showPreview',
    (_event, itemId: string, options?: { mode?: PreviewOpenMode }) => {
      createPreviewWindow(itemId, options)
    }
  )

  ipcMain.on('window:closeSelf', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })
}
