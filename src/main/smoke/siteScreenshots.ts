import { BrowserWindow, nativeImage, type Rectangle } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { enqueuePasteStackItems, clearPasteStack } from '../clipboard'
import { deleteClipItems, insertFullClipItem } from '../database/clipItems'
import {
  createPreviewWindow,
  createSettingsWindow,
  getPreviewWindow,
  getSettingsWindow,
  getStackDockWindow
} from '../windows'

const SCREENSHOT_SOURCE_APP = 'com.clipmate.website'

interface ScreenshotOptions {
  openPanel: () => Promise<void>
  getMainWindow: () => BrowserWindow | null
}

interface SeededWebsiteItems {
  textId: string
  notesId: string
  linkId: string
  imageId: string
  fileId: string
  colorId: string
  searchToken: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor<T>(
  getter: () => Promise<T | null | false | undefined> | T | null | false | undefined,
  timeoutMs: number,
  label: string
): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await getter()
    if (value) return value
    await delay(80)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function waitForWindowLoad(window: BrowserWindow): Promise<void> {
  if (!window.webContents.isLoadingMainFrame()) return

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
  })
}

async function waitForVisibleWindow(
  getter: () => BrowserWindow | null,
  label: string
): Promise<BrowserWindow> {
  return waitFor(
    () => {
      const window = getter()
      if (!window || window.isDestroyed() || !window.isVisible()) return null
      return window
    },
    5_000,
    label
  )
}

async function closeManagedWindow(getter: () => BrowserWindow | null): Promise<void> {
  const window = getter()
  if (!window || window.isDestroyed()) return

  window.close()
  await waitFor(
    () => {
      const current = getter()
      return !current || current.isDestroyed() ? true : null
    },
    2_500,
    'window to close'
  )
}

function createSampleImageBase64(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <defs>
        <linearGradient id="bg" x1="80" y1="40" x2="820" y2="560" gradientUnits="userSpaceOnUse">
          <stop stop-color="#91a9ff" />
          <stop offset="1" stop-color="#4f74f6" />
        </linearGradient>
      </defs>
      <rect width="900" height="600" rx="52" fill="#eef4ff" />
      <rect x="42" y="42" width="816" height="516" rx="42" fill="url(#bg)" />
      <rect x="100" y="112" width="700" height="92" rx="28" fill="rgba(255,255,255,0.78)" />
      <rect x="100" y="250" width="324" height="196" rx="32" fill="rgba(255,255,255,0.82)" />
      <rect x="460" y="250" width="340" height="196" rx="32" fill="rgba(17,37,61,0.18)" />
      <circle cx="718" cy="372" r="72" fill="rgba(255,255,255,0.16)" />
      <circle cx="758" cy="332" r="22" fill="rgba(255,255,255,0.72)" />
      <text x="132" y="168" fill="#17253d" font-size="44" font-family="Inter, sans-serif" font-weight="700">
        ClipMate
      </text>
      <text x="132" y="318" fill="#17253d" font-size="34" font-family="Inter, sans-serif" font-weight="600">
        官网截图示例
      </text>
      <text x="132" y="364" fill="#4b6287" font-size="24" font-family="Inter, sans-serif">
        本地优先 · 搜索 · OCR · 直接粘贴
      </text>
      <text x="492" y="324" fill="#ffffff" font-size="26" font-family="Inter, sans-serif" font-weight="600">
        可用于图片条目
      </text>
      <text x="492" y="366" fill="#eef4ff" font-size="22" font-family="Inter, sans-serif">
        生成真实预览缩略图
      </text>
    </svg>
  `.trim()

  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  )
  return image.toPNG().toString('base64')
}

function seedWebsiteScreenshotItems(): SeededWebsiteItems {
  const now = Date.now()
  const imageBase64 = createSampleImageBase64()

  const textId = randomUUID()
  const notesId = randomUUID()
  const linkId = randomUUID()
  const imageId = randomUUID()
  const fileId = randomUUID()
  const colorId = randomUUID()
  const searchToken = '下载入口示例'

  insertFullClipItem({
    id: textId,
    type: 'text',
    content: `通过 GitHub Releases 下载最新版本。${searchToken}`,
    plainText: `通过 GitHub Releases 下载最新版本。${searchToken}`,
    ocrText: null,
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '下载入口文案',
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 60,
    updatedAt: now + 60
  })

  insertFullClipItem({
    id: notesId,
    type: 'text',
    content: '支持搜索、OCR、直接粘贴、Paste Stack 与可选 iCloud Drive 同步。',
    plainText: '支持搜索、OCR、直接粘贴、Paste Stack 与可选 iCloud Drive 同步。',
    ocrText: null,
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '功能亮点',
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 50,
    updatedAt: now + 50
  })

  insertFullClipItem({
    id: linkId,
    type: 'link',
    content: 'https://github.com/zhuiyue132/ClipMate/releases/latest',
    plainText: 'https://github.com/zhuiyue132/ClipMate/releases/latest',
    ocrText: null,
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '最新版本下载',
    thumbnail: null,
    linkMeta: JSON.stringify({
      title: 'GitHub Releases · ClipMate',
      description: `从 GitHub Releases 下载最新版本，并查看更新记录。${searchToken}`
    }),
    isConfidential: 0,
    createdAt: now + 40,
    updatedAt: now + 40
  })

  insertFullClipItem({
    id: fileId,
    type: 'file',
    content: JSON.stringify({ paths: ['/tmp/ClipMate-安装清单.md'] }),
    plainText: '/tmp/ClipMate-安装清单.md',
    ocrText: null,
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '安装清单',
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 30,
    updatedAt: now + 30
  })

  insertFullClipItem({
    id: colorId,
    type: 'color',
    content: '#7C9CFF',
    plainText: '#7C9CFF',
    ocrText: null,
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '官网主色',
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 20,
    updatedAt: now + 20
  })

  insertFullClipItem({
    id: imageId,
    type: 'image',
    content: imageBase64,
    plainText: null,
    ocrText: 'ClipMate 官网截图示例 本地优先 搜索 OCR 直接粘贴',
    sourceApp: SCREENSHOT_SOURCE_APP,
    sourceAppName: 'ClipMate 官网',
    title: '官网视觉示例',
    thumbnail: Buffer.from(imageBase64, 'base64'),
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 10,
    updatedAt: now + 10
  })

  return { textId, notesId, linkId, imageId, fileId, colorId, searchToken }
}

async function saveWindowCapture(
  window: BrowserWindow,
  outputName: string,
  rect?: Rectangle
): Promise<void> {
  const image = await window.webContents.capturePage(rect)
  const outputDir = join(process.cwd(), 'website', 'public', 'screenshots')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, outputName), image.toPNG())
}

async function prepareSearchState(window: BrowserWindow, token: string): Promise<void> {
  const ok = await window.webContents.executeJavaScript(`
    (async () => {
      const toggle = document.querySelector('.search-toggle')
      if (!toggle) return false
      toggle.click()
      await new Promise((resolve) => setTimeout(resolve, 80))
      const input = document.querySelector('.search-input')
      if (!input) return false
      input.focus()
      input.value = ${JSON.stringify(token)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 520))
      return Boolean(document.querySelector('.panel-search-scene__chips')) &&
        document.body.innerText.includes(${JSON.stringify(token)})
    })()
  `)

  if (!ok) {
    throw new Error('Failed to prepare main panel search state for screenshot capture')
  }
}

export async function runWebsiteScreenshotCapture(options: ScreenshotOptions): Promise<void> {
  const seeded = seedWebsiteScreenshotItems()
  const mainPanelTopInset = 56

  try {
    await options.openPanel()

    const mainWindow = await waitForVisibleWindow(
      options.getMainWindow,
      'main window to become visible for website screenshots'
    )
    await waitForWindowLoad(mainWindow)
    await waitFor(
      () =>
        mainWindow.webContents.executeJavaScript(`
          Boolean(document.querySelector('.cards-viewport')) &&
          Boolean(document.querySelector('[data-card-id="${seeded.textId}"]')) ? true : null
        `),
      5_000,
      'main panel to render seeded items'
    )
    await delay(320)

    const mainBounds = mainWindow.getBounds()
    await saveWindowCapture(mainWindow, 'main-panel-overview.png', {
      x: 0,
      y: mainPanelTopInset,
      width: Math.min(1180, mainBounds.width),
      height: Math.max(240, mainBounds.height - mainPanelTopInset)
    })

    await prepareSearchState(mainWindow, seeded.searchToken)
    await delay(220)
    await saveWindowCapture(mainWindow, 'main-panel-search.png', {
      x: 0,
      y: mainPanelTopInset,
      width: Math.min(900, mainBounds.width),
      height: Math.max(240, mainBounds.height - mainPanelTopInset)
    })

    createPreviewWindow(seeded.textId)
    const previewWindow = await waitForVisibleWindow(
      getPreviewWindow,
      'preview window for screenshots'
    )
    await waitForWindowLoad(previewWindow)
    await waitFor(
      () =>
        previewWindow.webContents.executeJavaScript(`
          Boolean(document.querySelector('.preview-header')) &&
          Boolean(document.querySelector('.preview-text')) ? true : null
        `),
      5_000,
      'preview window content'
    )
    await delay(180)
    await saveWindowCapture(previewWindow, 'preview-panel-text.png')

    createSettingsWindow({ tab: 'storage' })
    const settingsWindow = await waitForVisibleWindow(
      getSettingsWindow,
      'settings window for screenshots'
    )
    await waitForWindowLoad(settingsWindow)
    await waitFor(
      () =>
        settingsWindow.webContents.executeJavaScript(`
          Boolean(document.querySelector('.settings-header')) &&
          window.location.hash.includes('tab=storage') ? true : null
        `),
      5_000,
      'settings storage tab'
    )
    await delay(180)
    await saveWindowCapture(settingsWindow, 'settings-panel-storage.png')

    enqueuePasteStackItems([seeded.linkId, seeded.textId, seeded.imageId])
    const stackDockWindow = await waitForVisibleWindow(getStackDockWindow, 'stack dock window')
    await waitForWindowLoad(stackDockWindow)
    await waitFor(
      () =>
        stackDockWindow.webContents.executeJavaScript(`
          document.querySelectorAll('.stack-screen-item').length >= 3 ? true : null
        `),
      5_000,
      'stack dock items'
    )
    await delay(180)
    await saveWindowCapture(stackDockWindow, 'paste-stack.png')
  } finally {
    clearPasteStack()
    await closeManagedWindow(getPreviewWindow)
    await closeManagedWindow(getSettingsWindow)
    deleteClipItems([
      seeded.textId,
      seeded.notesId,
      seeded.linkId,
      seeded.imageId,
      seeded.fileId,
      seeded.colorId
    ])
    await delay(120)
  }
}
