import { app } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getDatabase } from '../database'
import { getMainWindow } from '../windows'

const execFileAsync = promisify(execFile)

let timer: NodeJS.Timeout | null = null
let running = false
let enabled = false

function fileExists(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

function findOcrScriptPath(): string | null {
  const candidates = [
    join(process.cwd(), 'resources/ocr/vision_ocr.swift'),
    join(app.getAppPath(), 'resources/ocr/vision_ocr.swift'),
    join(__dirname, '../../../resources/ocr/vision_ocr.swift')
  ]

  return candidates.find(fileExists) ?? null
}

function isSwiftAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  try {
    execFileSync('swift', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function runVisionOcr(imagePath: string): Promise<string> {
  const scriptPath = findOcrScriptPath()
  if (!scriptPath) throw new Error('Vision OCR script not found')

  const { stdout } = await execFileAsync('swift', [scriptPath, imagePath], {
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024
  })

  return (stdout ?? '').trim()
}

async function tickOnce(): Promise<void> {
  if (!enabled || running) return
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

    if (!row) return

    const dir = join(tmpdir(), 'clipmate-ocr')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `${row.id}.png`)
    writeFileSync(filePath, Buffer.from(row.content, 'base64'))

    let text = ''
    try {
      text = await runVisionOcr(filePath)
    } catch {
      text = ''
    } finally {
      try {
        unlinkSync(filePath)
      } catch {
        // ignore
      }
    }

    db.prepare('UPDATE clip_items SET ocr_text = ?, updated_at = ? WHERE id = ?').run(
      text,
      Date.now(),
      row.id
    )

    getMainWindow()?.webContents.send('clip:itemsChanged')
  } finally {
    running = false
  }
}

export function startOcrWorker(): void {
  if (timer) return
  enabled = isSwiftAvailable()
  if (!enabled) return

  timer = setInterval(() => {
    void tickOnce()
  }, 12_000)

  void tickOnce()
}

export function stopOcrWorker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  running = false
  enabled = false
}
