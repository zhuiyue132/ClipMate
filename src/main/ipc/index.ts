import { registerClipboardIpcHandlers } from './clipboardHandlers'
import { registerDatabaseIpcHandlers } from './databaseHandlers'
import { registerSettingsIpcHandlers } from './settingsHandlers'
import { registerSystemIpcHandlers } from './systemHandlers'
import { registerWindowIpcHandlers } from './windowHandlers'

export function setupIpcHandlers(): void {
  registerDatabaseIpcHandlers()
  registerClipboardIpcHandlers()
  registerSettingsIpcHandlers()
  registerWindowIpcHandlers()
  registerSystemIpcHandlers()
}
