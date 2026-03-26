import { BrowserWindow, shell } from 'electron'
import { createSharedWebPreferences, loadRendererEntry } from './common'
import type { PreviewOpenMode } from '../../shared/types'

let previewWindow: BrowserWindow | null = null

function buildPreviewRoute(itemId: string, mode: PreviewOpenMode = 'view'): string {
  const params = new URLSearchParams({ itemId, mode })
  return `/preview?${params.toString()}`
}

function sendPreviewRequest(itemId: string, mode: PreviewOpenMode): void {
  previewWindow?.webContents.send('window:previewItem', { itemId, mode })
}

export function createPreviewWindow(
  itemId: string,
  options?: { mode?: PreviewOpenMode }
): BrowserWindow {
  const mode = options?.mode ?? 'view'

  if (previewWindow && !previewWindow.isDestroyed()) {
    if (!previewWindow.isVisible()) {
      previewWindow.show()
    }
    previewWindow.focus()

    if (previewWindow.webContents.isLoadingMainFrame()) {
      previewWindow.webContents.once('did-finish-load', () => {
        sendPreviewRequest(itemId, mode)
      })
    } else {
      sendPreviewRequest(itemId, mode)
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

  loadRendererEntry(previewWindow, buildPreviewRoute(itemId, mode))
  return previewWindow
}

export function getPreviewWindow(): BrowserWindow | null {
  return previewWindow
}
