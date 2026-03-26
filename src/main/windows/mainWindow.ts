import { BrowserWindow, screen, shell } from 'electron'
import { createSharedWebPreferences, loadRendererEntry } from './common'

let mainWindow: BrowserWindow | null = null

const MAIN_WINDOW_HEIGHT = 344
const MAIN_WINDOW_SHOW_MS = 132
const MAIN_WINDOW_HIDE_MS = 108

let mainWindowTransitionTimer: NodeJS.Timeout | null = null
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

function clearMainWindowTransitionTimer(): void {
  if (mainWindowTransitionTimer) {
    clearTimeout(mainWindowTransitionTimer)
    mainWindowTransitionTimer = null
  }
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
    webPreferences: createSharedWebPreferences()
  })

  mainWindow.on('ready-to-show', () => {
    // 不自动显示，等待快捷键触发
  })

  mainWindow.on('blur', () => {
    hideMainWindow()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererEntry(mainWindow)
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  clearMainWindowTransitionTimer()

  const hiddenBounds = getBottomPanelBounds(true)
  const visibleBounds = getBottomPanelBounds(false)

  if (!mainWindow.isVisible()) {
    mainWindow.setBounds(hiddenBounds, false)
    mainWindow.show()
  }

  mainWindow.focus()
  mainWindowAnimationState = 'showing'
  mainWindow.setBounds(visibleBounds, true)
  mainWindowTransitionTimer = setTimeout(() => {
    mainWindowTransitionTimer = null
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindowAnimationState = 'visible'
  }, MAIN_WINDOW_SHOW_MS)
}

export function hideMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
  if (mainWindowAnimationState === 'hiding') return

  clearMainWindowTransitionTimer()

  const hiddenBounds = getBottomPanelBounds(true)
  mainWindowAnimationState = 'hiding'
  mainWindow.setBounds(hiddenBounds, true)
  mainWindowTransitionTimer = setTimeout(() => {
    mainWindowTransitionTimer = null
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindowAnimationState !== 'hiding') return

    mainWindow.hide()
    mainWindow.setBounds(hiddenBounds, false)
    mainWindowAnimationState = 'hidden'
  }, MAIN_WINDOW_HIDE_MS)
}

export function toggleMainWindow(): void {
  if (!mainWindow) return

  if (!mainWindow.isVisible() || mainWindowAnimationState === 'hiding') {
    showMainWindow()
    return
  }

  hideMainWindow()
}
