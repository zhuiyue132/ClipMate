import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
const MAIN_WINDOW_HEIGHT = 384
const MAIN_WINDOW_SHOW_MS = 132
const MAIN_WINDOW_HIDE_MS = 96
const MAIN_WINDOW_TICK_MS = 1000 / 120
let mainWindowAnimationTimer: NodeJS.Timeout | null = null
let mainWindowAnimationId = 0
let mainWindowAnimationState: 'hidden' | 'showing' | 'visible' | 'hiding' = 'hidden'

function resolveMainWindowDisplay() {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    (mainWindow.isVisible() || mainWindowAnimationState !== 'hidden')
  ) {
    const bounds = mainWindow.getBounds()
    if (bounds.width > 0 && bounds.height > 0) {
      return screen.getDisplayMatching(bounds)
    }
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function getBottomPanelBounds(hidden = false) {
  const display = resolveMainWindowDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: screenX, y: screenY } = display.workArea

  return {
    x: screenX,
    y: hidden ? screenY + screenHeight : screenY + screenHeight - MAIN_WINDOW_HEIGHT,
    width: screenWidth,
    height: MAIN_WINDOW_HEIGHT
  }
}

function stopMainWindowAnimation(): void {
  if (mainWindowAnimationTimer) {
    clearTimeout(mainWindowAnimationTimer)
    mainWindowAnimationTimer = null
  }
  mainWindowAnimationId += 1
}

function animateMainWindow(
  targetBounds: Electron.Rectangle,
  direction: 'show' | 'hide',
  onDone?: () => void
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  stopMainWindowAnimation()

  const animationId = mainWindowAnimationId
  const startBounds = mainWindow.getBounds()
  const startOpacity = mainWindow.getOpacity()
  const targetOpacity = direction === 'show' ? 1 : 0
  const duration = direction === 'show' ? MAIN_WINDOW_SHOW_MS : MAIN_WINDOW_HIDE_MS
  const startedAt = Date.now()

  const tick = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || animationId !== mainWindowAnimationId) {
      return
    }

    const progress = Math.min((Date.now() - startedAt) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    const nextY = Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased)
    const nextOpacity = startOpacity + (targetOpacity - startOpacity) * eased

    mainWindow.setPosition(targetBounds.x, nextY, false)
    mainWindow.setOpacity(Math.max(0, Math.min(1, nextOpacity)))

    if (progress >= 1) {
      mainWindowAnimationTimer = null
      onDone?.()
      return
    }

    mainWindowAnimationTimer = setTimeout(tick, MAIN_WINDOW_TICK_MS)
  }

  tick()
}

export function createMainWindow(): BrowserWindow {
  const bounds = getBottomPanelBounds(true)

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
    hideMainWindow()
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

export function showMainWindow(): void {
  if (!mainWindow) return
  const hiddenBounds = getBottomPanelBounds(true)
  const visibleBounds = getBottomPanelBounds(false)

  if (!mainWindow.isVisible()) {
    mainWindow.setBounds(hiddenBounds, false)
    mainWindow.setOpacity(0)
    mainWindow.show()
  }

  mainWindow.focus()
  mainWindowAnimationState = 'showing'
  animateMainWindow(visibleBounds, 'show', () => {
    mainWindowAnimationState = 'visible'
  })
}

export function hideMainWindow(): void {
  if (!mainWindow || !mainWindow.isVisible()) return
  if (mainWindowAnimationState === 'hiding') return

  const hiddenBounds = getBottomPanelBounds(true)
  mainWindowAnimationState = 'hiding'
  animateMainWindow(hiddenBounds, 'hide', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.hide()
    mainWindow.setOpacity(1)
    mainWindow.setBounds(hiddenBounds, false)
    mainWindowAnimationState = 'hidden'
  })
}

export function toggleMainWindow(): void {
  if (!mainWindow) return

  if (!mainWindow.isVisible() || mainWindowAnimationState === 'hiding') {
    showMainWindow()
    return
  }

  hideMainWindow()
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
