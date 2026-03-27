<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PreviewView from './PreviewView.vue'
import SettingsView from './SettingsView.vue'
import StackDockView from './StackDockView.vue'
import UiIcon from './components/UiIcon.vue'
import PanelStateView from './components/panel/PanelStateView.vue'
import PanelToolbar from './components/panel/PanelToolbar.vue'
import ToastNotice from './components/panel/ToastNotice.vue'
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

const filterActiveCount = computed(() => {
  let count = 0
  if (sourceAppFilter.value !== null) count += 1
  if (datePreset.value !== 'all') count += 1
  return count
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

function imageSrc(item: HistoryCardItem): string | null {
  if (item.type !== 'image') return null
  return item.image_preview
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

function clearSelection(): void {
  selectedIds.value = []
  anchorId.value = null
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
        <div v-if="filtersOpen" class="filter-popover" @click.stop>
          <div class="filter-group">
            <div class="filter-label">来源应用</div>
            <select v-model="sourceAppFilter" class="filter-select">
              <option :value="null">全部应用</option>
              <option v-for="app in sourceApps" :key="app.source_app" :value="app.source_app">
                {{ app.source_app_name || app.source_app }} · {{ app.count }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <div class="filter-label">日期范围</div>
            <div class="preset-row">
              <button
                class="preset"
                :class="{ active: datePreset === 'all' }"
                @click="datePreset = 'all'"
              >
                不限
              </button>
              <button
                class="preset"
                :class="{ active: datePreset === 'today' }"
                @click="datePreset = 'today'"
              >
                今天
              </button>
              <button
                class="preset"
                :class="{ active: datePreset === 'week' }"
                @click="datePreset = 'week'"
              >
                本周
              </button>
              <button
                class="preset"
                :class="{ active: datePreset === 'custom' }"
                @click="datePreset = 'custom'"
              >
                自定义
              </button>
            </div>

            <div v-if="datePreset === 'custom'" class="custom-row">
              <input v-model="customFrom" type="date" class="date-input" />
              <span class="date-sep">–</span>
              <input v-model="customTo" type="date" class="date-input" />
            </div>
          </div>
        </div>
      </template>

      <template #more-popover>
        <div v-if="moreOpen" class="popover" @click.stop>
          <button class="menu-item" @click="openSettings()">
            <span class="menu-item-icon"><UiIcon name="settings" /></span>
            <span class="menu-item-label">打开设置</span>
          </button>
          <button class="menu-item" @click="openAbout()">
            <span class="menu-item-icon"><UiIcon name="info" /></span>
            <span class="menu-item-label">关于 ClipMate</span>
          </button>
          <div class="menu-sep"></div>
          <button class="menu-item" @click="togglePaused()">
            <span class="menu-item-icon">
              <UiIcon :name="paused ? 'play' : 'pause'" />
            </span>
            <span class="menu-item-label">{{ paused ? '恢复收集' : '暂停收集' }}</span>
          </button>
          <button class="menu-item" @click="togglePasteStackUi()">
            <span class="menu-item-icon"><UiIcon name="stack" /></span>
            <span class="menu-item-label">
              {{ pasteStackState.enabled ? '关闭 Paste Stack' : '启用 Paste Stack' }}
            </span>
          </button>
          <button class="menu-item" @click="clearHistory()">
            <span class="menu-item-icon"><UiIcon name="trash" /></span>
            <span class="menu-item-label">清空历史</span>
          </button>
        </div>
      </template>
    </PanelToolbar>

    <main class="app-content">
      <div class="layout">
        <section class="main-panel">
          <PanelStateView
            v-if="panelPreparing && !hasItems && !loading"
            mode="loading"
            title="正在同步最新剪贴板…"
            subtitle="内容准备好后会立即显示"
          />

          <PanelStateView
            v-else-if="!hasItems && !loading"
            mode="empty"
            :title="isSearchActive ? '没有匹配结果' : 'ClipMate 已就绪'"
            :subtitle="isSearchActive ? '试试更换关键词或筛选条件' : '复制内容后将自动显示在这里'"
          />

          <div v-else ref="historyCardsRef" class="cards-viewport" @scroll="onCardsScroll">
            <div class="cards-track" :style="{ width: `${virtualTrackWidth}px` }">
              <div
                v-for="(item, index) in virtualItems"
                :key="item.id"
                :ref="(el) => setCardRef(item.id, el)"
                class="card"
                :data-card-id="item.id"
                :draggable="item.type === 'image'"
                :style="{
                  transform: `translateX(${(virtualStartIndex + index) * CARD_STRIDE}px)`
                }"
                :class="{
                  active: activeCardId === item.id,
                  selected: selectedSet.has(item.id)
                }"
                @mouseenter="onItemMouseEnter(item)"
                @mouseleave="onItemMouseLeave(item)"
                @click="onItemClick($event, item)"
                @dblclick="onItemDoubleClick($event, item)"
                @dragstart="onItemDragStart($event, item)"
                @contextmenu="openClipContextMenu($event, item)"
              >
                <div class="card-top">
                  <div class="card-heading">
                    <div class="badge">{{ typeLabel(item.type) }}</div>
                    <div v-if="clipItemTitle(item)" class="card-title">
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <span v-html="highlight(clipItemTitle(item))"></span>
                    </div>
                  </div>
                  <div v-if="canOpenPreviewEdit(item)" class="card-tools">
                    <button class="card-tool-btn" @click.stop="openEditPreviewById(item.id)">
                      <UiIcon name="edit" :size="13" :stroke-width="2" />
                      <span>编辑</span>
                    </button>
                  </div>
                </div>

                <div class="card-body">
                  <template v-if="item.type === 'image'">
                    <div class="image-box">
                      <img v-if="imageSrc(item)" :src="imageSrc(item)!" alt="" />
                    </div>
                  </template>
                  <template v-else-if="item.type === 'color'">
                    <div
                      class="color-box"
                      :style="{ background: item.content_preview || '#000000' }"
                    >
                      <span class="color-text">{{ item.content_preview }}</span>
                    </div>
                  </template>
                  <template v-else>
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div class="text-preview" v-html="cardPreviewHtml(item)"></div>
                    <div v-if="cardSearchContextLines(item).length > 0" class="match-lines">
                      <div
                        v-for="line in cardSearchContextLines(item)"
                        :key="line.key"
                        class="match-line"
                      >
                        <span class="match-label">{{ line.label }}</span>
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <span class="match-value" v-html="line.html"></span>
                      </div>
                    </div>
                  </template>
                </div>

                <div class="card-footer">
                  <div class="app-pill">
                    <img
                      v-if="appIconSrc(item)"
                      class="app-icon"
                      :src="appIconSrc(item)!"
                      :alt="item.source_app_name || '应用图标'"
                      @error="markAppIconFailed(item)"
                    />
                    <span v-else class="app-dot">{{ appIconInitial(item) }}</span>
                    <div class="app-meta">
                      <div class="app-name">{{ item.source_app_name || '未知来源' }}</div>
                      <div class="time">{{ formatRelativeTime(item.created_at) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="ctxOpen"
            class="ctx-menu"
            :style="{ left: `${ctxX}px`, top: `${ctxY}px` }"
            @click.stop
          >
            <button class="menu-item" @click="previewFromContext()">
              <span class="menu-item-icon"><UiIcon name="preview" /></span>
              <span class="menu-item-label">预览</span>
            </button>
            <button
              v-if="ctxItem && canOpenPreviewEdit(ctxItem)"
              class="menu-item"
              @click="editFromContext()"
            >
              <span class="menu-item-icon"><UiIcon name="edit" /></span>
              <span class="menu-item-label">编辑</span>
            </button>
            <button class="menu-item danger" @click="runClipAction('delete')">
              <span class="menu-item-icon"><UiIcon name="trash" /></span>
              <span class="menu-item-label">删除</span>
            </button>
          </div>

          <ToastNotice v-if="toast" :message="toast" />
        </section>
      </div>
    </main>

    <div v-if="createOpen" class="preview-overlay" @click.self="closeCreateDialog()">
      <div class="create-window" @click.stop>
        <div class="preview-header">
          <div class="preview-left">
            <div class="badge">新建条目</div>
            <div class="preview-sub">无需先复制，可直接保存到历史记录</div>
          </div>
          <div class="preview-actions">
            <button class="icon-btn" title="关闭" @click="closeCreateDialog()">
              <UiIcon name="close" :size="18" :stroke-width="2" />
            </button>
          </div>
        </div>

        <div class="create-body">
          <div class="create-switch">
            <button
              class="preset"
              :class="{ active: createType === 'text' }"
              @click="createType = 'text'"
            >
              文本
            </button>
            <button
              class="preset"
              :class="{ active: createType === 'link' }"
              @click="createType = 'link'"
            >
              链接
            </button>
          </div>

          <input v-model="createTitle" class="rename-input" placeholder="名称（可选）" />
          <textarea
            v-model="createContent"
            class="edit-area"
            :placeholder="createType === 'link' ? 'https://example.com' : '输入文本内容...'"
          ></textarea>
        </div>

        <div class="preview-footer">
          <span class="hint">
            {{ appSettings?.shortcuts.newTextItem || '⌘N' }} 文本 ·
            {{ appSettings?.shortcuts.newLinkItem || '⌘⇧N' }} 链接
          </span>
          <button class="primary-btn" @click="saveCreatedItem()">保存条目</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.popover {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 8px;
  z-index: 30;
  -webkit-app-region: no-drag;
}

.app-content {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 8px 18px 14px;
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
}

.filter-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 10px;
  z-index: 40;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.filter-group + .filter-group {
  margin-top: 10px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.filter-select {
  width: 100%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.preset.active {
  background: rgba(0, 122, 255, 0.18);
  border-color: rgba(0, 122, 255, 0.28);
  color: var(--text-primary);
}

.custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-input {
  flex: 1;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 12px;
  outline: none;
}

.date-sep {
  color: var(--text-secondary);
  font-size: 12px;
}

.cards-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  padding: 8px 12px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.cards-viewport::-webkit-scrollbar {
  display: none;
}

.cards-track {
  position: relative;
  min-height: 232px;
  padding: 0 2px 2px;
}

.card {
  position: absolute;
  isolation: isolate;
  top: 0;
  width: 224px;
  min-width: 224px;
  height: 232px;
  min-height: 232px;
  max-height: 232px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-card) 96%, rgba(255, 255, 255, 0.26)) 0%,
    var(--bg-card) 100%
  );
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 32%);
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  box-shadow: inset 0 0 0 0 transparent;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    box-shadow 0.18s ease;
}

.card:hover {
  border-color: color-mix(in srgb, var(--border-color) 90%, rgba(255, 255, 255, 0.2));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.card:hover::before {
  opacity: 0.55;
}

.card.active {
  background: color-mix(in srgb, var(--bg-card) 88%, var(--accent-fill-strong));
  border-color: rgba(0, 122, 255, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 0 0 2px rgba(0, 122, 255, 0.24);
}

.card.active::before {
  opacity: 0.72;
}

.card.active::after {
  opacity: 0;
  box-shadow: none;
}

.card.selected {
  background: color-mix(in srgb, var(--bg-card) 92%, var(--accent-fill));
  border-color: rgba(0, 122, 255, 0.24);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 0 0 2px rgba(0, 122, 255, 0.14);
}

.card.selected::before {
  opacity: 0.58;
}

.card.selected::after {
  opacity: 0;
  box-shadow: none;
}

.card.active.selected {
  background: color-mix(in srgb, var(--bg-card) 86%, var(--accent-fill-strong));
  border-color: rgba(0, 122, 255, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 0 0 2px rgba(0, 122, 255, 0.3);
}

.card.active.selected::before {
  opacity: 0.8;
}

.card.active.selected::after {
  opacity: 0;
  box-shadow: none;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  min-width: 0;
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  width: 100%;
}

.card-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 4px 7px;
  font-size: 11px;
  cursor: pointer;
}

.card-tool-btn:hover,
.card-tool-btn.active {
  color: var(--text-primary);
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--bg-card) 88%, var(--accent-fill));
}

.card-title {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 7px;
  overflow: hidden;
}

.text-preview {
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  width: 100%;
}

.text-preview mark {
  background: rgba(0, 122, 255, 0.22);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.match-lines {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.match-line {
  display: flex;
  gap: 5px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.match-label {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.match-value {
  min-width: 0;
  flex: 1;
}

.match-value mark {
  background: rgba(0, 122, 255, 0.18);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.image-box {
  width: 100%;
  height: 116px;
  border-radius: var(--radius-card-inner);
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.color-box {
  width: 100%;
  height: 116px;
  border-radius: var(--radius-card-inner);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 7px;
  overflow: hidden;
}

.color-text {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.card-footer {
  display: flex;
  justify-content: flex-start;
  min-height: 34px;
}

.app-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.app-dot {
  width: 30px;
  height: 30px;
  border-radius: calc(var(--radius-card-inner) - 4px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 122, 255, 0.18);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  font-weight: 700;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.card.active .badge,
.card.selected .badge {
  background: color-mix(in srgb, var(--bg-surface) 84%, var(--accent-fill));
  border-color: color-mix(in srgb, var(--border-color) 72%, var(--accent-border));
  color: var(--text-primary);
}

.card.active .app-dot,
.card.selected .app-dot {
  background: color-mix(in srgb, var(--bg-surface) 78%, var(--accent-fill-strong));
  border-color: color-mix(in srgb, var(--border-color) 70%, var(--accent-border));
}

.app-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  object-fit: cover;
  flex-shrink: 0;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.app-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time {
  font-size: 11px;
  color: var(--text-secondary);
}

.ctx-menu {
  position: fixed;
  min-width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 8px;
  z-index: 50;
  transform: translateY(4px);
}

.menu-item {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  border-radius: 10px;
  padding: 10px 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.menu-item:hover {
  background: var(--bg-surface);
}

.menu-item.danger {
  color: var(--danger-color);
}

.menu-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  flex: 0 0 auto;
}

.menu-item-label {
  min-width: 0;
  flex: 1;
}

.menu-sep {
  height: 1px;
  background: var(--border-color);
  margin: 6px 6px;
}
</style>
