import { app, BrowserWindow, Tray } from 'electron'
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
  pasteLatestClipItem,
  recordLastActiveApp,
  setClipboardPaused,
  startClipboardWatcher,
  stopClipboardWatcher,
  subscribeClipboardState,
  togglePasteStackEnabled
} from './clipboard'
import { enforceHistoryRetention } from './history/retention'
import { getFrontmostAppInfo } from './system/frontmostApp'
import { startOcrWorker, stopOcrWorker } from './ocr'
import { startLinkMetaWorker, stopLinkMetaWorker } from './linkMeta'
import { buildPanelSnapshot } from './panelSnapshot'
import {
  getShortcutRegistrationState,
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from './shortcuts'
import {
  createSettingsSnapshot,
  getSettings,
  initSettingsStore,
  subscribeSettings
} from './settings/store'
import {
  configureICloudSync,
  getSyncState,
  stopICloudSync,
  subscribeSyncState
} from './sync/icloudDrive'
import { createTray, updateTray } from './tray'
import {
  configureAutoUpdater,
  getUpdateState,
  initAutoUpdater,
  subscribeUpdateState
} from './updater'

let tray: Tray | null = null
let pendingShowRequestId = 0

function applyWindowContentProtection(window: BrowserWindow): void {
  window.setContentProtection(getSettings().privacy.hideOnScreenShare)
}

function broadcastSettingsSnapshot(): void {
  const snapshot = createSettingsSnapshot({
    syncState: getSyncState(),
    shortcutState: getShortcutRegistrationState(),
    updateState: getUpdateState()
  })

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('settings:changed', snapshot)
    }
  }
}

function refreshTrayUi(): void {
  if (!tray) return

  updateTray(tray, {
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
}

function applySettingsSideEffects(): void {
  const settings = getSettings()

  registerGlobalShortcuts(settings, {
    togglePanel: () => toggleMainWindowFromCurrentApp(),
    quickPasteLatest: () => {
      recordLastActiveApp(getFrontmostAppInfo())
      pasteLatestClipItem()
    },
    pasteLatestPlainText: () => {
      recordLastActiveApp(getFrontmostAppInfo())
      pasteLatestClipItem({ plainText: true })
    },
    togglePasteStack: () => togglePasteStackEnabled(),
    togglePauseCapture: () => setClipboardPaused(!isClipboardPaused())
  })

  app.setLoginItemSettings({
    openAtLogin: settings.general.launchAtLogin
  })

  configureAutoUpdater(settings.general.updateFeedUrl)

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      applyWindowContentProtection(window)
    }
  }

  enforceHistoryRetention(settings.storage)
  configureICloudSync(settings.sync.enabled)
  refreshTrayUi()
  broadcastSettingsSnapshot()
}

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
    applyWindowContentProtection(window)
  })

  // 初始化数据库
  initDatabase()
  initSettingsStore()

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

  subscribeClipboardState(() => {
    refreshTrayUi()
  })

  subscribeSettings(() => {
    applySettingsSideEffects()
  })

  subscribeSyncState(() => {
    broadcastSettingsSnapshot()
  })
  subscribeUpdateState(() => {
    broadcastSettingsSnapshot()
  })

  applySettingsSideEffects()
  initAutoUpdater()

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
  unregisterGlobalShortcuts()
  stopClipboardWatcher()
  stopOcrWorker()
  stopLinkMetaWorker()
  stopICloudSync()
  closeDatabase()
})

// macOS 不退出应用（保持后台运行）
app.on('window-all-closed', () => {
  // do nothing - keep app running in tray
})
