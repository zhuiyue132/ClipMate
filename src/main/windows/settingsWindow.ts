import { BrowserWindow } from 'electron'
import { createSharedWebPreferences, loadRendererEntry } from './common'
import type { SettingsTabId } from '../../shared/types'

let settingsWindow: BrowserWindow | null = null

function buildSettingsRoute(tab?: SettingsTabId): string {
  if (!tab) return '/settings'
  const params = new URLSearchParams({ tab })
  return `/settings?${params.toString()}`
}

function sendSettingsTab(tab: SettingsTabId): void {
  settingsWindow?.webContents.send('window:settingsTab', tab)
}

export function createSettingsWindow(options?: { tab?: SettingsTabId }): BrowserWindow {
  const tab = options?.tab

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (!settingsWindow.isVisible()) {
      settingsWindow.show()
    }
    settingsWindow.focus()
    if (tab) {
      if (settingsWindow.webContents.isLoadingMainFrame()) {
        settingsWindow.webContents.once('did-finish-load', () => {
          sendSettingsTab(tab)
        })
      } else {
        sendSettingsTab(tab)
      }
    }
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 680,
    height: 500,
    show: false,
    title: 'ClipMate 设置',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: createSharedWebPreferences()
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  loadRendererEntry(settingsWindow, buildSettingsRoute(tab))
  return settingsWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow
}
