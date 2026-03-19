import { BrowserWindow } from 'electron'

export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  }
}

export function broadcastClipItemsChanged(): void {
  broadcastToAllWindows('clip:itemsChanged')
}

export function broadcastClipStateChanged(paused: boolean): void {
  broadcastToAllWindows('clip:stateChanged', { paused })
}

export function broadcastPasteStackChanged(): void {
  broadcastToAllWindows('clip:stackChanged')
}
