import type { ClipItemSummary } from '../../../shared/types'

export interface CardMatchLine {
  key: string
  label: string
  html: string
}

export function typeLabel(type: ClipItemSummary['type']): string {
  switch (type) {
    case 'text':
      return '文本'
    case 'richtext':
      return '富文本'
    case 'link':
      return '链接'
    case 'image':
      return '图片'
    case 'file':
      return '文件'
    case 'color':
      return '颜色'
    default:
      return '内容'
  }
}

export function canOpenPreviewEdit(item: ClipItemSummary): boolean {
  return item.type === 'text' || item.type === 'richtext' || item.type === 'link'
}

export function clipItemTitle(item: ClipItemSummary): string {
  return item.title?.trim() ?? ''
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  return `${day} 天前`
}

export function previewSourceText(item: ClipItemSummary): string {
  if (item.type === 'image') return '图片'
  if (item.type === 'file') return item.file_label || item.content_preview || '文件'
  if (item.type === 'link') {
    return item.link_title || item.content_preview || item.link_url || ''
  }
  return item.content_preview || item.plain_text_preview || ''
}

export function previewText(item: ClipItemSummary): string {
  return previewSourceText(item).slice(0, 80)
}

function includesSearchQuery(text: string | null | undefined, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return false
  return (text ?? '').toLowerCase().includes(needle)
}

export function searchSnippet(text: string, query: string, radius = 44): string {
  const source = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!source) return ''

  const needle = query.trim().toLowerCase()
  if (!needle) return source.slice(0, 80)

  const lower = source.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx === -1) return source.slice(0, 80)

  const start = Math.max(0, idx - radius)
  const end = Math.min(source.length, idx + needle.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < source.length ? '…' : ''
  return `${prefix}${source.slice(start, end)}${suffix}`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function highlight(text: string, query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return escapeHtml(text)

  const source = text ?? ''
  const lower = source.toLowerCase()
  const needle = trimmed.toLowerCase()
  if (!needle) return escapeHtml(source)

  let out = ''
  let i = 0
  while (i < source.length) {
    const idx = lower.indexOf(needle, i)
    if (idx === -1) {
      out += escapeHtml(source.slice(i))
      break
    }
    out += escapeHtml(source.slice(i, idx))
    out += `<mark>${escapeHtml(source.slice(idx, idx + trimmed.length))}</mark>`
    i = idx + trimmed.length
  }
  return out
}

export function cardPreviewHtml(item: ClipItemSummary, query: string, searchMode: boolean): string {
  const source = searchMode ? searchSnippet(previewSourceText(item), query, 52) : previewText(item)
  return highlight(source, query)
}

export function buildCardSearchContextLines(item: ClipItemSummary, query: string): CardMatchLine[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const lines: CardMatchLine[] = []
  const primarySource = previewSourceText(item)

  if (item.ocr_text_preview && includesSearchQuery(item.ocr_text_preview, trimmed)) {
    lines.push({
      key: `${item.id}:ocr`,
      label: 'OCR',
      html: highlight(searchSnippet(item.ocr_text_preview, trimmed, 36), trimmed)
    })
  }

  if (item.link_description && includesSearchQuery(item.link_description, trimmed)) {
    lines.push({
      key: `${item.id}:meta-description`,
      label: '描述',
      html: highlight(searchSnippet(item.link_description, trimmed, 36), trimmed)
    })
  }

  if (
    item.type === 'link' &&
    item.link_url &&
    item.link_url !== primarySource &&
    includesSearchQuery(item.link_url, trimmed)
  ) {
    lines.push({
      key: `${item.id}:url`,
      label: 'URL',
      html: highlight(searchSnippet(item.link_url, trimmed, 32), trimmed)
    })
  }

  return lines.slice(0, 2)
}
