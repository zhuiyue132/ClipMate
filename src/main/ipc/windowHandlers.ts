import { app, BrowserWindow, ipcMain } from 'electron'
import {
  createPreviewWindow,
  createSettingsWindow,
  hideMainWindow,
  toggleMainWindow
} from '../windows'

export function registerWindowIpcHandlers(): void {
  ipcMain.on('window:hide', () => {
    hideMainWindow()
  })

  ipcMain.on('window:toggle', () => {
    toggleMainWindow()
  })

  ipcMain.on('window:showSettings', () => {
    createSettingsWindow()
  })

  ipcMain.on('window:showPreview', (_event, itemId: string) => {
    createPreviewWindow(itemId)
  })

  ipcMain.on('window:closeSelf', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })
}
