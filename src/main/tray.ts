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
    'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAJKADAAQAAAABAAAAJAAAAAAJxsHGAAADJ0lEQVRYCe1XOUsrURg9iRKNGgsXSBRstAhxCQhiI9gJdkIgpZ2FhWAttv4ICaQKaS3EHyCWLoUEBTc0RRA3EuKe6Lw5w7vDzLw7iySEPPCDm7vOuSffOuNTVEETib+JuGhUfgm5WaTpNNTqxtjrfqlUQqFQwMfHh+kRv9+P/v5+hMNh+Hw+055sUhdCR0dH2Nrawvf3t+wObW1iYgLJZNKVVM0mI4nt7W1HMmR0fHyM29tbW8Jio2ZC7+/v+Pz8FHiO/f39veM+Nz2Z7Pn5GfSRr6+vfwBfXl5QrVbR2uoO5WRSAeyI8vj4iJ2dHWQyGTw9PUkJkeTk5CQGBgZc/UNc6tTbEiKZdDqNVCqFq6srKRkBPDo6KoY197aEdnd3kc1mcXFxgUaWO6lTl8tlHBwc4PT0tKFkqF6phorFIu7u7kxJLhAIIJFIYH5+Hn19fWDCo9Cp9/b26uI/xJMSYtRUKhXu67KwsIDV1VWMj4+D5ETWpTYPDw/1c7UOpIRkoHNzc6DzBoNB07Yx3BkIb29vupk7OzvR3d2tpwShVROAZeKZEOsRNWOV9vZ2tLS0aFG4v7+vBQE1TBkbG8P09DRCoZA27+np0XqnH6lT2z0gzGTcJxlqj8LC+vr6qjfORTIcHh7G4OCg8VHp2LOGpE//XZyZmQEvZGSen5/rR0lgdnYW8XgcIyMjut/pBySDuhAibiQS0V4zqDEhzN402dDQkFhy7X9kMle0Ohz4fwmxiAoHtVMEo6vWMuNZQ3wrZAa3k3w+DzbrK6zdebt1W0LWEN/c3NSKrewl6/LyEuvr68jlciYNWTHsSBjXpVHW1dUFNqM8PDxgbW0NGxsbaGtr02sZzch6xmYtN729vdJkasS1jqWECBSNRrUwFhqhb7AssHkRZvCpqSl4yc4mPPUiqZydnSmLi4uKmlf47f/jtrS0pFxfX0uxnRZpc6moUaWcnJwoy8vLivpvPRNS65aysrKiqH6lqOaUYjst+rhpUplhQv+gieisNzc34BeGk7Cyx2IxrWZ1dHR4KhVWPEdC1sONmNuGfSMul93xS0imFeNa02noDxsO6cpImeQVAAAAAElFTkSuQmCC',
  paused:
    'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAJKADAAQAAAABAAAAJAAAAAAJxsHGAAADUElEQVRYCe1XuUs7QRT+Eu+z8CBeWKiFeCQgiIVFqgh2gmBpZ2EhWNv7R4hgJWIhWIiNnYiNmBSJqIhnE7xRvM91v4FZXH+zs5tfVBR8sJnZebPvfXnvzfd2fYYp+EHi/0FYBJQ/QG4Z+XERynRD7FV/eXmJZDKJh4cH2yN+vx/l5eWoqKiAz+ez6VQ3nwIoFothdnYWr6+vKh9iLRgMoq+vzxVU2ikjiLm5OS0YIorH4zg8PHQELBVpA7q/v8fj46O0px1PTk60eio9pez6+hqskZeXl38M3tzc4Pn5GZmZ7qZ0KZWGtVbOzs4wPz+PyclJnJ+fKwERZFtbG6qqqlzrQzrVjY6ACGZiYgLj4+PY3d1VgpGGm5ub5TTt0RHQ4uIipqamsL29je9sd8qivrq6wurqKjY2Nr4VDMOrjNDFxQWOj49tJJednY3e3l50d3ejrKwMJDwKi3ppaelT6of2lIB4ap6enqi3pKenB8PDw2htbQXBSdZlNKPRqLUv3YkSkMpoV1cXWLybm5s4PT1FJBIR23jcWfT5+fnIysrC3d2dleaCggIUFxdblCCjqrIv1zwDYj9i1Do7O4XTlZUVtLe3I5FIYHp6Wjgl4L29PcFLdNDS0oKOjg4UFRUJfyUlJdKv4+gZEC0wPYwA5ejoSIyMFoVppu729tYCxEYrybC+vh7V1dVir+4nJUA6Q9RVVlZif3/f2kYA4XAYoVAIDQ0NVt1ZGxSTTwVUWlqKjIwMyw3Zmymrra211twmSh5ye+gr9b8XEJtoYWEh8vLyRIACgYBt5Dq5Kd024zlCfCvksV9eXsbCwoI48kTEo8/7mZkZ5SusQJ3CjyMgycTS1tjYmGi2NTU1FilKXV1dneCitbU1W4Q+2pD7daPylDE1vN4L+WZkZASjo6PIycmxehl5hv2M18d2w1PHNpOKKAHRUGNjo/hakK+drA0SnyRGNye5ubkinV7Y2WbLdKSUra0to7+/3zB5hd/+KV8DAwOGSZJK27pF5lwp5qky1tfXjcHBQcP8t54BmX3LGBoaMnZ2dgwznUrbukUflbaQvbthfTBFLNaDgwPwC0Mn7OxNTU2iZ7H7/09RawHpnH+VzvHYf5VDN7t/gH5dhN4AXDP+8xWTDHsAAAAASUVORK5CYII='
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
         <defs>
           <mask id="front-paused">
             <rect width="18" height="18" fill="black"/>
             <rect x="3.1" y="5.1" width="8.8" height="10.1" rx="2.35" fill="white"/>
             <rect x="5.25" y="7.2" width="4.5" height="5.9" rx="1.35" fill="black"/>
             <rect x="8.7" y="3.9" width="4.8" height="4.6" rx="1.2" fill="black"/>
           </mask>
         </defs>
         <rect x="8.35" y="2.7" width="5.45" height="7.15" rx="1.7" fill="black" opacity="0.52"/>
         <rect x="1.8" y="2.8" width="12.8" height="13.2" rx="3.1" fill="black" mask="url(#front-paused)"/>
         <rect x="5.95" y="8.3" width="1.2" height="3.9" rx="0.6" fill="black"/>
         <rect x="8.35" y="8.3" width="1.2" height="3.9" rx="0.6" fill="black"/>
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
         <defs>
           <mask id="front-open">
             <rect width="18" height="18" fill="black"/>
             <rect x="3.1" y="5.1" width="8.8" height="10.1" rx="2.35" fill="white"/>
             <rect x="5.25" y="7.2" width="4.5" height="5.9" rx="1.35" fill="black"/>
             <rect x="8.7" y="3.9" width="4.8" height="4.6" rx="1.2" fill="black"/>
           </mask>
         </defs>
         <rect x="8.35" y="2.7" width="5.45" height="7.15" rx="1.7" fill="black" opacity="0.52"/>
         <rect x="1.8" y="2.8" width="12.8" height="13.2" rx="3.1" fill="black" mask="url(#front-open)"/>
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
