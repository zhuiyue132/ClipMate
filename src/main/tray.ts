import { Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'

interface CreateTrayOptions {
  isPaused: () => boolean
  onTogglePanel: () => void
  onTogglePaused: (paused: boolean) => void
  onShowSettings: () => void
  onQuit: () => void
}

function resolveTrayIcon(): Electron.NativeImage {
  const iconPath = join(__dirname, '../../resources/trayIcon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) {
    return icon.resize({ width: 18, height: 18 })
  }

  const fallbackIcon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaklEQVQ4T2NkoBAwUqifAacB' +
        'DP//M0xgYGD4j00xIyMjGxMTkw4DA8N/bHIgNVADJjAwMPzBZQDIABBmBGEmHM6A0QwMDH9w' +
        'GcDIyMgGMuA/HgNABvzBZQAjIyMbyIB/eAwYHAkJADx2RxHJnxXoAAAAAElFTkSuQmCC',
      'base64'
    )
  )

  return fallbackIcon.resize({ width: 18, height: 18 })
}

export function createTray(options: CreateTrayOptions): Tray {
  const tray = new Tray(resolveTrayIcon())
  tray.setToolTip('ClipMate')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 ClipMate',
      click: () => {
        options.onTogglePanel()
      }
    },
    { type: 'separator' },
    {
      label: '暂停收集',
      type: 'checkbox',
      checked: options.isPaused(),
      click: (menuItem) => {
        options.onTogglePaused(Boolean(menuItem.checked))
      }
    },
    { type: 'separator' },
    {
      label: '设置...',
      click: () => {
        options.onShowSettings()
      }
    },
    { type: 'separator' },
    {
      label: '退出 ClipMate',
      click: () => {
        options.onQuit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    options.onTogglePanel()
  })

  return tray
}
