import { app, BrowserWindow, globalShortcut, Menu, Tray, nativeImage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { initDatabase, closeDatabase } from './database'
import { createMainWindow, createSettingsWindow, getMainWindow, toggleMainWindow } from './windows'
import { setupIpcHandlers } from './ipc'
import {
  isClipboardPaused,
  recordLastActiveApp,
  setClipboardPaused,
  startClipboardWatcher,
  stopClipboardWatcher
} from './clipboard'
import { getFrontmostAppInfo } from './system/frontmostApp'
import { startOcrWorker, stopOcrWorker } from './ocr'
import { startLinkMetaWorker, stopLinkMetaWorker } from './linkMeta'

let tray: Tray | null = null

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
      click: (): void => toggleMainWindow()
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
    if (!getMainWindow()?.isVisible()) {
      // 记录呼出面板前的活跃应用，供 Direct Paste 使用
      const appInfo = getFrontmostAppInfo()
      recordLastActiveApp(appInfo)
    }
    toggleMainWindow()
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
  const win = createMainWindow()

  // 开发模式下自动显示窗口，方便调试
  win.once('ready-to-show', () => {
    win.show()
  })

  // 创建托盘
  createTray()

  // 注册全局快捷键 Cmd+Shift+V 呼出/隐藏
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (!getMainWindow()?.isVisible()) {
      const appInfo = getFrontmostAppInfo()
      recordLastActiveApp(appInfo)
    }
    toggleMainWindow()
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
