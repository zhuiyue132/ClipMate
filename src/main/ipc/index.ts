import { registerClipboardIpcHandlers } from './clipboardHandlers'
import { registerDatabaseIpcHandlers } from './databaseHandlers'
import { registerSystemIpcHandlers } from './systemHandlers'
import { registerWindowIpcHandlers } from './windowHandlers'

export function setupIpcHandlers(): void {
  registerDatabaseIpcHandlers()
  registerClipboardIpcHandlers()
  registerWindowIpcHandlers()
  registerSystemIpcHandlers()
}
