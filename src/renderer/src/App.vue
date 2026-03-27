<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PreviewView from './PreviewView.vue'
import SettingsView from './SettingsView.vue'
import StackDockView from './StackDockView.vue'
import ClipCard from './components/panel/ClipCard.vue'
import ClipContextMenu from './components/panel/ClipContextMenu.vue'
import ClipCreateDialog from './components/panel/ClipCreateDialog.vue'
import PanelFilterPopover from './components/panel/PanelFilterPopover.vue'
import PanelMoreMenu from './components/panel/PanelMoreMenu.vue'
import PanelStateView from './components/panel/PanelStateView.vue'
import PanelToolbar from './components/panel/PanelToolbar.vue'
import ToastNotice from './components/panel/ToastNotice.vue'
import FeedbackBanner from './components/shared/FeedbackBanner.vue'
import InlineActionGroup from './components/shared/InlineActionGroup.vue'
import StatusPill from './components/shared/StatusPill.vue'
import type {
  AppSettings,
  AppIconTarget,
  ClipItemSummary,
  HistoryMutationEvent,
  PanelSnapshot,
  PanelPerformanceMark,
  PasteStackState,
  SearchFilters,
  SettingsSnapshot,
  SourceAppSummary,
  ThemePreference
} from '../../shared/types'

type ClipMenuAction = 'delete'
type TypeChip = 'all' | 'text' | 'image' | 'link' | 'file' | 'color'
type DatePreset = 'all' | 'today' | 'week' | 'custom'
type HistoryCardItem = ClipItemSummary
const TYPE_OPTIONS: Array<{ value: TypeChip; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'link', label: '链接' },
  { value: 'file', label: '文件' },
  { value: 'color', label: '颜色' }
]
const HEADER_CONTROL_COUNT = TYPE_OPTIONS.length + 1

const routeHash = ref(window.location.hash || '#/')
const isSettingsRoute = computed(() => routeHash.value.startsWith('#/settings'))
const isPreviewRoute = computed(() => routeHash.value.startsWith('#/preview'))
const isStackDockRoute = computed(() => routeHash.value.startsWith('#/stack-dock'))
const appSettings = ref<AppSettings | null>(null)

const historyItems = ref<HistoryCardItem[]>([])
const paused = ref(false)
const loading = ref(false)

const search = ref('')
const moreOpen = ref(false)
const filtersOpen = ref(false)
const typeChip = ref<TypeChip>('all')
const typeFocusIndex = ref(0)
const sourceApps = ref<SourceAppSummary[]>([])
const sourceAppFilter = ref<string | null>(null)
const datePreset = ref<DatePreset>('all')
const customFrom = ref('')
const customTo = ref('')

const searchResults = ref<HistoryCardItem[] | null>(null)
const searching = ref(false)

const activeCardId = ref<string | null>(null)
const selectedIds = ref<string[]>([])
const anchorId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
const selectedSet = computed(() => new Set(selectedIds.value))

const createOpen = ref(false)
const createType = ref<'text' | 'link'>('text')
const createTitle = ref('')
const createContent = ref('')

const pasteStackState = ref<PasteStackState>({ enabled: false, entries: [] })

const toast = ref<string | null>(null)
let toastTimer: number | null = null
let activeCardScrollFrame: number | null = null

const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxItem = ref<HistoryCardItem | null>(null)

const historyCardsRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<InstanceType<typeof PanelToolbar> | null>(null)
const panelPreparing = ref(false)
const appIcons = ref<Record<string, string | null>>({})
const appIconFailures = ref<Record<string, true>>({})
const resolvedSearchKey = ref<string | null>(null)
const panelPerformanceMarks = ref<PanelPerformanceMark[]>([])
const cardRefs = new Map<string, HTMLElement>()
const cardsViewportWidth = ref(0)
const cardsViewportScrollLeft = ref(0)

const CARD_WIDTH = 224
const CARD_GAP = 12
const CARD_STRIDE = CARD_WIDTH + CARD_GAP
const CARD_OVERSCAN = 3

const trimmedSearch = computed(() => search.value.trim())
const hasRemoteSearchQuery = computed(() => trimmedSearch.value.length > 0)

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    return
  }

  root.dataset.theme = theme
}

function onHashChange(): void {
  routeHash.value = window.location.hash || '#/'
}

function normalizeShortcutKey(key: string): string {
  const lower = key.toLowerCase()

  if (lower === ' ') return 'space'
  if (lower === 'esc') return 'escape'
  if (lower === 'return') return 'enter'
  if (lower === 'cmd' || lower === 'command' || lower === 'meta') return 'meta'
  if (lower === 'ctrl' || lower === 'control') return 'control'
  if (lower === 'option') return 'alt'
  return lower
}

function matchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  const tokens = accelerator
    .split('+')
    .map((token) => normalizeShortcutKey(token.trim()))
    .filter(Boolean)

  if (tokens.length === 0) return false

  const keyToken = tokens.at(-1) ?? ''
  const wantsMeta = tokens.includes('commandorcontrol')
    ? navigator.platform.toLowerCase().includes('mac')
    : tokens.includes('meta') || tokens.includes('command')
  const wantsCtrl = tokens.includes('commandorcontrol')
    ? !navigator.platform.toLowerCase().includes('mac')
    : tokens.includes('control')

  if (Boolean(event.shiftKey) !== tokens.includes('shift')) return false
  if (Boolean(event.altKey) !== tokens.includes('alt')) return false
  if (Boolean(event.metaKey) !== wantsMeta) return false
  if (Boolean(event.ctrlKey) !== wantsCtrl) return false

  return normalizeShortcutKey(event.key) === keyToken
}

function activeSearchKey(): string {
  return JSON.stringify({
    query: trimmedSearch.value,
    type: typeChip.value,
    sourceApp: sourceAppFilter.value,
    datePreset: datePreset.value,
    customFrom: customFrom.value,
    customTo: customTo.value
  })
}

const isSearchActive = computed(() => {
  const q = trimmedSearch.value
  return (
    q.length > 0 ||
    typeChip.value !== 'all' ||
    sourceAppFilter.value !== null ||
    datePreset.value !== 'all'
  )
})

const showSearchBanner = computed(() => {
  return hasRemoteSearchQuery.value || sourceAppFilter.value !== null || datePreset.value !== 'all'
})

const filterActiveCount = computed(() => {
  let count = 0
  if (sourceAppFilter.value !== null) count += 1
  if (datePreset.value !== 'all') count += 1
  return count
})

const multiSelectActive = computed(() => selectedIds.value.length > 1)

function activeDateFilterLabel(): string {
  switch (datePreset.value) {
    case 'today':
      return '日期：今天'
    case 'week':
      return '日期：本周'
    case 'custom':
      if (customFrom.value && customTo.value) return `日期：${customFrom.value} → ${customTo.value}`
      if (customFrom.value) return `日期：${customFrom.value} 之后`
      if (customTo.value) return `日期：${customTo.value} 之前`
      return '日期：自定义'
    default:
      return ''
  }
}

const searchSceneChips = computed(() => {
  const chips: Array<{ key: string; label: string }> = []

  if (trimmedSearch.value) {
    chips.push({ key: 'query', label: `关键词：${trimmedSearch.value}` })
  }

  if (typeChip.value !== 'all') {
    chips.push({
      key: 'type',
      label: `类型：${TYPE_OPTIONS.find((option) => option.value === typeChip.value)?.label ?? '全部'}`
    })
  }

  if (sourceAppFilter.value) {
    const appName =
      sourceApps.value.find((item) => item.source_app === sourceAppFilter.value)?.source_app_name ??
      sourceAppFilter.value
    chips.push({ key: 'source', label: `来源：${appName}` })
  }

  const dateLabel = activeDateFilterLabel()
  if (dateLabel) chips.push({ key: 'date', label: dateLabel })

  return chips
})

const searchSceneTitle = computed(() => {
  if (hasRemoteSearchQuery.value) return `搜索 “${trimmedSearch.value}”`
  if (isSearchActive.value) return '筛选结果'
  return '历史浏览'
})

const searchSceneSubtitle = computed(() => {
  if (searching.value) return '正在根据关键词与筛选条件检索剪贴板历史。'

  const count = visibleItems.value.length
  const countLabel = count === 0 ? '当前没有可见结果。' : `共 ${count} 项结果。`

  if (hasRemoteSearchQuery.value && searchSceneChips.value.length > 1) {
    return `${countLabel} 已叠加关键词与筛选条件。`
  }
  if (hasRemoteSearchQuery.value) {
    return `${countLabel} 正显示关键词匹配结果。`
  }
  if (isSearchActive.value) {
    return `${countLabel} 正显示当前筛选范围内的历史记录。`
  }
  return countLabel
})

const searchEmptyTitle = computed(() => {
  if (hasRemoteSearchQuery.value && searchSceneChips.value.length > 1) {
    return '没有符合当前搜索组合的结果'
  }
  if (hasRemoteSearchQuery.value) {
    return `没有找到 “${trimmedSearch.value}”`
  }
  if (isSearchActive.value) {
    return '当前筛选下没有条目'
  }
  return 'ClipMate 已就绪'
})

const searchEmptySubtitle = computed(() => {
  if (hasRemoteSearchQuery.value && searchSceneChips.value.length > 1) {
    return '试试清除部分筛选，或缩短关键词。'
  }
  if (hasRemoteSearchQuery.value) {
    return '试试更换关键词，或切换其他筛选范围。'
  }
  if (isSearchActive.value) {
    return '清除类型、来源或日期筛选后即可回到完整历史。'
  }
  return '复制内容后将自动显示在这里'
})

const selectionSummary = computed(() => {
  if (!multiSelectActive.value) return ''

  const selectedItems = visibleItems.value.filter((item) => selectedSet.value.has(item.id))
  const typeCount = new Set(selectedItems.map((item) => item.type)).size
  const typeSummary =
    typeCount > 1 ? '多种内容类型' : `${typeLabel(selectedItems[0]?.type ?? 'text')}条目`
  const stackSummary = pasteStackState.value.enabled
    ? '可直接加入当前 Paste Stack。'
    : '可一键加入 Paste Stack。'

  return `${typeSummary}，可批量复制、加入 Stack 或直接删除。${stackSummary}`
})

const toolbarStatus = computed<{
  kind: 'paused' | 'searching' | 'selection' | 'idle'
  label: string
} | null>(() => {
  if (paused.value) return { kind: 'paused', label: '已暂停收集' }
  if (searching.value) return { kind: 'searching', label: '搜索中' }
  if (selectedIds.value.length > 1) {
    return { kind: 'selection', label: `已选中 ${selectedIds.value.length} 项` }
  }
  return null
})

function itemMatchesActiveFilters(item: HistoryCardItem): boolean {
  const allowedTypes = typesForChip(typeChip.value)
  if (allowedTypes.length > 0 && !allowedTypes.includes(item.type)) return false

  if (sourceAppFilter.value !== null && item.source_app !== sourceAppFilter.value) return false

  const { dateFrom, dateTo } = resolveDateRange()
  if (dateFrom !== null && item.created_at < dateFrom) return false
  if (dateTo !== null && item.created_at > dateTo) return false

  return true
}

const filteredHistoryItems = computed(() => historyItems.value.filter(itemMatchesActiveFilters))

const visibleItems = computed(() => {
  if (!isSearchActive.value) return historyItems.value
  if (!hasRemoteSearchQuery.value) return filteredHistoryItems.value
  if (resolvedSearchKey.value === activeSearchKey() && searchResults.value !== null) {
    return searchResults.value
  }
  return filteredHistoryItems.value
})

const hasItems = computed(() => visibleItems.value.length > 0)

const virtualStartIndex = computed(() => {
  const start = Math.floor(cardsViewportScrollLeft.value / CARD_STRIDE) - CARD_OVERSCAN
  return Math.max(0, start)
})

const virtualEndIndex = computed(() => {
  const visibleCount = Math.ceil(cardsViewportWidth.value / CARD_STRIDE) + CARD_OVERSCAN * 2
  return Math.min(visibleItems.value.length, virtualStartIndex.value + Math.max(visibleCount, 8))
})

const virtualItems = computed(() =>
  visibleItems.value.slice(virtualStartIndex.value, virtualEndIndex.value)
)

const virtualCardEntries = computed(() =>
  virtualItems.value.map((item) => ({
    item,
    typeLabel: typeLabel(item.type),
    titleHtml: clipItemTitle(item) ? highlight(clipItemTitle(item)) : '',
    previewHtml: cardPreviewHtml(item),
    matchLines: cardSearchContextLines(item),
    appIconSrc: appIconSrc(item),
    appIconAlt: item.source_app_name || '应用图标',
    appInitial: appIconInitial(item),
    appName: item.source_app_name || '未知来源',
    timeLabel: formatRelativeTime(item.created_at),
    canEdit: canOpenPreviewEdit(item),
    active: activeCardId.value === item.id,
    selected: selectedSet.value.has(item.id),
    draggable: item.type === 'image'
  }))
)

const virtualTrackWidth = computed(() =>
  Math.max(visibleItems.value.length * CARD_STRIDE - CARD_GAP, CARD_WIDTH)
)

function typeChipIndex(value: TypeChip): number {
  const idx = TYPE_OPTIONS.findIndex((option) => option.value === value)
  return idx >= 0 ? idx : 0
}

function syncTypeFocus(value: TypeChip): void {
  typeFocusIndex.value = typeChipIndex(value)
}

function normalizeHeaderFocusIndex(index: number): number {
  return (index + HEADER_CONTROL_COUNT) % HEADER_CONTROL_COUNT
}

function focusHeaderControl(index: number): void {
  const nextIndex = normalizeHeaderFocusIndex(index)
  typeFocusIndex.value = nextIndex

  if (nextIndex === TYPE_OPTIONS.length) {
    toolbarRef.value?.focusSearch()
    return
  }

  toolbarRef.value?.focusChip(nextIndex)
}

function onChipFocus(index: number): void {
  typeFocusIndex.value = index
}

function onChipKeyDown(event: KeyboardEvent, index: number): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    focusHeaderControl(index + (event.shiftKey ? -1 : 1))
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    typeChip.value = TYPE_OPTIONS[index].value
    return
  }
}

function onSearchFieldFocus(): void {
  typeFocusIndex.value = TYPE_OPTIONS.length
}

function focusSearchInput(selectText = false): void {
  void nextTick(() => {
    toolbarRef.value?.focusSearch(selectText)
  })
}

function onSearchKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    focusHeaderControl(TYPE_OPTIONS.length + (event.shiftKey ? -1 : 1))
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (search.value.trim()) {
      search.value = ''
    }
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void runSearch()
  }
}

function setCardRef(itemId: string, el: unknown): void {
  const element =
    el instanceof HTMLElement
      ? el
      : typeof el === 'object' &&
          el !== null &&
          '$el' in el &&
          (el as { $el?: unknown }).$el instanceof HTMLElement
        ? ((el as { $el: HTMLElement }).$el ?? null)
        : null

  if (element instanceof HTMLElement) {
    cardRefs.set(itemId, element)
    return
  }
  cardRefs.delete(itemId)
}

function updateCardsViewportMetrics(): void {
  const container = historyCardsRef.value
  if (!container) return

  cardsViewportWidth.value = container.clientWidth
  cardsViewportScrollLeft.value = container.scrollLeft
}

function onCardsScroll(event: Event): void {
  const target = event.target as HTMLElement | null
  cardsViewportScrollLeft.value = target?.scrollLeft ?? 0
}

function scrollCardIntoView(itemId: string): void {
  const container = historyCardsRef.value
  if (!container) return

  const index = visibleItems.value.findIndex((item) => item.id === itemId)
  if (index < 0) return

  const leftInContainer = index * CARD_STRIDE
  const rightInContainer = leftInContainer + CARD_WIDTH
  const viewportLeft = container.scrollLeft
  const viewportRight = viewportLeft + container.clientWidth
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  let nextLeft = viewportLeft

  if (leftInContainer < viewportLeft) {
    nextLeft = leftInContainer
  } else if (rightInContainer > viewportRight) {
    nextLeft = rightInContainer - container.clientWidth
  } else {
    return
  }

  nextLeft = Math.max(0, Math.min(maxScrollLeft, nextLeft))

  container.scrollLeft = nextLeft
  cardsViewportScrollLeft.value = nextLeft
}

function scheduleScrollCardIntoView(itemId: string): void {
  if (activeCardScrollFrame !== null) {
    window.cancelAnimationFrame(activeCardScrollFrame)
    activeCardScrollFrame = null
  }

  activeCardScrollFrame = window.requestAnimationFrame(() => {
    activeCardScrollFrame = null
    scrollCardIntoView(itemId)
  })
}

function setActiveCard(itemId: string | null): void {
  activeCardId.value = itemId
}

function getActiveCardIndex(): number {
  if (visibleItems.value.length === 0) return -1
  const currentId =
    activeCardId.value ?? (selectedIds.value.length === 1 ? selectedIds.value[0] : hoveredId.value)
  if (!currentId) return -1
  return visibleItems.value.findIndex((item) => item.id === currentId)
}

function moveActiveCard(direction: -1 | 1): void {
  const items = visibleItems.value
  if (items.length === 0) return
  if (selectedIds.value.length > 0) {
    clearSelection()
  }

  const currentIndex = getActiveCardIndex()
  const nextIndex =
    currentIndex < 0
      ? direction > 0
        ? 0
        : items.length - 1
      : (currentIndex + direction + items.length) % items.length
  const nextId = items[nextIndex].id
  setActiveCard(nextId)
}

async function confirmActiveCard(): Promise<void> {
  const items = visibleItems.value
  if (items.length === 0) return
  const item =
    items.find((entry) => entry.id === activeCardId.value) ??
    (selectedIds.value.length === 1
      ? (items.find((entry) => entry.id === selectedIds.value[0]) ?? null)
      : null)
  if (!item) return
  await pasteHistoryItem(item)
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  return `${day} 天前`
}

function typeLabel(type: HistoryCardItem['type']): string {
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

function clipItemTitle(item: HistoryCardItem): string {
  return item.title?.trim() ?? ''
}

function previewSourceText(item: HistoryCardItem): string {
  if (item.type === 'image') return '图片'
  if (item.type === 'file') return item.file_label || item.content_preview || '文件'
  if (item.type === 'link') {
    return item.link_title || item.content_preview || item.link_url || ''
  }
  return item.content_preview || item.plain_text_preview || ''
}

function previewText(item: HistoryCardItem): string {
  return previewSourceText(item).slice(0, 80)
}

function includesSearchQuery(text: string | null | undefined): boolean {
  const needle = trimmedSearch.value.toLowerCase()
  if (!needle) return false
  return (text ?? '').toLowerCase().includes(needle)
}

function searchSnippet(text: string, radius = 44): string {
  const source = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!source) return ''

  const needle = trimmedSearch.value.toLowerCase()
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

function cardPreviewHtml(item: HistoryCardItem): string {
  const source = hasRemoteSearchQuery.value
    ? searchSnippet(previewSourceText(item), 52)
    : previewText(item)
  return highlight(source)
}

function cardSearchContextLines(
  item: HistoryCardItem
): Array<{ key: string; label: string; html: string }> {
  if (!hasRemoteSearchQuery.value) return []

  const lines: Array<{ key: string; label: string; html: string }> = []
  const primarySource = previewSourceText(item)

  if (item.ocr_text_preview && includesSearchQuery(item.ocr_text_preview)) {
    lines.push({
      key: `${item.id}:ocr`,
      label: 'OCR',
      html: highlight(searchSnippet(item.ocr_text_preview, 36))
    })
  }

  if (item.link_description && includesSearchQuery(item.link_description)) {
    lines.push({
      key: `${item.id}:meta-description`,
      label: '描述',
      html: highlight(searchSnippet(item.link_description, 36))
    })
  }

  if (
    item.type === 'link' &&
    item.link_url &&
    item.link_url !== primarySource &&
    includesSearchQuery(item.link_url)
  ) {
    lines.push({
      key: `${item.id}:url`,
      label: 'URL',
      html: highlight(searchSnippet(item.link_url, 32))
    })
  }

  return lines.slice(0, 2)
}

function appIconKey(target: AppIconTarget): string {
  return `${target.bundleId ?? ''}|${target.name ?? ''}`
}

function appIconKeyForItem(item: HistoryCardItem): string {
  return appIconKey(appIconTargetForItem(item))
}

function appIconTargetForItem(item: HistoryCardItem): AppIconTarget {
  return {
    bundleId: item.source_app,
    name: item.source_app_name
  }
}

function appIconSrc(item: HistoryCardItem): string | null {
  const key = appIconKeyForItem(item)
  if (appIconFailures.value[key]) return null
  const src = appIcons.value[key]
  return typeof src === 'string' && src.startsWith('data:image/') ? src : null
}

function appIconInitial(item: HistoryCardItem): string {
  const label = (item.source_app_name || item.source_app || 'App').trim()
  return (label.charAt(0) || 'A').toUpperCase()
}

function markAppIconFailed(item: HistoryCardItem): void {
  const key = appIconKeyForItem(item)
  if (appIconFailures.value[key]) return
  appIconFailures.value = {
    ...appIconFailures.value,
    [key]: true
  }
}

async function ensureVisibleAppIcons(items: HistoryCardItem[]): Promise<void> {
  const missingTargets = new Map<string, AppIconTarget>()
  for (const item of items) {
    const target = appIconTargetForItem(item)
    if (!target.bundleId && !target.name) continue
    const key = appIconKeyForItem(item)
    if (key in appIcons.value || key in appIconFailures.value) continue
    missingTargets.set(key, target)
  }

  if (missingTargets.size === 0) return

  try {
    const result = await window.api.getAppIcons(Array.from(missingTargets.values()))
    appIcons.value = {
      ...appIcons.value,
      ...result
    }
  } catch {
    appIcons.value = {
      ...appIcons.value,
      ...Object.fromEntries(Array.from(missingTargets.keys()).map((key) => [key, null]))
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function highlight(text: string): string {
  const q = search.value.trim()
  if (!q) return escapeHtml(text)

  const source = text ?? ''
  const lower = source.toLowerCase()
  const needle = q.toLowerCase()
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
    out += `<mark>${escapeHtml(source.slice(idx, idx + q.length))}</mark>`
    i = idx + q.length
  }
  return out
}
function canOpenPreviewEdit(item: HistoryCardItem): boolean {
  return item.type === 'text' || item.type === 'richtext' || item.type === 'link'
}

async function refreshHistoryItems(): Promise<void> {
  historyItems.value = await window.api.getClipItems(200, 0)
}

async function refreshSourceApps(): Promise<void> {
  sourceApps.value = await window.api.getSourceApps()
}

function sortHistoryItems(items: HistoryCardItem[]): HistoryCardItem[] {
  return [...items].sort((left, right) => {
    if (right.created_at !== left.created_at) {
      return right.created_at - left.created_at
    }
    return right.updated_at - left.updated_at
  })
}

function upsertHistoryItems(items: HistoryCardItem[]): void {
  if (items.length === 0) return
  const next = new Map(historyItems.value.map((item) => [item.id, item]))
  for (const item of items) {
    next.set(item.id, item)
  }
  historyItems.value = sortHistoryItems(Array.from(next.values()))
}

function removeHistoryItems(ids: string[]): void {
  if (ids.length === 0) return
  const removed = new Set(ids)
  historyItems.value = historyItems.value.filter((item) => !removed.has(item.id))
  searchResults.value = searchResults.value?.filter((item) => !removed.has(item.id)) ?? null
  selectedIds.value = selectedIds.value.filter((id) => !removed.has(id))
  if (anchorId.value && removed.has(anchorId.value)) {
    anchorId.value = null
  }
  if (ctxItem.value && removed.has(ctxItem.value.id)) {
    closeAllMenus()
  }
}

function recordPanelPerformanceMark(mark: PanelPerformanceMark): void {
  panelPerformanceMarks.value = [...panelPerformanceMarks.value.slice(-11), mark]
  console.debug('[panel-performance]', mark.name, mark)
}

function applyHistoryMutation(mutation: HistoryMutationEvent): void {
  switch (mutation.type) {
    case 'reset':
      historyItems.value = sortHistoryItems(mutation.items ?? [])
      if (mutation.sourceApps) {
        sourceApps.value = mutation.sourceApps
      }
      break
    case 'upsert':
      upsertHistoryItems(mutation.items ?? [])
      if (mutation.sourceApps) {
        sourceApps.value = mutation.sourceApps
      }
      break
    case 'delete':
      removeHistoryItems(mutation.ids ?? [])
      if (mutation.sourceApps) {
        sourceApps.value = mutation.sourceApps
      }
      break
    case 'source-apps':
      if (mutation.sourceApps) {
        sourceApps.value = mutation.sourceApps
      }
      break
  }

  if (hasRemoteSearchQuery.value) {
    void runSearch()
  }
}

async function refreshSummaryById(id: string): Promise<void> {
  const [item, apps] = await Promise.all([
    window.api.getClipItemSummary(id),
    window.api.getSourceApps()
  ])
  if (!item) return
  applyHistoryMutation({
    type: 'upsert',
    reason: 'update',
    items: [item],
    sourceApps: apps
  })
}

async function refreshVisibleState(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([
      refreshState(),
      refreshPasteStack(),
      refreshSourceApps(),
      refreshHistoryItems()
    ])
  } finally {
    loading.value = false
  }
  if (!isSearchActive.value) {
    await nextTick()
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  }
}

function applyPanelSnapshot(snapshot: PanelSnapshot, resetUi = true): void {
  paused.value = snapshot.paused
  historyItems.value = sortHistoryItems(snapshot.historyItems)
  sourceApps.value = snapshot.sourceApps
  pasteStackState.value = snapshot.pasteStackState
  if (!resetUi) return
  search.value = ''
  typeChip.value = 'all'
  syncTypeFocus('all')
  activeCardId.value = null
  sourceAppFilter.value = null
  datePreset.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  searchResults.value = null
  resetTransientPanelState()
  void nextTick(() => {
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  })
}

async function refreshPasteStack(): Promise<void> {
  pasteStackState.value = await window.api.getPasteStackState()
}

async function togglePasteStackUi(): Promise<void> {
  closeAllMenus()
  await window.api.setPasteStackEnabled(!pasteStackState.value.enabled)
  await refreshPasteStack()
}

function startOfDayTs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function endOfDayTs(date: Date): number {
  return startOfDayTs(date) + 24 * 60 * 60 * 1000 - 1
}

function getWeekStartTs(date: Date): number {
  const day = date.getDay()
  const diff = day === 0 ? 6 : day - 1
  const d = new Date(date)
  d.setDate(date.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function typesForChip(chip: TypeChip): Array<HistoryCardItem['type']> {
  if (chip === 'all') return []
  if (chip === 'text') return ['text', 'richtext']
  if (chip === 'image') return ['image']
  if (chip === 'link') return ['link']
  if (chip === 'file') return ['file']
  if (chip === 'color') return ['color']
  return []
}

function resolveDateRange(): { dateFrom: number | null; dateTo: number | null } {
  const now = new Date()
  let dateFrom: number | null = null
  let dateTo: number | null = null

  if (datePreset.value === 'today') {
    dateFrom = startOfDayTs(now)
    dateTo = Date.now()
  }

  if (datePreset.value === 'week') {
    dateFrom = getWeekStartTs(now)
    dateTo = Date.now()
  }

  if (datePreset.value === 'custom') {
    if (customFrom.value) {
      const d = new Date(customFrom.value)
      dateFrom = startOfDayTs(d)
    }
    if (customTo.value) {
      const d = new Date(customTo.value)
      dateTo = endOfDayTs(d)
    }
  }

  return { dateFrom, dateTo }
}

function buildSearchFilters(): SearchFilters {
  const { dateFrom, dateTo } = resolveDateRange()

  return {
    query: trimmedSearch.value,
    types: typesForChip(typeChip.value),
    sourceApp: sourceAppFilter.value,
    dateFrom,
    dateTo,
    limit: 200,
    offset: 0
  }
}

let searchSeq = 0
let searchTimer: number | null = null

function clearSearchTimer(): void {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
}

function resetRemoteSearchState(): void {
  searchSeq += 1
  clearSearchTimer()
  searching.value = false
  searchResults.value = null
  resolvedSearchKey.value = null
}

function scheduleSearch(): void {
  clearSearchTimer()
  searchTimer = window.setTimeout(() => {
    searchTimer = null
    void runSearch()
  }, 180)
}

async function runSearch(): Promise<void> {
  if (!hasRemoteSearchQuery.value) {
    resetRemoteSearchState()
    return
  }

  const requestKey = activeSearchKey()
  const seq = ++searchSeq
  searching.value = true
  try {
    const results = await window.api.searchClipItems(buildSearchFilters())
    if (seq !== searchSeq) return
    searchResults.value = results
    resolvedSearchKey.value = requestKey
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

async function refreshState(): Promise<void> {
  const state = await window.api.getClipboardState()
  paused.value = state.paused
}

function closeAllMenus(): void {
  moreOpen.value = false
  filtersOpen.value = false
  ctxOpen.value = false
  ctxItem.value = null
}

function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === 'Process' || event.keyCode === 229
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
    toastTimer = null
  }, 1800)
}

function clearSearchQuery(): void {
  search.value = ''
  focusSearchInput(true)
}

function clearAllFilters(): void {
  typeChip.value = 'all'
  syncTypeFocus('all')
  sourceAppFilter.value = null
  datePreset.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  filtersOpen.value = false
}

function exitSearchScene(): void {
  clearSearchQuery()
  clearAllFilters()
}

function clearSelection(): void {
  selectedIds.value = []
  anchorId.value = null
}

async function copySelectionAsText(): Promise<void> {
  if (selectedIds.value.length === 0) return
  const copied = await window.api.copyClipItemsAsText(selectedIds.value)
  showToast(copied > 0 ? `已复制 ${copied} 项文本内容` : '所选条目没有可复制的文本内容')
}

async function enqueueSelectionToPasteStack(): Promise<void> {
  if (selectedIds.value.length === 0) return
  const added = await window.api.enqueuePasteStackItems(selectedIds.value)
  await refreshPasteStack()
  showToast(added > 0 ? `已加入 Paste Stack（${added} 项）` : '未加入任何条目')
}

function resetTransientPanelState(): void {
  closeAllMenus()
  clearSelection()
  activeCardId.value = null
  closeCreateDialog()
}

function dismissMainPanel(): void {
  resetTransientPanelState()
  window.api.hideWindow()
}

function toggleSelection(itemId: string): void {
  const list = [...selectedIds.value]
  const idx = list.indexOf(itemId)
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    list.push(itemId)
  }
  selectedIds.value = list
  anchorId.value = itemId
}

function selectOnly(itemId: string): void {
  selectedIds.value = [itemId]
  anchorId.value = itemId
  activeCardId.value = itemId
}

function selectRange(toId: string): void {
  const items = visibleItems.value
  const fromId = anchorId.value ?? toId
  const from = items.findIndex((i) => i.id === fromId)
  const to = items.findIndex((i) => i.id === toId)
  if (from < 0 || to < 0) {
    selectOnly(toId)
    return
  }
  const [start, end] = from < to ? [from, to] : [to, from]
  selectedIds.value = items.slice(start, end + 1).map((i) => i.id)
}

async function pasteHistoryItem(item: HistoryCardItem): Promise<void> {
  selectOnly(item.id)
  await window.api.pasteClipItem(item.id)
}

function onItemClick(ev: MouseEvent, item: HistoryCardItem): void {
  if (ev.shiftKey) {
    selectRange(item.id)
    return
  }
  if (ev.metaKey || ev.ctrlKey) {
    toggleSelection(item.id)
    return
  }
  selectOnly(item.id)
}

function onItemDoubleClick(ev: MouseEvent, item: HistoryCardItem): void {
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey || ev.altKey) return
  void pasteHistoryItem(item)
}

function onItemMouseEnter(item: HistoryCardItem): void {
  hoveredId.value = item.id
}

function onItemMouseLeave(item: HistoryCardItem): void {
  if (hoveredId.value === item.id) hoveredId.value = null
}

function openClipContextMenu(ev: MouseEvent, item: HistoryCardItem): void {
  ev.preventDefault()
  setActiveCard(item.id)
  ctxItem.value = item
  ctxX.value = ev.clientX
  ctxY.value = ev.clientY
  ctxOpen.value = true
  moreOpen.value = false
}

async function openPreviewById(itemId: string, mode: 'view' | 'edit' = 'view'): Promise<void> {
  setActiveCard(itemId)
  closeAllMenus()
  window.api.showPreview(itemId, { mode })
}

async function openEditPreviewById(itemId: string): Promise<void> {
  await openPreviewById(itemId, 'edit')
}

function onItemDragStart(event: DragEvent, item: HistoryCardItem): void {
  if (item.type !== 'image') {
    event.preventDefault()
    return
  }

  event.dataTransfer?.setData('text/plain', item.id)
  window.api.startImageDrag(item.id)
}

function openCreateDialog(type: 'text' | 'link' = 'text'): void {
  closeAllMenus()
  createOpen.value = true
  createType.value = type
  createTitle.value = ''
  createContent.value = ''
}

function closeCreateDialog(): void {
  createOpen.value = false
  createTitle.value = ''
  createContent.value = ''
}

async function saveCreatedItem(): Promise<void> {
  const content = createContent.value.trim()
  if (!content) {
    showToast('请输入内容')
    return
  }

  const id = await window.api.createClipItem({
    type: createType.value,
    title: createTitle.value || null,
    content
  })

  await refreshSummaryById(id)
  setActiveCard(id)
  closeCreateDialog()
  showToast(createType.value === 'link' ? '已创建链接条目' : '已创建文本条目')
}

async function previewFromContext(): Promise<void> {
  const item = ctxItem.value
  if (!item) return
  closeAllMenus()
  await openPreviewById(item.id)
}

async function editFromContext(): Promise<void> {
  const item = ctxItem.value
  if (!item || !canOpenPreviewEdit(item)) return
  closeAllMenus()
  await openEditPreviewById(item.id)
}

async function bulkDelete(): Promise<void> {
  if (selectedIds.value.length === 0) return
  const ok = window.confirm(`确定删除选中的 ${selectedIds.value.length} 项？`)
  if (!ok) return
  await window.api.deleteClipItems(selectedIds.value)
  clearSelection()
  showToast('已删除所选条目')
}

async function runClipAction(action: ClipMenuAction): Promise<void> {
  const item = ctxItem.value
  if (!item) return

  if (action === 'delete') {
    await window.api.deleteClipItem(item.id)
  }

  closeAllMenus()
}

async function togglePaused(): Promise<void> {
  await window.api.setClipboardPaused(!paused.value)
}

async function clearHistory(): Promise<void> {
  await window.api.clearHistory()
  closeAllMenus()
}

function openSettings(): void {
  window.api.showSettings()
  closeAllMenus()
}

function openAbout(): void {
  window.api.showSettings({ tab: 'about' })
  closeAllMenus()
}

let unsubHistoryMutation: (() => void) | null = null
let unsubState: (() => void) | null = null
let unsubStack: (() => void) | null = null
let unsubPanelPreparing: (() => void) | null = null
let unsubPreparePanel: (() => void) | null = null
let unsubPanelPerformance: (() => void) | null = null
let unsubSettings: (() => void) | null = null
let panelPreparingTimer: number | null = null
let currentPanelRequestId: number | null = null
let lastAppliedPanelRequestId: number | null = null

function clearPanelPreparingTimer(): void {
  if (panelPreparingTimer !== null) {
    window.clearTimeout(panelPreparingTimer)
    panelPreparingTimer = null
  }
}

watch(search, () => {
  clearSelection()
  if (!hasRemoteSearchQuery.value) {
    resetRemoteSearchState()
    return
  }
  scheduleSearch()
  void nextTick(() => {
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  })
})

watch([typeChip, sourceAppFilter, datePreset, customFrom, customTo], () => {
  clearSelection()
  if (!hasRemoteSearchQuery.value) {
    resetRemoteSearchState()
  } else {
    void runSearch()
  }
  void nextTick(() => {
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  })
})

watch(typeChip, (value) => {
  syncTypeFocus(value)
})

watch(
  visibleItems,
  (items) => {
    if (items.length === 0) {
      activeCardId.value = null
    } else if (!activeCardId.value || !items.some((item) => item.id === activeCardId.value)) {
      activeCardId.value = items[0].id
    }
    void ensureVisibleAppIcons(items)
  },
  { immediate: true }
)

watch(
  activeCardId,
  (itemId) => {
    if (!itemId) return
    scheduleScrollCardIntoView(itemId)
  },
  { flush: 'post' }
)

function onWindowContextMenu(e: MouseEvent): void {
  if (!(e.target as HTMLElement | null)?.closest?.('.card')) {
    closeAllMenus()
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || Boolean(el.isContentEditable)
}

function getPreviewCandidateId(): string | null {
  if (selectedIds.value.length === 1) return selectedIds.value[0]
  if (activeCardId.value) return activeCardId.value
  if (hoveredId.value) return hoveredId.value
  return visibleItems.value[0]?.id ?? null
}

function onWindowKeyDown(e: KeyboardEvent): void {
  if (isComposingEvent(e)) {
    return
  }

  const typing = isTypingTarget(e.target)
  const shortcuts = appSettings.value?.shortcuts

  if (e.key === 'Escape') {
    e.preventDefault()
    dismissMainPanel()
    return
  }

  if (shortcuts?.focusSearch && matchesAccelerator(e, shortcuts.focusSearch)) {
    e.preventDefault()
    focusSearchInput(true)
    return
  }

  if (shortcuts?.newTextItem && matchesAccelerator(e, shortcuts.newTextItem)) {
    e.preventDefault()
    openCreateDialog('text')
    return
  }

  if (shortcuts?.newLinkItem && matchesAccelerator(e, shortcuts.newLinkItem)) {
    e.preventDefault()
    openCreateDialog('link')
    return
  }

  if (typing) return

  if (!filtersOpen.value && !moreOpen.value && !ctxOpen.value) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      // 如果焦点在 header 控件上，先 blur 防止浏览器将焦点元素滚入视图导致 chips 偏移
      const focused = document.activeElement as HTMLElement | null
      if (focused?.closest('.panel-toolbar')) {
        focused.blur()
      }
      moveActiveCard(e.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void confirmActiveCard()
      return
    }
  }

  if (e.key === ' ') {
    const id = getPreviewCandidateId()
    if (id) {
      e.preventDefault()
      void openPreviewById(id)
    }
  }

  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.value.length > 0) {
    e.preventDefault()
    void bulkDelete()
  }
}

function onWindowFocus(): void {
  if (isSettingsRoute.value) return
  void Promise.all([refreshState(), refreshPasteStack()])
}

function onWindowResize(): void {
  updateCardsViewportMetrics()
}

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange)
  if (isSettingsRoute.value || isPreviewRoute.value || isStackDockRoute.value) {
    return
  }

  const settingsSnapshot = await window.api.getSettingsSnapshot()
  appSettings.value = settingsSnapshot.settings
  applyTheme(settingsSnapshot.settings.general.theme)
  unsubSettings = window.api.onSettingsChanged((snapshot: SettingsSnapshot) => {
    appSettings.value = snapshot.settings
    applyTheme(snapshot.settings.general.theme)
  })

  syncTypeFocus(typeChip.value)
  unsubPanelPreparing = window.api.onPanelPreparing(async (requestId) => {
    currentPanelRequestId = requestId
    panelPreparing.value = false
    clearPanelPreparingTimer()
    resetTransientPanelState()
    panelPreparingTimer = window.setTimeout(() => {
      if (currentPanelRequestId !== requestId) return
      if (!hasItems.value && !loading.value) {
        panelPreparing.value = true
      }
    }, 160)
  })
  unsubPreparePanel = window.api.onPreparePanelShow(async (requestId, snapshot) => {
    if (currentPanelRequestId !== null && requestId < currentPanelRequestId) return
    currentPanelRequestId = requestId
    clearPanelPreparingTimer()
    panelPreparing.value = false
    applyPanelSnapshot(snapshot, lastAppliedPanelRequestId !== requestId)
    lastAppliedPanelRequestId = requestId
  })
  unsubHistoryMutation = window.api.onHistoryMutation((mutation) => {
    applyHistoryMutation(mutation)
  })
  unsubPanelPerformance = window.api.onPanelPerformanceMark((mark) => {
    recordPanelPerformanceMark(mark)
  })
  unsubState = window.api.onClipStateChanged((state) => {
    paused.value = state.paused
  })
  unsubStack = window.api.onPasteStackChanged(() => {
    void refreshPasteStack()
  })

  await refreshVisibleState()
  await nextTick()
  updateCardsViewportMetrics()

  window.addEventListener('click', closeAllMenus)
  window.addEventListener('contextmenu', onWindowContextMenu)
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  unsubSettings?.()
  unsubPanelPreparing?.()
  unsubPreparePanel?.()
  unsubHistoryMutation?.()
  unsubPanelPerformance?.()
  unsubState?.()
  unsubStack?.()
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('click', closeAllMenus)
  window.removeEventListener('contextmenu', onWindowContextMenu)
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('resize', onWindowResize)
  clearPanelPreparingTimer()
  if (activeCardScrollFrame !== null) {
    window.cancelAnimationFrame(activeCardScrollFrame)
    activeCardScrollFrame = null
  }
  if (toastTimer) window.clearTimeout(toastTimer)
  if (searchTimer) window.clearTimeout(searchTimer)
})
</script>

<template>
  <SettingsView v-if="isSettingsRoute" />
  <PreviewView v-else-if="isPreviewRoute" />
  <StackDockView v-else-if="isStackDockRoute" />
  <div v-else class="app">
    <PanelToolbar
      ref="toolbarRef"
      :type-options="TYPE_OPTIONS"
      :type-value="typeChip"
      :focused-index="typeFocusIndex"
      :search-value="search"
      :search-busy="searching"
      :status="toolbarStatus"
      :filter-active-count="filterActiveCount"
      :filters-open="filtersOpen"
      :more-open="moreOpen"
      @update:type-value="typeChip = $event as TypeChip"
      @update:search-value="search = $event"
      @chip-focus="onChipFocus"
      @chip-keydown="onChipKeyDown"
      @search-focus="onSearchFieldFocus"
      @search-keydown="onSearchKeyDown"
      @toggle-filters="filtersOpen = !filtersOpen"
      @toggle-more="moreOpen = !moreOpen"
    >
      <template #filter-popover>
        <PanelFilterPopover
          v-if="filtersOpen"
          :source-apps="sourceApps"
          :source-app-filter="sourceAppFilter"
          :date-preset="datePreset"
          :custom-from="customFrom"
          :custom-to="customTo"
          @update:source-app-filter="sourceAppFilter = $event"
          @update:date-preset="datePreset = $event"
          @update:custom-from="customFrom = $event"
          @update:custom-to="customTo = $event"
        />
      </template>

      <template #more-popover>
        <PanelMoreMenu
          v-if="moreOpen"
          :paused="paused"
          :paste-stack-enabled="pasteStackState.enabled"
          @settings="openSettings()"
          @about="openAbout()"
          @toggle-paused="togglePaused()"
          @toggle-paste-stack="togglePasteStackUi()"
          @clear-history="clearHistory()"
        />
      </template>
    </PanelToolbar>

    <main class="app-content">
      <div class="layout">
        <section class="main-panel">
          <div v-if="showSearchBanner || multiSelectActive" class="panel-scene-stack">
            <FeedbackBanner
              v-if="showSearchBanner"
              tone="accent"
              compact
              :title="searchSceneTitle"
              :message="searchSceneSubtitle"
            >
              <div class="panel-search-scene__chips">
                <StatusPill
                  v-for="chip in searchSceneChips"
                  :key="chip.key"
                  :label="chip.label"
                  tone="accent"
                />
              </div>

              <template #actions>
                <InlineActionGroup align="end" compact>
                  <button
                    v-if="trimmedSearch"
                    class="ghost-btn compact"
                    @click="clearSearchQuery()"
                  >
                    清除关键词
                  </button>
                  <button
                    v-if="typeChip !== 'all' || sourceAppFilter || datePreset !== 'all'"
                    class="ghost-btn compact"
                    @click="clearAllFilters()"
                  >
                    清除筛选
                  </button>
                  <button class="secondary-btn compact" @click="exitSearchScene()">退出搜索</button>
                </InlineActionGroup>
              </template>
            </FeedbackBanner>

            <FeedbackBanner
              v-if="multiSelectActive"
              tone="neutral"
              compact
              :title="`已选中 ${selectedIds.length} 项`"
              :message="selectionSummary"
            >
              <template #actions>
                <InlineActionGroup align="end" compact>
                  <button class="ghost-btn compact" @click="copySelectionAsText()">
                    复制为文本
                  </button>
                  <button class="ghost-btn compact" @click="enqueueSelectionToPasteStack()">
                    加入 Paste Stack
                  </button>
                  <button class="secondary-btn compact" @click="clearSelection()">取消选择</button>
                  <button class="danger-btn compact" @click="bulkDelete()">删除所选</button>
                </InlineActionGroup>
              </template>
            </FeedbackBanner>
          </div>

          <PanelStateView
            v-if="panelPreparing && !hasItems && !loading"
            mode="loading"
            title="正在同步最新剪贴板…"
            subtitle="内容准备好后会立即显示"
          />

          <div v-else-if="!hasItems && !loading && isSearchActive" class="panel-empty-state">
            <PanelStateView
              mode="empty"
              :title="searchEmptyTitle"
              :subtitle="searchEmptySubtitle"
            />
            <InlineActionGroup align="center" class="panel-empty-state__actions">
              <button v-if="trimmedSearch" class="ghost-btn" @click="clearSearchQuery()">
                清除关键词
              </button>
              <button
                v-if="typeChip !== 'all' || sourceAppFilter || datePreset !== 'all'"
                class="ghost-btn"
                @click="clearAllFilters()"
              >
                清除筛选
              </button>
              <button class="secondary-btn" @click="exitSearchScene()">返回浏览</button>
            </InlineActionGroup>
          </div>

          <PanelStateView
            v-else-if="!hasItems && !loading"
            mode="empty"
            title="ClipMate 已就绪"
            subtitle="复制内容后将自动显示在这里"
          />

          <div
            v-else
            ref="historyCardsRef"
            class="cards-viewport"
            :class="{ 'is-search-active': isSearchActive }"
            @scroll="onCardsScroll"
          >
            <div class="cards-track" :style="{ width: `${virtualTrackWidth}px` }">
              <ClipCard
                v-for="(entry, index) in virtualCardEntries"
                :key="entry.item.id"
                :ref="(el) => setCardRef(entry.item.id, el)"
                :data-card-id="entry.item.id"
                :item="entry.item"
                :type-label="entry.typeLabel"
                :title-html="entry.titleHtml"
                :preview-html="entry.previewHtml"
                :match-lines="entry.matchLines"
                :search-mode="isSearchActive"
                :app-icon-src="entry.appIconSrc"
                :app-icon-alt="entry.appIconAlt"
                :app-initial="entry.appInitial"
                :app-name="entry.appName"
                :time-label="entry.timeLabel"
                :can-edit="entry.canEdit"
                :active="entry.active"
                :selected="entry.selected"
                :draggable="entry.draggable"
                :style="{
                  transform: `translateX(${(virtualStartIndex + index) * CARD_STRIDE}px)`
                }"
                @mouseenter="onItemMouseEnter(entry.item)"
                @mouseleave="onItemMouseLeave(entry.item)"
                @click="onItemClick($event, entry.item)"
                @dblclick="onItemDoubleClick($event, entry.item)"
                @dragstart="onItemDragStart($event, entry.item)"
                @contextmenu="openClipContextMenu($event, entry.item)"
                @edit="openEditPreviewById(entry.item.id)"
                @icon-error="markAppIconFailed(entry.item)"
              />
            </div>
          </div>

          <ClipContextMenu
            v-if="ctxOpen"
            :x="ctxX"
            :y="ctxY"
            :can-edit="Boolean(ctxItem && canOpenPreviewEdit(ctxItem))"
            @preview="previewFromContext()"
            @edit="editFromContext()"
            @delete="runClipAction('delete')"
          />

          <ToastNotice v-if="toast" :message="toast" />
        </section>
      </div>
    </main>

    <ClipCreateDialog
      :open="createOpen"
      :create-type="createType"
      :title-value="createTitle"
      :content-value="createContent"
      :new-text-shortcut="appSettings?.shortcuts.newTextItem"
      :new-link-shortcut="appSettings?.shortcuts.newLinkItem"
      @close="closeCreateDialog()"
      @save="saveCreatedItem()"
      @update:create-type="createType = $event"
      @update:title-value="createTitle = $event"
      @update:content-value="createContent = $event"
    />
  </div>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg-primary);
}

.app-content {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 10px 18px 14px;
  -webkit-app-region: no-drag;
  position: relative;
}

.layout {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  position: relative;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  background: linear-gradient(180deg, var(--surface-panel-strong) 0%, var(--surface-panel) 100%);
  box-shadow: var(--shadow-section);
}

.panel-scene-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 0;
}

.panel-search-scene__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.panel-empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
}

.panel-empty-state__actions {
  justify-content: center;
}

.cards-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  padding: 10px 12px 14px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.cards-viewport.is-search-active {
  padding-top: 12px;
}

.cards-viewport::-webkit-scrollbar {
  display: none;
}

.cards-track {
  position: relative;
  min-height: 232px;
  padding: 0 2px 2px;
}
</style>
