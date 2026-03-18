import { app, BrowserWindow, globalShortcut, Menu, Tray, nativeImage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabase } from './database'
import { createMainWindow, createSettingsWindow, getMainWindow, toggleMainWindow } from './windows'
import { setupIpcHandlers } from './ipc'
import {
  captureClipboardBeforePanelShow,
  getPasteStackState,
  isClipboardPaused,
  recordLastActiveApp,
  setClipboardPaused,
  startClipboardWatcher,
  stopClipboardWatcher
} from './clipboard'
import { getFrontmostAppInfo } from './system/frontmostApp'
import { startOcrWorker, stopOcrWorker } from './ocr'
import { startLinkMetaWorker, stopLinkMetaWorker } from './linkMeta'
import type { ClipItem, PanelSnapshot, Pinboard, SourceAppSummary } from '../shared/types'

let tray: Tray | null = null
let pendingShowRequestId = 0

function buildPanelSnapshot(): PanelSnapshot {
  const db = getDatabase()
  const historyItems = db
    .prepare('SELECT * FROM clip_items ORDER BY created_at DESC LIMIT 200 OFFSET 0')
    .all() as ClipItem[]
  const sourceApps = db
    .prepare(
      `
        SELECT
          source_app,
          source_app_name,
          COUNT(1) as count
        FROM clip_items
        WHERE source_app IS NOT NULL
        GROUP BY source_app, source_app_name
        ORDER BY count DESC
        LIMIT 80
      `
    )
    .all() as SourceAppSummary[]
  const pinboards = db
    .prepare('SELECT * FROM pinboards ORDER BY sort_order ASC')
    .all() as Pinboard[]

  return {
    paused: isClipboardPaused(),
    historyItems,
    sourceApps,
    pinboards,
    pasteStackState: getPasteStackState()
  }
}

async function showMainWindowFromCurrentApp(): Promise<void> {
  const requestId = ++pendingShowRequestId
  const appInfo = getFrontmostAppInfo()
  recordLastActiveApp(appInfo)

  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('window:panelPreparing', requestId)
  if (!win.isVisible()) {
    toggleMainWindow()
  }

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
    win.hide()
    return
  }

  void showMainWindowFromCurrentApp()
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/trayIcon.png')
  const icon = nativeImage.createFromPath(iconPath)
  let trayIcon: Electron.NativeImage

  if (icon.isEmpty()) {
    // 没有图标文件时，创建一个 16x16 的简易图标
    const canvas = nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaklEQVQ4T2NkoBAwUqifAacB' +
          'DP//M0xgYGD4j00xIyMjGxMTkw4DA8N/bHIgNVADJjAwMPzBZQDIABBmBGEmHM6A0QwMDH9w' +
          'GcDIyMgGMuA/HgNABvzBZQAjIyMbyIB/eAwYHAkJADx2RxHJnxXoAAAAAElFTkSuQmCC',
        'base64'
      )
    )
    trayIcon = canvas.resize({ width: 18, height: 18 })
  } else {
    trayIcon = icon.resize({ width: 18, height: 18 })
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('ClipMate')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 ClipMate',
      click: (): void => toggleMainWindowFromCurrentApp()
    },
    { type: 'separator' },
    {
      label: '暂停收集',
      type: 'checkbox',
      checked: isClipboardPaused(),
      click: (menuItem): void => {
        setClipboardPaused(Boolean(menuItem.checked))
      }
    },
    { type: 'separator' },
    {
      label: '设置...',
      click: (): void => {
        createSettingsWindow()
      }
    },
    { type: 'separator' },
    {
      label: '退出 ClipMate',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    toggleMainWindowFromCurrentApp()
  })
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
  createTray()

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
