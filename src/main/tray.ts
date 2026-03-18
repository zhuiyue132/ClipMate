import { Menu, Tray, nativeImage } from 'electron'

interface CreateTrayOptions {
  isPaused: () => boolean
  onTogglePanel: () => void
  onTogglePaused: (paused: boolean) => void
  onShowSettings: () => void
  onQuit: () => void
}

function createTrayIcon(paused: boolean): Electron.NativeImage {
  const svg = paused
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
         <rect x="4" y="3" width="10" height="12" rx="2" fill="black"/>
         <rect x="6" y="6" width="2.2" height="5.6" rx="1" fill="white"/>
         <rect x="9.8" y="6" width="2.2" height="5.6" rx="1" fill="white"/>
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
         <rect x="4" y="4" width="9" height="10" rx="2" fill="black"/>
         <rect x="6.2" y="2" width="9" height="10" rx="2" fill="black" opacity="0.68"/>
       </svg>`

  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  )
  icon.setTemplateImage(true)
  return icon
}

function buildContextMenu(options: CreateTrayOptions): Electron.Menu {
  return Menu.buildFromTemplate([
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
}

export function updateTray(tray: Tray, options: CreateTrayOptions): void {
  const paused = options.isPaused()
  tray.setImage(createTrayIcon(paused))
  tray.setToolTip(paused ? 'ClipMate · 已暂停收集' : 'ClipMate')
  tray.setContextMenu(buildContextMenu(options))
}

export function createTray(options: CreateTrayOptions): Tray {
  const tray = new Tray(createTrayIcon(options.isPaused()))
  updateTray(tray, options)

  tray.on('click', () => {
    options.onTogglePanel()
  })

  return tray
}
