import { app, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface CreateTrayOptions {
  isPaused: () => boolean
  onTogglePanel: () => void
  onTogglePaused: (paused: boolean) => void
  onShowSettings: () => void
  onQuit: () => void
}

const TRAY_ICON_FILES = {
  active: 'clipmate-tray.png',
  paused: 'clipmate-tray-paused.png'
} as const

const FALLBACK_TRAY_ICON_BASE64 = {
  active:
    'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAJKADAAQAAAABAAAAJAAAAAAJxsHGAAABxUlEQVRYCe1XO6rCUBCd6BMi2ESiVTora0163YFrSOViXItuwBUYwYhgZZUgqGBloQnic/KIjffO/YQnFhmQyMyck+OZIeYaj2fAF0Xli7RkUkpBoon8iBp49ePxCPv9HtI05bW88tVqFVqtFjiOA4ZhvPKsL1qCptMpzOdzFh+Z63a7MB6PoVLhbwq/wqFGZ3TEIN12u4Xlcslh/ksrC8IxFYndbkfCpUcWxzGgO5vNJrvyWHFH6vU6NBoNZkuSJMx8nhQKWq/X4Ps+BEGQY6SuuMTD4RBs25bqz5vIkaErg8FAWQySn04nmM1mcLlc8ntJXUlBk8kEzuezFBGr6Xa7wWq1YpW4OVLQYrHgAmULh8NBtjXrIwVdr1clMlbz/X5npbk5UhAX9Y+FUpDI3NKh0iGRA6L3oY/vULvdJjV/VJBpmuB5HilI+G9PoiWLtVoNOp0OjEYjsCyLRuG5jBe9Xg/PbIU+yKES5MjQ4qKhykEKcl23qB7hzrzdgLIziqJHs9nUHhlikUMlQNQchuGj3+8ri0IMYlXDQMCbbYzE85dmr6Widnzw4bMGD4U6IS1Ih1wHQy61DmFRTClI5GDpkMihXzMZjt48rpR1AAAAAElFTkSuQmCC',
  paused:
    'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAJKADAAQAAAABAAAAJAAAAAAJxsHGAAABrElEQVRYCe1XzaqCUBCe5ELYRsJF6xaBPZT4bD2G+ARJaxdFuG7pJnGj93yCg3nJOUcl7OKANWfmOzOf4/ldVUpoRmLNiEtNZSEkfZEfCdD4H48HnU4nStOUyrJszL3/lmXRfr+nIAhot9v1YtmJQS3J+XyuttstBv+gB33jOJbS1H7SQXmeN4hI+wUQQ0dEQrfbbTSZhhhiSSLOsizL+POOVXRiiYTGkjDt/z8IYTofDgdar9d/CgAbfMAMEeNeSBSGIV2vV0qShFzX5bzQYYMPmEGkpFF/uVxeZtnxeHzp4vs++6G3BVjFlh/EksS4QpvNhisCxbZtbrd1GLtYBvYoxoR6Yk3iWghJZVwqtFRIqoDkNx5Dz+fzJWae59xu6zB2sQzsU6SVs7tSq+2giqKo7na/3yu1XfBKDB02CDDAqtz86KzU4gGtSwgJkEhtoJXaSDlZkxg2+Lpk4NchpH3IVwFZcMhXpz9ut5WiKN762rh3uvEYehdoKvv3EXIcZ6qXJ61Y9ZQQfmZ1DQLXT14UV0io800+dZXWJqRDegrM982yKd7aJMbsKvQLH8FMeKwBX6AAAAAASUVORK5CYII='
} as const

function markTemplateImage(icon: Electron.NativeImage): Electron.NativeImage {
  icon.setTemplateImage(true)
  return icon
}

function getTrayIconCandidates(fileName: string): string[] {
  return [
    join(process.resourcesPath, 'tray', fileName),
    join(process.cwd(), 'build/tray', fileName),
    join(app.getAppPath(), 'build/tray', fileName),
    join(__dirname, '../../build/tray', fileName)
  ]
}

function resolveTrayIconPath(fileName: string): string | null {
  return getTrayIconCandidates(fileName).find((candidate) => existsSync(candidate)) ?? null
}

function createInlineFallbackTrayIcon(paused: boolean): Electron.NativeImage {
  const svg = paused
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
         <path fill="black" fill-rule="evenodd" d="M6.2 2.2C5.206 2.2 4.4 3.006 4.4 4v10c0 .994.806 1.8 1.8 1.8h5.6c.994 0 1.8-.806 1.8-1.8V4c0-.994-.806-1.8-1.8-1.8H6.2Zm1.1 3.7c.497 0 .9.403.9.9v4.4a.9.9 0 1 1-1.8 0V6.8c0-.497.403-.9.9-.9Zm3.4 0c.497 0 .9.403.9.9v4.4a.9.9 0 1 1-1.8 0V6.8c0-.497.403-.9.9-.9Z" clip-rule="evenodd"/>
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
         <rect x="6.2" y="2.2" width="8.2" height="9.8" rx="1.8" fill="black" opacity="0.58"/>
         <rect x="3.6" y="4.4" width="8.8" height="10.2" rx="2" fill="black"/>
       </svg>`

  return markTemplateImage(
    nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  )
}

function createFallbackTrayIcon(paused: boolean): Electron.NativeImage {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      paused ? FALLBACK_TRAY_ICON_BASE64.paused : FALLBACK_TRAY_ICON_BASE64.active,
      'base64'
    )
  )

  if (!icon.isEmpty()) {
    return markTemplateImage(icon)
  }

  return createInlineFallbackTrayIcon(paused)
}

function createTrayIcon(paused: boolean): Electron.NativeImage {
  const fileName = paused ? TRAY_ICON_FILES.paused : TRAY_ICON_FILES.active
  const iconPath = resolveTrayIconPath(fileName)

  if (!iconPath) {
    console.error(
      `[tray] tray icon asset not found for ${paused ? 'paused' : 'active'} state`,
      getTrayIconCandidates(fileName)
    )
    return createFallbackTrayIcon(paused)
  }

  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.error(`[tray] tray icon asset failed to load: ${iconPath}`)
    return createFallbackTrayIcon(paused)
  }

  return markTemplateImage(icon)
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
