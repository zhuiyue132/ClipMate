import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDatabase } from '../database'
import {
  getClipItemSummaryById,
  getSourceAppSummaries,
  updateClipItemOcrText
} from '../database/clipItems'
import { broadcastHistoryUpsert } from '../events'
import { logOcrDebug } from './debug'
import { getOcrRuntimeInfo, runVisionOcr } from './runtime'

let timer: NodeJS.Timeout | null = null
let running = false
let enabled = false

async function processPendingImageOcrOnce(): Promise<boolean> {
  if (!enabled || running) return false
  running = true

  try {
    const db = getDatabase()
    const row = db
      .prepare(
        `
        SELECT id, content
        FROM clip_items
        WHERE type = 'image' AND ocr_text IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get() as { id: string; content: string } | undefined

    if (!row) return false

    const dir = join(tmpdir(), 'clipmate-ocr')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `${row.id}.png`)
    writeFileSync(filePath, Buffer.from(row.content, 'base64'))

    let text = ''
    try {
      const result = await runVisionOcr(filePath)
      text = result.text
      logOcrDebug('OCR item processed', {
        itemId: row.id,
        engine: result.engine,
        usedFallback: result.usedFallback,
        executablePath: result.executablePath,
        textLength: result.text.length
      })
    } catch (error) {
      console.error('[ocr] failed to process image item', {
        itemId: row.id,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    } finally {
      try {
        unlinkSync(filePath)
      } catch {
        // ignore
      }
    }

    updateClipItemOcrText(row.id, text)
    const summary = getClipItemSummaryById(row.id)
    if (summary) {
      broadcastHistoryUpsert([summary], getSourceAppSummaries(), 'ocr')
    }

    return true
  } finally {
    running = false
  }
}

export function startOcrWorker(): void {
  if (timer) return
  const runtime = getOcrRuntimeInfo()
  enabled = runtime.enabled
  logOcrDebug('starting OCR worker', runtime)
  if (!enabled) return

  timer = setInterval(() => {
    void processPendingImageOcrOnce()
  }, 12_000)

  void processPendingImageOcrOnce()
}

export function stopOcrWorker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  running = false
  enabled = false
}
