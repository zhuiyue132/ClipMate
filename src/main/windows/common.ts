import { is } from '@electron-toolkit/utils'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'

export function createSharedWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    webviewTag: true
  }
}

export function loadRendererEntry(window: BrowserWindow, route?: string): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && rendererUrl) {
    window.loadURL(route ? `${rendererUrl}#${route}` : rendererUrl)
    return
  }

  if (route) {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'))
}
