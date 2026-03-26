import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getDatabase } from '../database'
import {
  getClipItemSummaryById,
  getSourceAppSummaries,
  updateClipItemLinkMeta
} from '../database/clipItems'
import { broadcastHistoryUpsert } from '../events'

const execFileAsync = promisify(execFile)

let timer: NodeJS.Timeout | null = null
let running = false

function extractMetaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  ]

  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function extractTitle(html: string): string | null {
  const og = extractMetaContent(html, 'og:title')
  if (og) return og

  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim() ?? null
}

function extractDescription(html: string): string | null {
  return extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description')
}

function extractImage(html: string): string | null {
  return extractMetaContent(html, 'og:image')
}

async function fetchHtml(url: string): Promise<string> {
  // 优先使用 Node 内置 fetch；若被 CSP/证书等影响，可回退到 curl
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) ClipMate/0.1'
      }
    })
    const text = await res.text()
    return text.slice(0, 2_000_000)
  } catch {
    const { stdout } = await execFileAsync('curl', ['-L', '--max-time', '12', url], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024
    })
    return String(stdout).slice(0, 2_000_000)
  }
}

async function fetchAndStoreLinkMeta(id: string, url: string): Promise<void> {
  let meta: { title?: string; description?: string; image?: string } = {}
  try {
    const html = await fetchHtml(url)
    const title = extractTitle(html)
    const description = extractDescription(html)
    const image = extractImage(html)
    meta = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {})
    }
  } catch {
    meta = {}
  }

  updateClipItemLinkMeta(id, JSON.stringify(meta))
  const summary = getClipItemSummaryById(id)
  if (summary) {
    broadcastHistoryUpsert([summary], getSourceAppSummaries(), 'link-meta')
  }
}

export async function refreshLinkMetaForItem(id: string): Promise<void> {
  const db = getDatabase()
  const row = db
    .prepare('SELECT id, content FROM clip_items WHERE id = ? AND type = ?')
    .get(id, 'link') as { id: string; content: string } | undefined

  if (!row) return
  await fetchAndStoreLinkMeta(row.id, row.content)
}

async function tickOnce(): Promise<void> {
  if (running) return
  running = true

  try {
    const db = getDatabase()
    const row = db
      .prepare(
        `
        SELECT id, content
        FROM clip_items
        WHERE type = 'link' AND link_meta IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get() as { id: string; content: string } | undefined

    if (!row) return

    await fetchAndStoreLinkMeta(row.id, row.content)
  } finally {
    running = false
  }
}

export function startLinkMetaWorker(): void {
  if (timer) return
  timer = setInterval(() => {
    void tickOnce()
  }, 15_000)
  void tickOnce()
}

export function stopLinkMetaWorker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  running = false
}
