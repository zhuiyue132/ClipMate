import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
const MAIN_WINDOW_HEIGHT = 360

function getBottomPanelBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: screenX, y: screenY } = display.workArea

  return {
    x: screenX,
    y: screenY + screenHeight - MAIN_WINDOW_HEIGHT,
    width: screenWidth,
    height: MAIN_WINDOW_HEIGHT
  }
}

export function createMainWindow(): BrowserWindow {
  const bounds = getBottomPanelBounds()

  mainWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    movable: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 不自动显示，等待快捷键触发
  })

  mainWindow.on('blur', () => {
    // 失焦自动隐藏
    mainWindow?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function toggleMainWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.setBounds(getBottomPanelBounds())
    mainWindow.show()
    mainWindow.focus()
  }
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/settings`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/settings'
    })
  }

  return settingsWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow
}
