import { BrowserWindow, shell } from 'electron'
import { createSharedWebPreferences, loadRendererEntry } from './common'

let previewWindow: BrowserWindow | null = null

function buildPreviewRoute(itemId: string): string {
  return `/preview?itemId=${encodeURIComponent(itemId)}`
}

export function createPreviewWindow(itemId: string): BrowserWindow {
  if (previewWindow && !previewWindow.isDestroyed()) {
    if (!previewWindow.isVisible()) {
      previewWindow.show()
    }
    previewWindow.focus()

    if (previewWindow.webContents.isLoadingMainFrame()) {
      previewWindow.webContents.once('did-finish-load', () => {
        previewWindow?.webContents.send('window:previewItem', itemId)
      })
    } else {
      previewWindow.webContents.send('window:previewItem', itemId)
    }

    return previewWindow
  }

  previewWindow = new BrowserWindow({
    width: 980,
    height: 640,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: 'ClipMate 预览',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: createSharedWebPreferences()
  })

  previewWindow.on('ready-to-show', () => {
    previewWindow?.show()
    previewWindow?.focus()
  })

  previewWindow.on('closed', () => {
    previewWindow = null
  })

  previewWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererEntry(previewWindow, buildPreviewRoute(itemId))
  return previewWindow
}

export function getPreviewWindow(): BrowserWindow | null {
  return previewWindow
}
