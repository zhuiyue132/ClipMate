import { clipboard, type BrowserWindow, app } from 'electron'
import { randomUUID } from 'node:crypto'
import { captureClipboardBurst } from '../clipboard'
import {
  deleteClipItems,
  getClipItemById,
  getClipItems,
  insertFullClipItem
} from '../database/clipItems'
import { getDatabase } from '../database'
import {
  createPreviewWindow,
  createSettingsWindow,
  getPreviewWindow,
  getSettingsWindow
} from '../windows'

const SMOKE_SOURCE_APP = 'com.clipmate.smoke'
const SMOKE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1cAAAAASUVORK5CYII='

type SmokeSettingsTab = 'general' | 'privacy' | 'storage' | 'sync' | 'about'

interface SmokeOptions {
  openPanel: () => Promise<void>
  getMainWindow: () => BrowserWindow | null
}

interface SeededSmokeItems {
  editableId: string
  previewId: string
  linkId: string
  imageId: string
  imageTitle: string
  fileId: string
  colorId: string
  editableText: string
  updatedText: string
  previewText: string
  searchToken: string
  liveClipboardText: string
  linkUrl: string
  updatedLinkUrl: string
  linkDescription: string
  imageOcrText: string
  filePaths: string[]
  colorValue: string
  updatedColorValue: string
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
  if (!window.webContents.isLoadingMainFrame()) {
    return
  }

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
  })
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

async function waitForVisibleWindow(
  getter: () => BrowserWindow | null,
  label: string
): Promise<BrowserWindow> {
  return waitFor(
    () => {
      const window = getter()
      if (!window || window.isDestroyed() || !window.isVisible()) {
        return null
      }
      return window
    },
    4_000,
    label
  )
}

async function openPreviewWindowForItem(
  itemId: string,
  label: string,
  mode: 'view' | 'edit' = 'view'
): Promise<BrowserWindow> {
  createPreviewWindow(itemId, { mode })
  const previewWindow = await waitForVisibleWindow(getPreviewWindow, label)
  await waitForWindowLoad(previewWindow)
  await waitFor(
    () =>
      previewWindow.webContents.executeJavaScript(`
        (() => {
          const hash = window.location.hash
          const expectedMode = ${JSON.stringify(`mode=${mode}`)}
          const ready =
            Boolean(document.querySelector('.preview-header')) &&
            Boolean(document.querySelector('.preview-footer')) &&
            Boolean(document.querySelector('.preview-scene')) &&
            Boolean(document.querySelector('.preview-meta-list'))
          return hash.includes(${JSON.stringify(itemId)}) && hash.includes(expectedMode) && ready
            ? true
            : null
        })()
      `),
    4_000,
    `${label} route`
  )
  await delay(120)
  return previewWindow
}

async function openSettingsWindowForTab(
  tab: SmokeSettingsTab,
  label: string
): Promise<BrowserWindow> {
  createSettingsWindow({ tab })
  const settingsWindow = await waitForVisibleWindow(getSettingsWindow, label)
  await waitForWindowLoad(settingsWindow)
  await waitFor(
    () =>
      settingsWindow.webContents.executeJavaScript(`
        (() => {
          const title = document.querySelector('.settings-header__title')?.textContent?.trim() ?? ''
          return window.location.hash.includes(${JSON.stringify(`tab=${tab}`)}) &&
            Boolean(document.querySelector('.settings-sidebar')) &&
            Boolean(document.querySelector('.settings-nav')) &&
            Boolean(document.querySelector('.settings-content')) &&
            title.length > 0
            ? true
            : null
        })()
      `),
    4_000,
    `${label} content`
  )
  await delay(120)
  return settingsWindow
}

async function closeManagedWindow(
  getter: () => BrowserWindow | null,
  label: string
): Promise<void> {
  const window = getter()
  if (!window || window.isDestroyed()) {
    return
  }

  window.close()
  await waitFor(
    () => {
      const current = getter()
      return !current || current.isDestroyed() ? true : null
    },
    2_500,
    label
  )
}

function assertPreviewShell(
  state: {
    hasHeader: boolean
    hasFooter: boolean
    hasScene: boolean
    hasMetaList: boolean
    hash: string
  },
  label: string
): void {
  assert(
    state.hasHeader && state.hasFooter && state.hasScene && state.hasMetaList,
    `${label} did not render the shared preview shell: ${JSON.stringify(state)}`
  )
}

function seedSmokeItems(): SeededSmokeItems {
  const token = `SMOKE-${Date.now()}`
  const now = Date.now()

  const editableId = randomUUID()
  const previewId = randomUUID()
  const linkId = randomUUID()
  const imageId = randomUUID()
  const fileId = randomUUID()
  const colorId = randomUUID()

  const editableText = `${token} editable entry for preview editing`
  const updatedText = `${token} preview edit saved`
  const previewText = `${token} preview body for smoke validation`
  const searchToken = `${token} SEARCH`
  const liveClipboardText = `${token} LIVE_CLIPBOARD`
  const linkUrl = `https://example.com/clipmate-smoke-${Date.now()}`
  const updatedLinkUrl = `https://example.com/clipmate-smoke-updated-${Date.now()}`
  const linkDescription = `${token} metadata description for preview validation`
  const imageOcrText = `${token} OCR TEXT`
  const imageTitle = `Image ${token}`
  const filePaths = ['/tmp/clipmate-smoke-a.txt', '/tmp/clipmate-smoke-b.png']
  const colorValue = '#007aff'
  const updatedColorValue = '#34c759'

  insertFullClipItem({
    id: editableId,
    type: 'text',
    content: `${editableText} ${searchToken}`,
    plainText: `${editableText} ${searchToken}`,
    ocrText: null,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: `Editable ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 60,
    updatedAt: now + 60
  })

  insertFullClipItem({
    id: previewId,
    type: 'text',
    content: previewText,
    plainText: previewText,
    ocrText: null,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: `Preview ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 50,
    updatedAt: now + 50
  })

  insertFullClipItem({
    id: linkId,
    type: 'link',
    content: linkUrl,
    plainText: linkUrl,
    ocrText: null,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: `Link ${token}`,
    thumbnail: null,
    linkMeta: JSON.stringify({
      title: `Smoke Link ${token}`,
      description: linkDescription
    }),
    isConfidential: 0,
    createdAt: now + 40,
    updatedAt: now + 40
  })

  insertFullClipItem({
    id: imageId,
    type: 'image',
    content: SMOKE_IMAGE_BASE64,
    plainText: null,
    ocrText: imageOcrText,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: imageTitle,
    thumbnail: Buffer.from(SMOKE_IMAGE_BASE64, 'base64'),
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 30,
    updatedAt: now + 30
  })

  insertFullClipItem({
    id: fileId,
    type: 'file',
    content: JSON.stringify({ paths: filePaths }),
    plainText: filePaths.join('\n'),
    ocrText: null,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: `Files ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 20,
    updatedAt: now + 20
  })

  insertFullClipItem({
    id: colorId,
    type: 'color',
    content: colorValue,
    plainText: colorValue,
    ocrText: null,
    sourceApp: SMOKE_SOURCE_APP,
    sourceAppName: 'ClipMate Smoke',
    title: `Color ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 10,
    updatedAt: now + 10
  })

  return {
    editableId,
    previewId,
    linkId,
    imageId,
    imageTitle,
    fileId,
    colorId,
    editableText,
    updatedText,
    previewText,
    searchToken,
    liveClipboardText,
    linkUrl,
    updatedLinkUrl,
    linkDescription,
    imageOcrText,
    filePaths,
    colorValue,
    updatedColorValue
  }
}

function cleanupSmokeItems(seed: SeededSmokeItems): void {
  const db = getDatabase()
  const createdOcrTitle = `${seed.imageTitle} · OCR`
  const rows = db
    .prepare(
      `
        SELECT id
        FROM clip_items
        WHERE source_app = ?
          OR plain_text = ?
          OR (source_app = ? AND title = ? AND plain_text = ?)
      `
    )
    .all(
      SMOKE_SOURCE_APP,
      seed.liveClipboardText,
      'com.clipmate.app',
      createdOcrTitle,
      seed.imageOcrText
    ) as Array<{ id: string }>

  const ids = Array.from(new Set(rows.map((row) => row.id)))
  if (ids.length > 0) {
    deleteClipItems(ids)
  }
}

export async function runPanelSmokeTest(options: SmokeOptions): Promise<void> {
  const seeded = seedSmokeItems()
  const result: Record<string, unknown> = {}

  try {
    await options.openPanel()

    const mainWindow = await waitForVisibleWindow(
      options.getMainWindow,
      'main window to become visible'
    )

    await waitForWindowLoad(mainWindow)
    await delay(300)

    const panelReady = await mainWindow.webContents.executeJavaScript(`
      ({
        cards: document.querySelectorAll('.card').length,
        hasViewport: Boolean(document.querySelector('.cards-viewport'))
      })
    `)
    assert(
      panelReady.cards > 0 && panelReady.hasViewport,
      'Panel did not render visible history cards'
    )
    result.panel = panelReady

    const searchState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const toggle = document.querySelector('.search-toggle')
        if (!toggle) return { ok: false, reason: 'missing-search-toggle' }
        toggle.click()
        await new Promise((resolve) => setTimeout(resolve, 60))
        const input = document.querySelector('.search-input')
        if (!input) return { ok: false, reason: 'missing-search-input' }
        input.focus()
        input.value = ${JSON.stringify(seeded.searchToken)}
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 420))
        return {
          ok: document.body.innerText.includes(${JSON.stringify(seeded.searchToken)}),
          cards: document.querySelectorAll('.card').length,
          hasSceneStack: Boolean(document.querySelector('.panel-scene-stack')),
          chipCount: document.querySelectorAll('.panel-search-scene__chips .status-pill').length,
          actionLabels: Array.from(document.querySelectorAll('.panel-scene-stack button'))
            .map((node) => node.textContent?.trim())
            .filter(Boolean),
          body: document.body.innerText.slice(0, 800)
        }
      })()
    `)
    assert(
      searchState.ok &&
        searchState.hasSceneStack &&
        searchState.chipCount > 0 &&
        searchState.actionLabels.includes('退出搜索'),
      `Search scene did not render expected UI: ${JSON.stringify(searchState)}`
    )
    result.search = searchState

    const searchEmptyState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const input = document.querySelector('.search-input')
        if (!input) return { ok: false, reason: 'missing-search-input' }
        input.focus()
        input.value = ${JSON.stringify(`${seeded.searchToken}-NORESULT`)}
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 420))
        return {
          ok: Boolean(document.querySelector('.panel-empty-state')),
          title: document.querySelector('.panel-state-view__title')?.textContent?.trim() ?? '',
          subtitle: document.querySelector('.panel-state-view__subtitle')?.textContent?.trim() ?? '',
          actionLabels: Array.from(document.querySelectorAll('.panel-empty-state button'))
            .map((node) => node.textContent?.trim())
            .filter(Boolean),
          body: document.body.innerText.slice(0, 800)
        }
      })()
    `)
    assert(
      searchEmptyState.ok &&
        searchEmptyState.title.length > 0 &&
        searchEmptyState.title !== 'ClipMate 已就绪' &&
        searchEmptyState.actionLabels.includes('返回浏览'),
      `Search empty state did not render expected UI: ${JSON.stringify(searchEmptyState)}`
    )
    result.searchEmpty = searchEmptyState

    const exitSearchState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const back = Array.from(document.querySelectorAll('.panel-empty-state button')).find((node) =>
          node.textContent?.includes('返回浏览')
        )
        if (!back) return { ok: false, reason: 'missing-return-button' }
        back.click()
        await new Promise((resolve) => setTimeout(resolve, 260))
        const input = document.querySelector('.search-input')
        const viewport = document.querySelector('.cards-viewport')
        if (viewport) {
          viewport.scrollLeft = 0
          viewport.dispatchEvent(new Event('scroll'))
        }
        return {
          ok: Boolean(viewport) && (input?.value ?? '') === '',
          hasSceneStack: Boolean(document.querySelector('.panel-scene-stack')),
          cards: document.querySelectorAll('.card').length
        }
      })()
    `)
    assert(
      exitSearchState.ok && !exitSearchState.hasSceneStack,
      `Exit search did not restore browse state: ${JSON.stringify(exitSearchState)}`
    )
    result.searchExit = exitSearchState

    const scrollState = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const viewport = document.querySelector('.cards-viewport')
        if (!viewport) return { ok: false, reason: 'missing-viewport' }
        const track = document.querySelector('.cards-track')
        const trackWidth = track ? parseFloat(track.style.width || '0') : 0
        return {
          ok: viewport.scrollWidth > viewport.clientWidth,
          trackWidth,
          scrollLeft: viewport.scrollLeft,
          scrollWidth: viewport.scrollWidth,
          clientWidth: viewport.clientWidth,
          renderedCards: document.querySelectorAll('.card').length
        }
      })()
    `)
    assert(
      scrollState.ok,
      `Cards viewport did not expose a horizontal scroll range: ${JSON.stringify(scrollState)}`
    )
    result.scroll = scrollState

    const selectionState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const card = document.querySelector('[data-card-id="${seeded.editableId}"]')
        if (!card) return { ok: false, reason: 'missing-selection-card' }
        card.click()
        await new Promise((resolve) => setTimeout(resolve, 120))
        return {
          ok: card.classList.contains('selected') && card.classList.contains('active'),
          stillVisible: Boolean(document.querySelector('.cards-viewport'))
        }
      })()
    `)
    assert(selectionState.ok, `Selection flow failed: ${JSON.stringify(selectionState)}`)
    result.selection = selectionState

    const multiSelectState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const primary = document.querySelector('[data-card-id="${seeded.editableId}"]')
        const secondary = document.querySelector('[data-card-id="${seeded.previewId}"]')
        if (!primary || !secondary) {
          return { ok: false, reason: 'missing-multi-select-cards' }
        }
        primary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 80))
        secondary.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
        await new Promise((resolve) => setTimeout(resolve, 120))
        const banner = Array.from(document.querySelectorAll('.panel-scene-stack .feedback-banner')).find((node) =>
          node.textContent?.includes('已选中')
        )
        return {
          ok:
            Boolean(banner) &&
            primary.classList.contains('selected') &&
            secondary.classList.contains('selected'),
          title: banner?.querySelector('.feedback-banner__title')?.textContent?.trim() ?? '',
          actionLabels: Array.from(document.querySelectorAll('.panel-scene-stack button'))
            .map((node) => node.textContent?.trim())
            .filter(Boolean),
          selectedCards: document.querySelectorAll('.card.selected').length
        }
      })()
    `)
    assert(
      multiSelectState.ok &&
        multiSelectState.selectedCards >= 2 &&
        multiSelectState.actionLabels.includes('复制为文本') &&
        multiSelectState.actionLabels.includes('加入 Paste Stack') &&
        multiSelectState.actionLabels.includes('删除所选'),
      `Multi-selection batch actions did not render correctly: ${JSON.stringify(multiSelectState)}`
    )
    result.multiSelect = multiSelectState

    const restoreSelectionState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const clear = Array.from(document.querySelectorAll('.panel-scene-stack button')).find((node) =>
          node.textContent?.includes('取消选择')
        )
        if (!clear) return { ok: false, reason: 'missing-clear-selection-button' }
        clear.click()
        await new Promise((resolve) => setTimeout(resolve, 120))
        const card = document.querySelector('[data-card-id="${seeded.editableId}"]')
        if (!card) return { ok: false, reason: 'missing-selection-card-after-clear' }
        card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 120))
        return {
          ok:
            card.classList.contains('selected') &&
            document.querySelectorAll('.card.selected').length === 1 &&
            !document.body.innerText.includes('删除所选')
        }
      })()
    `)
    assert(
      restoreSelectionState.ok,
      `Selection state did not reset for paste validation: ${JSON.stringify(restoreSelectionState)}`
    )
    result.selectionReset = restoreSelectionState

    await mainWindow.webContents.executeJavaScript(`
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true
        })
      )
    `)

    await waitFor(
      () => {
        const window = options.getMainWindow()
        if (!window || window.isDestroyed()) return null
        return window.isVisible() ? null : true
      },
      3_500,
      'main window to hide after keyboard paste'
    )
    result.activation = { ok: true }

    await options.openPanel()
    await waitForVisibleWindow(options.getMainWindow, 'main window to reopen after keyboard paste')
    await delay(220)

    const editState = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const card = document.querySelector('[data-card-id="${seeded.editableId}"]')
        if (!card) return { ok: false, reason: 'missing-edit-card' }
        const editButton = card.querySelector('.card-tool-btn')
        if (!editButton) return { ok: false, reason: 'missing-edit-button' }
        editButton.click()
        return { ok: true }
      })()
    `)
    assert(editState.ok, `Preview edit launch failed: ${editState.reason ?? 'unknown error'}`)

    const previewEditWindow = await waitForVisibleWindow(
      getPreviewWindow,
      'preview edit window to become visible'
    )
    await waitForWindowLoad(previewEditWindow)
    await waitFor(
      () =>
        previewEditWindow.webContents.executeJavaScript(`
          Boolean(document.querySelector('.edit-area')) ? true : null
        `),
      4_000,
      'preview edit textarea'
    )

    const previewEditState = await previewEditWindow.webContents.executeJavaScript(`
      (async () => {
        const editor = document.querySelector('.edit-area')
        if (!editor) return { ok: false, reason: 'missing-preview-editor', hash: window.location.hash }
        editor.focus()
        editor.value = ${JSON.stringify(seeded.updatedText)}
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 40))
        const saveButton = document.querySelector('.preview-actions .icon-btn[title="保存"]')
        if (!saveButton) {
          return { ok: false, reason: 'missing-preview-save-button', hash: window.location.hash }
        }
        saveButton.click()
        return { ok: true, hash: window.location.hash }
      })()
    `)
    assert(
      previewEditState.ok,
      `Preview edit state failed: ${previewEditState.reason ?? 'unknown error'}`
    )

    await waitFor(
      () => (getClipItemById(seeded.editableId)?.plain_text === seeded.updatedText ? true : null),
      3_500,
      'preview-edited smoke item to persist'
    )
    result.editText = { ok: true }
    await closeManagedWindow(getPreviewWindow, 'preview window to close after text edit')

    clipboard.writeText(seeded.liveClipboardText)
    await captureClipboardBurst(900, 60)

    await waitFor(
      () => {
        const item = getClipItems(12, 0).find((entry) =>
          entry.plain_text_preview?.includes(seeded.liveClipboardText)
        )
        return item ? item.id : null
      },
      4_000,
      'live clipboard capture to reach recent history'
    )

    const liveClipboardState = await waitFor(
      () =>
        mainWindow.webContents.executeJavaScript(`
          document.body.innerText.includes(${JSON.stringify(seeded.liveClipboardText)})
        `),
      2_500,
      'renderer live clipboard mutation to become visible'
    )
    assert(Boolean(liveClipboardState), 'Live clipboard update did not reach the renderer')
    result.liveClipboard = { ok: true }

    const previewWindow = await openPreviewWindowForItem(seeded.previewId, 'text preview window')

    const textPreviewState = await previewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        hasTextBlock: Boolean(document.querySelector('.preview-text')),
        body: document.body.innerText.slice(0, 1200)
      })
    `)
    assertPreviewShell(textPreviewState, 'Text preview')
    assert(
      textPreviewState.hasTextBlock && textPreviewState.body.includes(seeded.previewText),
      `Text preview content did not render correctly: ${JSON.stringify(textPreviewState)}`
    )
    result.previewText = textPreviewState

    const linkPreviewWindow = await openPreviewWindowForItem(seeded.linkId, 'link preview window')
    const linkPreviewState = await linkPreviewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        hasLinkMetaCard: Boolean(document.querySelector('.link-meta-card')),
        hasWebview: Boolean(document.querySelector('.webview')),
        hasLinkEditButton: Boolean(document.querySelector('.preview-actions .icon-btn[title="编辑链接"]')),
        hasLinkDescription: document.body.innerText.includes(${JSON.stringify(seeded.linkDescription)}),
        hasLinkUrl: document.body.innerText.includes(${JSON.stringify(seeded.linkUrl)}),
        body: document.body.innerText.slice(0, 1400)
      })
    `)
    assertPreviewShell(linkPreviewState, 'Link preview')
    assert(
      linkPreviewState.hasLinkMetaCard &&
        linkPreviewState.hasWebview &&
        linkPreviewState.hasLinkEditButton &&
        linkPreviewState.hasLinkDescription &&
        linkPreviewState.hasLinkUrl,
      `Link preview did not render expected content: ${JSON.stringify(linkPreviewState)}`
    )
    result.previewLink = linkPreviewState

    const linkEditWindow = await openPreviewWindowForItem(
      seeded.linkId,
      'link edit preview window',
      'edit'
    )
    const linkEditState = await linkEditWindow.webContents.executeJavaScript(`
      (async () => {
        const input = document.querySelector('.preview-inline-editor__field')
        if (!input) return { ok: false, reason: 'missing-link-editor', hash: window.location.hash }
        input.focus()
        input.value = ${JSON.stringify(seeded.updatedLinkUrl)}
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 40))
        const saveButton = document.querySelector('.preview-actions .icon-btn[title="保存链接"]')
        if (!saveButton) {
          return { ok: false, reason: 'missing-save-link-button', hash: window.location.hash }
        }
        saveButton.click()
        await new Promise((resolve) => setTimeout(resolve, 120))
        return {
          ok: true,
          hash: window.location.hash,
          stillEditing: Boolean(document.querySelector('.preview-inline-editor__field'))
        }
      })()
    `)
    assert(linkEditState.ok, `Link edit mode failed: ${linkEditState.reason ?? 'unknown error'}`)
    await waitFor(
      () => (getClipItemById(seeded.linkId)?.content === seeded.updatedLinkUrl ? true : null),
      3_500,
      'preview-edited link smoke item to persist'
    )
    await waitFor(
      () =>
        linkEditWindow.webContents.executeJavaScript(`
          document.body.innerText.includes(${JSON.stringify(seeded.updatedLinkUrl)}) ? true : null
        `),
      2_500,
      'updated link preview content to render'
    )
    result.editLink = { ok: true }

    const imagePreviewWindow = await openPreviewWindowForItem(
      seeded.imageId,
      'image preview window'
    )
    const imagePreviewState = await imagePreviewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        hasImageFrame: Boolean(document.querySelector('.preview-image-frame')),
        hasImage: Boolean(document.querySelector('.preview-image-frame img')),
        hasOcrText: document.body.innerText.includes(${JSON.stringify(seeded.imageOcrText)}),
        actionLabels: Array.from(document.querySelectorAll('.preview-content-section button'))
          .map((node) => node.textContent?.trim())
          .filter(Boolean),
        body: document.body.innerText.slice(0, 1400)
      })
    `)
    assertPreviewShell(imagePreviewState, 'Image preview')
    assert(
      imagePreviewState.hasImageFrame &&
        imagePreviewState.hasImage &&
        imagePreviewState.hasOcrText &&
        imagePreviewState.actionLabels.includes('向左旋转') &&
        imagePreviewState.actionLabels.includes('作为文件粘贴'),
      `Image preview did not render expected content: ${JSON.stringify(imagePreviewState)}`
    )
    result.previewImage = imagePreviewState

    const imageOcrCopyState = await imagePreviewWindow.webContents.executeJavaScript(`
      (async () => {
        const button = Array.from(document.querySelectorAll('.preview-content-section button')).find((node) =>
          node.textContent?.includes('复制文字')
        )
        if (!button) return { ok: false, reason: 'missing-copy-ocr-button' }
        if (button.disabled) return { ok: false, reason: 'copy-ocr-button-disabled' }
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 180))
        return {
          ok: true,
          toast: document.querySelector('.toast')?.textContent?.trim() ?? ''
        }
      })()
    `)
    assert(
      imageOcrCopyState.ok && imageOcrCopyState.toast.includes('已复制 OCR 文字'),
      `Image OCR copy action failed: ${JSON.stringify(imageOcrCopyState)}`
    )
    await waitFor(
      () => (clipboard.readText() === seeded.imageOcrText ? true : null),
      2_500,
      'OCR text to reach system clipboard'
    )
    result.imageOcrCopy = {
      ok: true,
      toast: imageOcrCopyState.toast
    }

    const imageOcrCreateState = await imagePreviewWindow.webContents.executeJavaScript(`
      (async () => {
        const button = Array.from(document.querySelectorAll('.preview-content-section button')).find((node) =>
          node.textContent?.includes('转为文本条目')
        )
        if (!button) return { ok: false, reason: 'missing-create-ocr-button' }
        if (button.disabled) return { ok: false, reason: 'create-ocr-button-disabled' }
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 220))
        return {
          ok: true,
          toast: document.querySelector('.toast')?.textContent?.trim() ?? ''
        }
      })()
    `)
    assert(
      imageOcrCreateState.ok && imageOcrCreateState.toast.includes('已创建文本条目'),
      `Image OCR create action failed: ${JSON.stringify(imageOcrCreateState)}`
    )

    const createdOcrTitle = `${seeded.imageTitle} · OCR`
    const createdOcrItemId = await waitFor(
      () => {
        const row = getDatabase()
          .prepare(
            `
              SELECT id
              FROM clip_items
              WHERE source_app = ?
                AND title = ?
                AND plain_text = ?
              ORDER BY created_at DESC
              LIMIT 1
            `
          )
          .get('com.clipmate.app', createdOcrTitle, seeded.imageOcrText) as
          | { id: string }
          | undefined

        return row?.id ?? null
      },
      3_500,
      'OCR-created text item to persist'
    )

    const createdOcrItem = getClipItemById(createdOcrItemId)
    assert(
      createdOcrItem?.type === 'text' &&
        createdOcrItem.plain_text === seeded.imageOcrText &&
        createdOcrItem.source_app === 'com.clipmate.app' &&
        createdOcrItem.source_app_name === 'ClipMate' &&
        createdOcrItem.title === createdOcrTitle,
      `OCR-created text item did not persist expected payload: ${JSON.stringify(createdOcrItem)}`
    )

    const createdOcrPreviewWindow = await openPreviewWindowForItem(
      createdOcrItemId,
      'OCR-created text preview window'
    )
    const createdOcrPreviewState = await createdOcrPreviewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        hasTextBlock: Boolean(document.querySelector('.preview-text')),
        hasCreatedTitle: document.body.innerText.includes(${JSON.stringify(createdOcrTitle)}),
        hasOcrText: document.body.innerText.includes(${JSON.stringify(seeded.imageOcrText)}),
        body: document.body.innerText.slice(0, 1400)
      })
    `)
    assertPreviewShell(createdOcrPreviewState, 'OCR-created text preview')
    assert(
      createdOcrPreviewState.hasTextBlock &&
        createdOcrPreviewState.hasCreatedTitle &&
        createdOcrPreviewState.hasOcrText,
      `OCR-created text preview did not render expected content: ${JSON.stringify(createdOcrPreviewState)}`
    )
    result.imageOcrCreate = {
      ok: true,
      toast: imageOcrCreateState.toast,
      createdItemId: createdOcrItemId,
      title: createdOcrTitle
    }

    const filePreviewWindow = await openPreviewWindowForItem(seeded.fileId, 'file preview window')
    const filePreviewState = await filePreviewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        fileRows: document.querySelectorAll('.file-row').length,
        quickLookButtons: Array.from(document.querySelectorAll('.file-row .tool-btn'))
          .map((node) => node.textContent?.trim())
          .filter(Boolean),
        hasAllPaths: ${JSON.stringify(seeded.filePaths)}.every((path) => document.body.innerText.includes(path)),
        body: document.body.innerText.slice(0, 1400)
      })
    `)
    assertPreviewShell(filePreviewState, 'File preview')
    assert(
      filePreviewState.fileRows === seeded.filePaths.length &&
        filePreviewState.quickLookButtons.length === seeded.filePaths.length &&
        filePreviewState.quickLookButtons.every((label) => label === 'Quick Look') &&
        filePreviewState.hasAllPaths,
      `File preview did not render expected content: ${JSON.stringify(filePreviewState)}`
    )
    result.previewFile = filePreviewState

    const colorPreviewWindow = await openPreviewWindowForItem(
      seeded.colorId,
      'color preview window'
    )
    const colorPreviewState = await colorPreviewWindow.webContents.executeJavaScript(`
      ({
        hash: window.location.hash,
        hasHeader: Boolean(document.querySelector('.preview-header')),
        hasFooter: Boolean(document.querySelector('.preview-footer')),
        hasScene: Boolean(document.querySelector('.preview-scene')),
        hasMetaList: Boolean(document.querySelector('.preview-meta-list')),
        hasColorSwatch: Boolean(document.querySelector('.color-preview-lg')),
        colorInputValue: document.querySelector('.color-input')?.value ?? null,
        hasSaveColor: Array.from(document.querySelectorAll('button')).some((node) =>
          node.textContent?.includes('保存颜色')
        ),
        body: document.body.innerText.slice(0, 1200)
      })
    `)
    assertPreviewShell(colorPreviewState, 'Color preview')
    assert(
      colorPreviewState.hasColorSwatch &&
        colorPreviewState.colorInputValue === seeded.colorValue &&
        colorPreviewState.hasSaveColor,
      `Color preview did not render expected content: ${JSON.stringify(colorPreviewState)}`
    )
    result.previewColor = colorPreviewState

    const colorEditState = await colorPreviewWindow.webContents.executeJavaScript(`
      (async () => {
        const input = document.querySelector('.color-input')
        if (!input) return { ok: false, reason: 'missing-color-input' }
        input.value = ${JSON.stringify(seeded.updatedColorValue)}
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 40))
        const saveButton = Array.from(document.querySelectorAll('button')).find((node) =>
          node.textContent?.includes('保存颜色')
        )
        if (!saveButton) return { ok: false, reason: 'missing-save-color-button' }
        saveButton.click()
        return { ok: true }
      })()
    `)
    assert(colorEditState.ok, `Color edit mode failed: ${JSON.stringify(colorEditState)}`)
    await waitFor(
      () => (getClipItemById(seeded.colorId)?.content === seeded.updatedColorValue ? true : null),
      3_500,
      'preview-edited color smoke item to persist'
    )
    await waitFor(
      () =>
        colorPreviewWindow.webContents.executeJavaScript(`
          document.body.innerText.includes(${JSON.stringify(seeded.updatedColorValue)}) ? true : null
        `),
      2_500,
      'updated color preview content to render'
    )
    result.editColor = { ok: true }

    await closeManagedWindow(getPreviewWindow, 'preview window to close after preview validation')

    const settingsWindow = await openSettingsWindowForTab('privacy', 'settings window')
    const settingsState = await settingsWindow.webContents.executeJavaScript(`
      (async () => {
        const tabs = ${JSON.stringify([
          { label: '通用', sectionTitle: '启动与外观' },
          { label: '隐私', sectionTitle: '系统权限' },
          { label: '存储', sectionTitle: '自动清理' },
          { label: '同步', sectionTitle: 'iCloud Drive 同步' },
          { label: '关于', sectionTitle: '版本信息' }
        ])}
        const initialTitle = document.querySelector('.settings-header__title')?.textContent?.trim() ?? ''
        const initialHash = window.location.hash
        const results = []

        for (const tab of tabs) {
          const button = Array.from(document.querySelectorAll('.settings-nav__item')).find((node) =>
            node.textContent?.includes(tab.label)
          )
          if (!button) {
            results.push({ label: tab.label, ok: false, reason: 'missing-nav-item' })
            continue
          }
          button.click()
          await new Promise((resolve) => setTimeout(resolve, 100))
          const title = document.querySelector('.settings-header__title')?.textContent?.trim() ?? ''
          const content = document.querySelector('.settings-content')?.innerText ?? ''
          results.push({
            label: tab.label,
            ok: title === tab.label && content.includes(tab.sectionTitle),
            title,
            hash: window.location.hash,
            sectionCount: document.querySelectorAll('.surface-section').length,
            rowCount: document.querySelectorAll('.surface-row').length
          })
        }

        return {
          hasSidebar: Boolean(document.querySelector('.settings-sidebar')),
          hasNav: Boolean(document.querySelector('.settings-nav')),
          hasContent: Boolean(document.querySelector('.settings-content')),
          initialTitle,
          initialHash,
          tabs: results
        }
      })()
    `)
    const invalidSettingsTabs = settingsState.tabs.filter(
      (item) => !item.ok || item.sectionCount < 1 || item.rowCount < 1
    )
    assert(
      settingsState.hasSidebar &&
        settingsState.hasNav &&
        settingsState.hasContent &&
        settingsState.initialTitle === '隐私' &&
        settingsState.initialHash.includes('tab=privacy') &&
        invalidSettingsTabs.length === 0,
      `Settings window did not render expected native-like tab structure: ${JSON.stringify(settingsState)}`
    )
    result.settings = settingsState

    console.log(
      JSON.stringify(
        {
          smoke: 'panel-flow',
          status: 'passed',
          result
        },
        null,
        2
      )
    )
  } finally {
    cleanupSmokeItems(seeded)
    getPreviewWindow()?.close()
    getSettingsWindow()?.close()
    options.getMainWindow()?.hide()
    clipboard.clear()
  }

  app.exit(0)
}
