import { app, ipcMain } from 'electron'
import { createSettingsWindow, hideMainWindow, toggleMainWindow } from '../windows'

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

  ipcMain.on('app:quit', () => {
    app.quit()
  })
}
