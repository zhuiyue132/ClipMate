import { BrowserWindow, screen } from 'electron'
import type { PasteStackState } from '../../shared/types'
import { createSharedWebPreferences, loadRendererEntry } from './common'

let stackDockWindow: BrowserWindow | null = null
let shouldShowStackDock = false

const STACK_DOCK_WIDTH = 110
const STACK_DOCK_MARGIN_Y = 72
const STACK_DOCK_ENTRY_HEIGHT = 82
const STACK_DOCK_ENTRY_GAP = 10
const STACK_DOCK_PADDING_Y = 24

function resolveStackDockDisplay(): Electron.Display {
  if (stackDockWindow && !stackDockWindow.isDestroyed() && stackDockWindow.isVisible()) {
    return screen.getDisplayMatching(stackDockWindow.getBounds())
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function getStackDockBounds(entryCount: number): Electron.Rectangle {
  const display = resolveStackDockDisplay()
  const { x, y, width, height } = display.workArea
  const maxHeight = Math.max(120, height - STACK_DOCK_MARGIN_Y * 2)
  const contentHeight =
    STACK_DOCK_PADDING_Y * 2 +
    entryCount * STACK_DOCK_ENTRY_HEIGHT +
    Math.max(0, entryCount - 1) * STACK_DOCK_ENTRY_GAP
  const dockHeight = Math.min(maxHeight, contentHeight)

  return {
    x: x + width - STACK_DOCK_WIDTH,
    y: y + Math.round((height - dockHeight) / 2),
    width: STACK_DOCK_WIDTH,
    height: dockHeight
  }
}

function createStackDockWindow(bounds: Electron.Rectangle): BrowserWindow {
  if (stackDockWindow && !stackDockWindow.isDestroyed()) {
    return stackDockWindow
  }

  stackDockWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: createSharedWebPreferences()
  })

  stackDockWindow.setAlwaysOnTop(true, 'screen-saver')
  stackDockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  stackDockWindow.setIgnoreMouseEvents(false)

  stackDockWindow.on('ready-to-show', () => {
    if (shouldShowStackDock) {
      stackDockWindow?.showInactive()
    }
  })

  stackDockWindow.on('closed', () => {
    stackDockWindow = null
  })

  loadRendererEntry(stackDockWindow, '/stack-dock')
  return stackDockWindow
}

export function getStackDockWindow(): BrowserWindow | null {
  return stackDockWindow
}

export function hideStackDockWindow(): void {
  shouldShowStackDock = false
  if (!stackDockWindow || stackDockWindow.isDestroyed() || !stackDockWindow.isVisible()) return
  stackDockWindow.hide()
}

export function syncStackDockWindow(state: PasteStackState): void {
  shouldShowStackDock = state.enabled && state.entries.length > 0
  if (!shouldShowStackDock) {
    hideStackDockWindow()
    return
  }

  const bounds = getStackDockBounds(state.entries.length)
  const win = createStackDockWindow(bounds)
  win.setBounds(bounds, false)

  if (!win.webContents.isLoadingMainFrame() && !win.isVisible()) {
    win.showInactive()
  }
}
