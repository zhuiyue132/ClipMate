import { clipboard } from 'electron'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database'
import { getFrontmostAppInfo } from '../system/frontmostApp'
import type { ClipItem } from '../../shared/types'

export type ClipboardContent =
  | {
      type: 'text' | 'link' | 'color'
      content: string
      plain_text: string
      thumbnail?: null
    }
  | {
      type: 'richtext'
      content: string // html
      plain_text: string
      thumbnail?: null
    }
  | {
      type: 'image'
      content: string // base64(png)
      plain_text: null
      thumbnail: Buffer | null
    }
  | {
      type: 'file'
      content: string // JSON string: { paths: string[] }
      plain_text: string
      thumbnail?: null
    }

function sha256Base64(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function signatureFor(item: Pick<ClipItem, 'type' | 'content' | 'plain_text'>): string {
  const plain = item.plain_text ?? ''
  const hash = sha256Base64(`${item.type}\n${item.content}\n${plain}`)
  return `${item.type}:${hash}`
}

export function createClipboardSignature(
  item: Pick<ClipItem, 'type' | 'content' | 'plain_text'>
): string {
  return signatureFor(item)
}

export function getClipboardSignature(): string | null {
  const content = readClipboardContent()
  if (!content) return null
  return signatureFor({
    type: content.type,
    content: content.content,
    plain_text: content.plain_text
  })
}

function isProbablyUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

function normalizeHexColor(text: string): string | null {
  const raw = text.trim()
  const hexMatch = raw.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hexMatch) {
    const value = hexMatch[1].toLowerCase()
    if (value.length === 3) {
      const [r, g, b] = value.split('')
      return `#${r}${r}${g}${g}${b}${b}`
    }
    return `#${value}`
  }

  const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  if (rgbMatch) {
    const clamp = (n: number): number => Math.max(0, Math.min(255, n))
    const r = clamp(Number(rgbMatch[1]))
    const g = clamp(Number(rgbMatch[2]))
    const b = clamp(Number(rgbMatch[3]))
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  }

  return null
}

function extractFileUrlsFromBuffer(buffer: Buffer): string[] {
  return decodeClipboardBuffer(buffer).flatMap(extractFilePathsFromText)
}

function decodeClipboardBuffer(buffer: Buffer): string[] {
  const decoded = new Set<string>()

  const utf8 = buffer.toString('utf8')
  if (utf8.replace(/\0/g, '').trim()) {
    decoded.add(utf8)
  }

  const utf16le = buffer.toString('utf16le')
  if (utf16le.replace(/\0/g, '').trim()) {
    decoded.add(utf16le)
  }

  if (buffer.length >= 2 && buffer.length % 2 === 0) {
    const swapped = Buffer.from(buffer)
    for (let i = 0; i < swapped.length; i += 2) {
      const first = swapped[i]
      swapped[i] = swapped[i + 1]
      swapped[i + 1] = first
    }
    const utf16be = swapped.toString('utf16le')
    if (utf16be.replace(/\0/g, '').trim()) {
      decoded.add(utf16be)
    }
  }

  return Array.from(decoded)
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function normalizeClipboardPathCandidate(value: string): string | null {
  const candidate = value.trim().replace(/\0+$/g, '')
  if (!candidate) return null

  if (candidate.startsWith('file://')) {
    try {
      return fileURLToPath(candidate)
    } catch {
      return null
    }
  }

  if (candidate.startsWith('/')) {
    return candidate
  }

  return null
}

function extractFilePathsFromText(text: string): string[] {
  const candidates: string[] = []
  const normalizedText = text.replace(/\0+/g, '\n')
  const fileUrlMatches = normalizedText.match(/file:\/\/[^\s"'<>]+/g) || []
  candidates.push(...fileUrlMatches)

  const plistStringMatches = normalizedText.matchAll(/<string>([\s\S]*?)<\/string>/g)
  for (const match of plistStringMatches) {
    const decoded = decodeXmlEntities(match[1])
    candidates.push(decoded)
  }

  candidates.push(...normalizedText.split(/[\r\n]+/))

  return Array.from(
    new Set(
      candidates
        .map(normalizeClipboardPathCandidate)
        .filter((candidate): candidate is string => Boolean(candidate))
    )
  )
}

function hasNativeFilePayload(formats: string[]): boolean {
  return formats.includes('public.file-url') || formats.includes('NSFilenamesPboardType')
}

function readFilePathsFromClipboard(formats = clipboard.availableFormats()): string[] {
  const candidates = ['public.file-url', 'NSFilenamesPboardType', 'public.url', 'text/uri-list']
  for (const format of candidates) {
    if (!formats.includes(format)) continue
    try {
      const buffer = clipboard.readBuffer(format)
      const paths = extractFileUrlsFromBuffer(buffer)
      if (paths.length > 0) return Array.from(new Set(paths))
    } catch {
      // ignore
    }
  }

  const textPaths = extractFilePathsFromText(clipboard.readText())
  if (textPaths.length > 0) return textPaths

  return []
}

function readClipboardContent(): ClipboardContent | null {
  const formats = clipboard.availableFormats()
  const filePaths = readFilePathsFromClipboard(formats)
  if (filePaths.length > 0) {
    const plain = filePaths.join('\n')
    return {
      type: 'file',
      content: JSON.stringify({ paths: filePaths }),
      plain_text: plain
    }
  }

  if (hasNativeFilePayload(formats)) {
    return null
  }

  const image = clipboard.readImage()
  if (!image.isEmpty()) {
    const png = image.toPNG()
    const thumb = image.resize({ width: 320 }).toPNG()
    return {
      type: 'image',
      content: png.toString('base64'),
      plain_text: null,
      thumbnail: thumb.length > 0 ? thumb : null
    }
  }

  const text = clipboard.readText().trim()
  if (!text) return null

  const normalizedColor = normalizeHexColor(text)
  if (normalizedColor) {
    return { type: 'color', content: normalizedColor, plain_text: normalizedColor }
  }

  const html = clipboard.readHTML().trim()
  if (html) {
    const htmlHasTags = /<\/?[a-z][\s\S]*>/i.test(html)
    if (htmlHasTags) {
      return { type: 'richtext', content: html, plain_text: text }
    }
  }

  if (isProbablyUrl(text)) {
    return { type: 'link', content: text, plain_text: text }
  }

  return { type: 'text', content: text, plain_text: text }
}

export class ClipboardWatcher {
  private intervalId: NodeJS.Timeout | null = null
  private paused = false
  private lastSeenSignature: string | null = null
  private lastSaved: { id: string; signature: string } | null = null
  private pendingSignature: string | null = null
  private ignoreUntil = 0

  constructor(
    private readonly pollMs: number,
    private readonly onItemsChanged: (info: { id: string; isDuplicate: boolean }) => void
  ) {}

  start(): void {
    if (this.intervalId) return

    this.primeLastSaved()
    this.poll()

    this.intervalId = setInterval(() => {
      this.poll()
    }, this.pollMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  isPaused(): boolean {
    return this.paused
  }

  setPaused(next: boolean): void {
    this.paused = next
  }

  captureNow(): void {
    this.poll()
  }

  suppressCapture(ms: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, Date.now() + ms)
  }

  private primeLastSaved(): void {
    const db = getDatabase()
    const latest = db
      .prepare(
        'SELECT id, type, content, plain_text FROM clip_items ORDER BY created_at DESC LIMIT 1'
      )
      .get() as Pick<ClipItem, 'id' | 'type' | 'content' | 'plain_text'> | undefined

    if (latest?.id) {
      this.lastSaved = { id: latest.id, signature: signatureFor(latest) }
    }
  }

  private poll(): void {
    try {
      this.tick()
    } catch (error) {
      console.error('[clipboard] failed to capture clipboard content', error)
    }
  }

  private tick(): void {
    if (Date.now() < this.ignoreUntil) return

    const content = readClipboardContent()
    if (!content) {
      this.pendingSignature = null
      return
    }

    const sig = signatureFor({
      type: content.type,
      content: content.content,
      plain_text: content.plain_text
    })

    if (sig === this.lastSeenSignature) {
      this.pendingSignature = null
      return
    }

    if (sig !== this.pendingSignature) {
      this.pendingSignature = sig
      return
    }

    this.pendingSignature = null
    this.lastSeenSignature = sig

    if (this.paused) return

    const db = getDatabase()
    const now = Date.now()
    const appInfo = getFrontmostAppInfo()

    if (this.lastSaved?.signature === sig) {
      db.prepare('UPDATE clip_items SET created_at = ?, updated_at = ? WHERE id = ?').run(
        now,
        now,
        this.lastSaved.id
      )
      this.onItemsChanged({ id: this.lastSaved.id, isDuplicate: true })
      return
    }

    const id = uuidv4()
    db.prepare(
      `
        INSERT INTO clip_items (
          id, type, content, plain_text, ocr_text,
          source_app, source_app_name, title,
          thumbnail, link_meta,
          is_pinned, is_confidential,
          created_at, updated_at
        )
        VALUES (
          @id, @type, @content, @plain_text, NULL,
          @source_app, @source_app_name, NULL,
          @thumbnail, NULL,
          0, 0,
          @created_at, @updated_at
        )
      `
    ).run({
      id,
      type: content.type,
      content: content.content,
      plain_text: content.plain_text,
      source_app: appInfo.bundleId,
      source_app_name: appInfo.name,
      thumbnail: content.type === 'image' ? content.thumbnail : null,
      created_at: now,
      updated_at: now
    })

    this.lastSaved = { id, signature: sig }
    this.onItemsChanged({ id, isDuplicate: false })
  }
}
