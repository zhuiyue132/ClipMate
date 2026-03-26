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
import { createPreviewWindow, getPreviewWindow } from '../windows'

interface SmokeOptions {
  openPanel: () => Promise<void>
  getMainWindow: () => BrowserWindow | null
}

interface SeededSmokeItems {
  editableId: string
  previewId: string
  editableText: string
  updatedText: string
  previewText: string
  searchToken: string
  liveClipboardText: string
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

function seedSmokeItems(): SeededSmokeItems {
  const token = `SMOKE-${Date.now()}`
  const now = Date.now()

  const editableId = randomUUID()
  const previewId = randomUUID()
  const editableText = `${token} editable entry for inline editing`
  const updatedText = `${token} inline edit saved`
  const previewText = `${token} preview body for smoke validation`
  const searchToken = `${token} SEARCH`
  const liveClipboardText = `${token} LIVE_CLIPBOARD`

  insertFullClipItem({
    id: editableId,
    type: 'text',
    content: `${editableText} ${searchToken}`,
    plainText: `${editableText} ${searchToken}`,
    ocrText: null,
    sourceApp: 'com.clipmate.smoke',
    sourceAppName: 'ClipMate Smoke',
    title: `Editable ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 20,
    updatedAt: now + 20
  })

  insertFullClipItem({
    id: previewId,
    type: 'text',
    content: previewText,
    plainText: previewText,
    ocrText: null,
    sourceApp: 'com.clipmate.smoke',
    sourceAppName: 'ClipMate Smoke',
    title: `Preview ${token}`,
    thumbnail: null,
    linkMeta: null,
    isConfidential: 0,
    createdAt: now + 10,
    updatedAt: now + 10
  })

  return {
    editableId,
    previewId,
    editableText,
    updatedText,
    previewText,
    searchToken,
    liveClipboardText
  }
}

function cleanupSmokeItems(seed: SeededSmokeItems): void {
  const db = getDatabase()
  const rows = db
    .prepare(
      `
        SELECT id
        FROM clip_items
        WHERE source_app = 'com.clipmate.smoke' OR plain_text = ?
      `
    )
    .all(seed.liveClipboardText) as Array<{ id: string }>

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

    const mainWindow = await waitFor(
      () => {
        const window = options.getMainWindow()
        if (!window || window.isDestroyed() || !window.isVisible()) {
          return null
        }
        return window
      },
      4_000,
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
          body: document.body.innerText.slice(0, 600)
        }
      })()
    `)
    assert(searchState.ok, 'Search flow did not surface the seeded smoke item')
    result.search = searchState

    const scrollState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const viewport = document.querySelector('.cards-viewport')
        if (!viewport) return { ok: false, reason: 'missing-viewport' }
        const track = document.querySelector('.cards-track')
        const trackWidth = track ? parseFloat(track.style.width || '0') : 0
        return {
          ok: trackWidth > viewport.clientWidth,
          trackWidth,
          scrollLeft: viewport.scrollLeft,
          scrollWidth: viewport.scrollWidth,
          clientWidth: viewport.clientWidth,
          renderedCards: document.querySelectorAll('.card').length
        }
      })()
    `)
    result.scroll = scrollState

    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const input = document.querySelector('.search-input')
        if (input) {
          input.value = ''
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((resolve) => setTimeout(resolve, 260))
        }
        const viewport = document.querySelector('.cards-viewport')
        if (viewport) {
          viewport.scrollLeft = 0
          viewport.dispatchEvent(new Event('scroll'))
        }
        return true
      })()
    `)

    const editState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const card = document.querySelector('[data-card-id="${seeded.editableId}"]')
        if (!card) return { ok: false, reason: 'missing-edit-card' }
        const editButton = card.querySelector('.card-tool-btn')
        if (!editButton) return { ok: false, reason: 'missing-edit-button' }
        editButton.click()
        await new Promise((resolve) => setTimeout(resolve, 180))
        const editor = document.querySelector('.inline-edit-area')
        if (!editor) return { ok: false, reason: 'missing-inline-editor' }
        editor.value = ${JSON.stringify(seeded.updatedText)}
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 40))
        const saveButton = document.querySelector('.inline-edit-actions .primary-btn.compact')
        if (!saveButton) return { ok: false, reason: 'missing-inline-save-button' }
        saveButton.click()
        return { ok: true }
      })()
    `)
    assert(editState.ok, `Inline edit flow failed: ${editState.reason ?? 'unknown error'}`)

    await waitFor(
      () => (getClipItemById(seeded.editableId)?.plain_text === seeded.updatedText ? true : null),
      3_500,
      'edited smoke item to persist'
    )
    result.edit = { ok: true }

    clipboard.writeText(seeded.liveClipboardText)
    await captureClipboardBurst(900, 60)

    await waitFor(
      () => {
        const item = getClipItems(8, 0).find((entry) =>
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

    createPreviewWindow(seeded.previewId)
    const previewWindow = await waitFor(
      () => {
        const window = getPreviewWindow()
        if (!window || window.isDestroyed() || !window.isVisible()) {
          return null
        }
        return window
      },
      4_000,
      'preview window to become visible'
    )
    await waitForWindowLoad(previewWindow)

    const previewState = await previewWindow.webContents.executeJavaScript(`
      document.body.innerText.includes(${JSON.stringify(seeded.previewText)})
    `)
    assert(Boolean(previewState), 'Preview window did not render the seeded preview item')
    result.preview = { ok: true }

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
    options.getMainWindow()?.hide()
    clipboard.clear()
  }

  app.exit(0)
}
