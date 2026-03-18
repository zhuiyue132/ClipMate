import { ipcMain } from 'electron'
import type { AppSettings } from '../../shared/types'
import { getShortcutRegistrationState } from '../shortcuts'
import { createSettingsSnapshot, getSettings, updateSettings } from '../settings/store'
import { getSyncState, performSyncNow } from '../sync/icloudDrive'
import { checkForUpdates, downloadUpdate, getUpdateState, installUpdate } from '../updater'

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle('settings:getSnapshot', () => {
    return createSettingsSnapshot({
      syncState: getSyncState(),
      shortcutState: getShortcutRegistrationState(),
      updateState: getUpdateState()
    })
  })

  ipcMain.handle('settings:update', (_event, settings: AppSettings) => {
    return updateSettings(settings ?? getSettings())
  })

  ipcMain.handle('sync:now', async () => {
    return performSyncNow()
  })

  ipcMain.handle('update:check', async () => {
    return checkForUpdates()
  })

  ipcMain.handle('update:download', async () => {
    return downloadUpdate()
  })

  ipcMain.handle('update:install', () => {
    installUpdate()
  })
}
