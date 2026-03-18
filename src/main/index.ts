import { app, BrowserWindow, globalShortcut, Tray } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './database'
import {
  createMainWindow,
  createSettingsWindow,
  getMainWindow,
  hideMainWindow,
  showMainWindow
} from './windows'
import { setupIpcHandlers } from './ipc'
import {
  captureClipboardBeforePanelShow,
  isClipboardPaused,
  recordLastActiveApp,
  setClipboardPaused,
  startClipboardWatcher,
  stopClipboardWatcher
} from './clipboard'
import { getFrontmostAppInfo } from './system/frontmostApp'
import { startOcrWorker, stopOcrWorker } from './ocr'
import { startLinkMetaWorker, stopLinkMetaWorker } from './linkMeta'
import { buildPanelSnapshot } from './panelSnapshot'
import { createTray } from './tray'

let tray: Tray | null = null
let pendingShowRequestId = 0

async function showMainWindowFromCurrentApp(): Promise<void> {
  const requestId = ++pendingShowRequestId
  const appInfo = getFrontmostAppInfo()
  recordLastActiveApp(appInfo)

  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('window:panelPreparing', requestId)
  showMainWindow()

  win.webContents.send('window:preparePanelShow', requestId, buildPanelSnapshot())

  await captureClipboardBeforePanelShow()

  if (requestId !== pendingShowRequestId) return
  if (win.isDestroyed() || !win.isVisible()) return

  const snapshot = buildPanelSnapshot()
  win.webContents.send('window:preparePanelShow', requestId, snapshot)
}

function toggleMainWindowFromCurrentApp(): void {
  const win = getMainWindow()
  if (!win) return

  if (win.isVisible()) {
    pendingShowRequestId += 1
    hideMainWindow()
    return
  }

  void showMainWindowFromCurrentApp()
}

app.whenReady().then(() => {
  // 设置 app user model id（macOS）
  electronApp.setAppUserModelId('com.clipmate.app')

  // 隐藏 Dock 图标（纯菜单栏应用）
  if (app.dock) {
    app.dock.hide()
  }

  // 开发环境优化
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  initDatabase()

  // 注册 IPC 处理器
  setupIpcHandlers()

  // 创建主窗口
  createMainWindow()

  // 创建托盘
  tray = createTray({
    isPaused: () => isClipboardPaused(),
    onTogglePanel: () => toggleMainWindowFromCurrentApp(),
    onTogglePaused: (paused) => {
      setClipboardPaused(paused)
    },
    onShowSettings: () => {
      createSettingsWindow()
    },
    onQuit: () => {
      app.quit()
    }
  })

  // 注册全局快捷键 Cmd+Shift+V 呼出/隐藏
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    toggleMainWindowFromCurrentApp()
  })

  // 启动剪贴板监听
  startClipboardWatcher()
  startOcrWorker()
  startLinkMetaWorker()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('will-quit', () => {
  tray?.destroy()
  tray = null
  globalShortcut.unregisterAll()
  stopClipboardWatcher()
  stopOcrWorker()
  stopLinkMetaWorker()
  closeDatabase()
})

// macOS 不退出应用（保持后台运行）
app.on('window-all-closed', () => {
  // do nothing - keep app running in tray
})
