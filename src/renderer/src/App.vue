<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SettingsView from './SettingsView.vue'
import type {
  AppSettings,
  AppIconTarget,
  ClipItem,
  PanelSnapshot,
  PasteStackEntry,
  PasteStackState,
  SearchFilters,
  SettingsSnapshot,
  SourceAppSummary,
  ThemePreference
} from '../../shared/types'

type ClipMenuAction = 'paste' | 'copy' | 'pastePlain' | 'pasteFile' | 'delete'
type TypeChip = 'all' | 'text' | 'image' | 'link' | 'file' | 'color'
type DatePreset = 'all' | 'today' | 'week' | 'custom'
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
const appSettings = ref<AppSettings | null>(null)

const historyItems = ref<ClipItem[]>([])
const paused = ref(false)
const loading = ref(false)

const search = ref('')
const searchExpanded = ref(false)
const moreOpen = ref(false)
const filtersOpen = ref(false)
const typeChip = ref<TypeChip>('all')
const typeFocusIndex = ref(0)
const sourceApps = ref<SourceAppSummary[]>([])
const sourceAppFilter = ref<string | null>(null)
const datePreset = ref<DatePreset>('all')
const customFrom = ref('')
const customTo = ref('')

const searchResults = ref<ClipItem[] | null>(null)
const searching = ref(false)

const activeCardId = ref<string | null>(null)
const selectedIds = ref<string[]>([])
const anchorId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
const selectedSet = computed(() => new Set(selectedIds.value))

const previewOpen = ref(false)
const previewItem = ref<ClipItem | null>(null)
const previewLoading = ref(false)
const editMode = ref(false)
const editText = ref('')
const linkEditMode = ref(false)
const linkDraft = ref('')
const renameOpen = ref(false)
const renameDraft = ref('')
const colorDraft = ref('#007AFF')
const createOpen = ref(false)
const createType = ref<'text' | 'link'>('text')
const createTitle = ref('')
const createContent = ref('')

const panelMode = ref<'main' | 'stack'>('main')
const pasteStackState = ref<PasteStackState>({ enabled: false, entries: [] })
const stackDraggingId = ref<string | null>(null)

const toast = ref<string | null>(null)
let toastTimer: number | null = null
let activeCardScrollFrame: number | null = null

const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxItem = ref<ClipItem | null>(null)

const historyCardsRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchToggleRef = ref<HTMLButtonElement | null>(null)
const chipRailRef = ref<HTMLElement | null>(null)
const panelPreparing = ref(false)
const appIcons = ref<Record<string, string | null>>({})
const appIconFailures = ref<Record<string, true>>({})
const resolvedSearchKey = ref<string | null>(null)
const cardRefs = new Map<string, HTMLElement>()
const cardsViewportWidth = ref(0)
const cardsViewportScrollLeft = ref(0)

const CARD_WIDTH = 236
const CARD_GAP = 14
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

function itemMatchesActiveFilters(item: ClipItem): boolean {
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

const hasItems = computed(() => {
  if (panelMode.value === 'stack') {
    return pasteStackState.value.entries.length > 0
  }
  return visibleItems.value.length > 0
})

const virtualStartIndex = computed(() => {
  if (panelMode.value !== 'main') return 0
  const start = Math.floor(cardsViewportScrollLeft.value / CARD_STRIDE) - CARD_OVERSCAN
  return Math.max(0, start)
})

const virtualEndIndex = computed(() => {
  if (panelMode.value !== 'main') return visibleItems.value.length
  const visibleCount = Math.ceil(cardsViewportWidth.value / CARD_STRIDE) + CARD_OVERSCAN * 2
  return Math.min(visibleItems.value.length, virtualStartIndex.value + Math.max(visibleCount, 8))
})

const virtualItems = computed(() =>
  visibleItems.value.slice(virtualStartIndex.value, virtualEndIndex.value)
)

const virtualTrackWidth = computed(() =>
  Math.max(visibleItems.value.length * CARD_STRIDE - CARD_GAP, CARD_WIDTH)
)

const previewLinkMeta = computed(() => {
  const item = previewItem.value
  if (!item || item.type !== 'link' || !item.link_meta) return null
  try {
    const meta = JSON.parse(item.link_meta) as {
      title?: string
      description?: string
      image?: string
    }
    return meta
  } catch {
    return null
  }
})

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

function scrollFocusedHeaderControlIntoView(index = typeFocusIndex.value): void {
  if (index === TYPE_OPTIONS.length) return

  const rail = chipRailRef.value
  if (!rail) return
  const button = rail.querySelector<HTMLButtonElement>(`[data-chip-index="${index}"]`)
  button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function focusHeaderControl(index: number): void {
  const nextIndex = normalizeHeaderFocusIndex(index)
  typeFocusIndex.value = nextIndex

  if (nextIndex === TYPE_OPTIONS.length) {
    searchToggleRef.value?.focus({ preventScroll: true })
    scrollFocusedHeaderControlIntoView(nextIndex)
    return
  }

  const rail = chipRailRef.value
  if (!rail) return
  const button = rail.querySelector<HTMLButtonElement>(`[data-chip-index="${nextIndex}"]`)
  button?.focus({ preventScroll: true })
  scrollFocusedHeaderControlIntoView(nextIndex)
}

function onChipFocus(index: number): void {
  typeFocusIndex.value = index
}

function onChipClick(index: number): void {
  typeChip.value = TYPE_OPTIONS[index].value
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

function onSearchToggleFocus(): void {
  typeFocusIndex.value = TYPE_OPTIONS.length
}

function onSearchToggleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    focusHeaderControl(TYPE_OPTIONS.length + (event.shiftKey ? -1 : 1))
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    toggleSearch()
  }
}

function focusSearchInput(selectText = false): void {
  void nextTick(() => {
    searchInputRef.value?.focus()
    if (selectText) {
      searchInputRef.value?.select()
    }
  })
}

function toggleSearch(): void {
  if (!searchExpanded.value) {
    searchExpanded.value = true
    focusSearchInput()
    return
  }

  if (search.value.trim()) {
    focusSearchInput(true)
    return
  }

  searchExpanded.value = false
}

function collapseSearchIfIdle(): void {
  if (search.value.trim()) return
  searchExpanded.value = false
}

function onSearchKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (search.value.trim()) {
      search.value = ''
    } else {
      searchExpanded.value = false
    }
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
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
  if (!container || panelMode.value !== 'main') return

  const index = visibleItems.value.findIndex((item) => item.id === itemId)
  if (index < 0) return

  const leftInContainer = index * CARD_STRIDE
  const centeredLeft = leftInContainer - (container.clientWidth - CARD_WIDTH) / 2
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  const nextLeft = Math.max(0, Math.min(maxScrollLeft, centeredLeft))

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
  // 直接同步滚动，不走调度
  scrollCardIntoView(nextId)
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
  await onCardClick(item)
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

function typeLabel(type: ClipItem['type']): string {
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

function previewText(item: ClipItem): string {
  if (item.title) return item.title
  if (item.type === 'image') return '图片'
  if (item.type === 'file') {
    try {
      const parsed = JSON.parse(item.content) as { paths?: string[] }
      const name = parsed.paths?.[0]?.split('/').pop()
      return name || '文件'
    } catch {
      return item.plain_text || '文件'
    }
  }
  if (item.type === 'link' && item.link_meta) {
    try {
      const meta = JSON.parse(item.link_meta) as { title?: string }
      if (meta?.title) return meta.title
    } catch {
      // ignore
    }
  }
  return (item.plain_text || item.content || '').slice(0, 80)
}

function appIconKey(target: AppIconTarget): string {
  return `${target.bundleId ?? ''}|${target.name ?? ''}`
}

function appIconKeyForItem(item: ClipItem): string {
  return appIconKey(appIconTargetForItem(item))
}

function appIconTargetForItem(item: ClipItem): AppIconTarget {
  return {
    bundleId: item.source_app,
    name: item.source_app_name
  }
}

function appIconSrc(item: ClipItem): string | null {
  const key = appIconKeyForItem(item)
  if (appIconFailures.value[key]) return null
  const src = appIcons.value[key]
  return typeof src === 'string' && src.startsWith('data:image/') ? src : null
}

function appIconInitial(item: ClipItem): string {
  const label = (item.source_app_name || item.source_app || 'App').trim()
  return (label.charAt(0) || 'A').toUpperCase()
}

function markAppIconFailed(item: ClipItem): void {
  const key = appIconKeyForItem(item)
  if (appIconFailures.value[key]) return
  appIconFailures.value = {
    ...appIconFailures.value,
    [key]: true
  }
}

async function ensureVisibleAppIcons(items: ClipItem[]): Promise<void> {
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

function getFilePaths(item: ClipItem): string[] {
  if (item.type !== 'file') return []
  try {
    const parsed = JSON.parse(item.content) as { paths?: string[] }
    return parsed.paths ?? []
  } catch {
    return (item.plain_text ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
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

function imageSrc(item: ClipItem): string | null {
  if (item.type !== 'image') return null
  return `data:image/png;base64,${item.content}`
}

async function refreshHistoryItems(): Promise<void> {
  loading.value = true
  try {
    historyItems.value = await window.api.getClipItems(200, 0)
  } finally {
    loading.value = false
  }
}

async function refreshSourceApps(): Promise<void> {
  sourceApps.value = await window.api.getSourceApps()
}

async function refreshAfterMutation(): Promise<void> {
  await Promise.all([refreshSourceApps(), refreshHistoryItems()])
  if (isSearchActive.value) {
    await runSearch()
  }
}

async function refreshVisibleState(): Promise<void> {
  await Promise.all([refreshState(), refreshPasteStack(), refreshAfterMutation()])
  if (!isSearchActive.value && panelMode.value === 'main') {
    await nextTick()
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  }
}

function applyPanelSnapshot(snapshot: PanelSnapshot, resetUi = true): void {
  paused.value = snapshot.paused
  historyItems.value = snapshot.historyItems
  sourceApps.value = snapshot.sourceApps
  pasteStackState.value = snapshot.pasteStackState
  if (!resetUi) return
  panelMode.value = 'main'
  search.value = ''
  searchExpanded.value = false
  typeChip.value = 'all'
  syncTypeFocus('all')
  activeCardId.value = null
  sourceAppFilter.value = null
  datePreset.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  searchResults.value = null
  clearSelection()
  closeAllMenus()
  void nextTick(() => {
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  })
}

async function refreshPasteStack(): Promise<void> {
  pasteStackState.value = await window.api.getPasteStackState()
}

async function openPasteStack(): Promise<void> {
  closeAllMenus()
  panelMode.value = 'stack'
  await window.api.setPasteStackEnabled(true)
  await refreshPasteStack()
}

async function exitPasteStack(): Promise<void> {
  await window.api.setPasteStackEnabled(false)
  await refreshPasteStack()
  panelMode.value = 'main'
}

async function clearPasteStackEntries(): Promise<void> {
  await window.api.clearPasteStack()
  await refreshPasteStack()
}

async function removePasteStackEntryUi(entryId: string): Promise<void> {
  await window.api.removePasteStackEntry(entryId)
  await refreshPasteStack()
}

function stackEntryTitle(entry: PasteStackEntry): string {
  if (entry.item) return previewText(entry.item)
  return '(条目已删除)'
}

function onStackDragStart(ev: DragEvent, entryId: string): void {
  stackDraggingId.value = entryId
  ev.dataTransfer?.setData('text/plain', entryId)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}

async function onStackDrop(targetEntryId: string): Promise<void> {
  const fromId = stackDraggingId.value
  stackDraggingId.value = null
  if (!fromId || fromId === targetEntryId) return

  const entries = [...pasteStackState.value.entries]
  const from = entries.findIndex((e) => e.entry_id === fromId)
  const to = entries.findIndex((e) => e.entry_id === targetEntryId)
  if (from < 0 || to < 0) return

  const [moved] = entries.splice(from, 1)
  entries.splice(to, 0, moved)
  pasteStackState.value = { ...pasteStackState.value, entries }

  await window.api.reorderPasteStack(entries.map((e) => e.entry_id))
}

async function pasteStackNow(): Promise<void> {
  if (pasteStackState.value.entries.length === 0) return
  await window.api.pastePasteStack()
  await refreshPasteStack()
  showToast('已按顺序粘贴队列')
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

function typesForChip(chip: TypeChip): Array<ClipItem['type']> {
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

async function onCardClick(item: ClipItem): Promise<void> {
  setActiveCard(item.id)
  await window.api.pasteClipItem(item.id)
}

function onItemClick(ev: MouseEvent, item: ClipItem): void {
  if (ev.shiftKey) {
    selectRange(item.id)
    return
  }
  if (ev.metaKey || ev.ctrlKey) {
    toggleSelection(item.id)
    return
  }
  if (selectedIds.value.length > 0) {
    selectOnly(item.id)
    return
  }
  void onCardClick(item)
}

function onItemMouseEnter(item: ClipItem): void {
  hoveredId.value = item.id
}

function onItemMouseLeave(item: ClipItem): void {
  if (hoveredId.value === item.id) hoveredId.value = null
}

function openClipContextMenu(ev: MouseEvent, item: ClipItem): void {
  ev.preventDefault()
  setActiveCard(item.id)
  ctxItem.value = item
  ctxX.value = ev.clientX
  ctxY.value = ev.clientY
  ctxOpen.value = true
  moreOpen.value = false
}

async function openPreviewById(itemId: string): Promise<void> {
  previewLoading.value = true
  try {
    const item = await window.api.getClipItem(itemId)
    if (!item) return
    setActiveCard(item.id)
    previewItem.value = item
    previewOpen.value = true
    editMode.value = false
    linkEditMode.value = false
    editText.value = item.plain_text ?? item.content ?? ''
    linkDraft.value = item.content
    renameOpen.value = false
    renameDraft.value = item.title ?? ''
    if (item.type === 'color') {
      colorDraft.value = item.content
    }
  } finally {
    previewLoading.value = false
  }
}

function closePreview(): void {
  previewOpen.value = false
  previewItem.value = null
  editMode.value = false
  linkEditMode.value = false
  renameOpen.value = false
}

async function copyPreview(plainText = true): Promise<void> {
  if (!previewItem.value) return
  await window.api.copyClipItem(previewItem.value.id, { plainText })
  showToast('已复制')
}

async function pastePreview(plainText = false): Promise<void> {
  if (!previewItem.value) return
  await window.api.pasteClipItem(previewItem.value.id, { plainText })
  closePreview()
}

function toggleEdit(): void {
  if (!previewItem.value) return
  if (previewItem.value.type !== 'text' && previewItem.value.type !== 'richtext') return
  linkEditMode.value = false
  editMode.value = !editMode.value
  if (editMode.value) {
    editText.value = previewItem.value.plain_text ?? previewItem.value.content ?? ''
  }
}

function toggleLinkEdit(): void {
  if (!previewItem.value || previewItem.value.type !== 'link') return
  editMode.value = false
  linkEditMode.value = !linkEditMode.value
  if (linkEditMode.value) {
    linkDraft.value = previewItem.value.content
  }
}

function toggleRename(): void {
  if (!previewItem.value) return
  renameOpen.value = !renameOpen.value
  if (renameOpen.value) {
    renameDraft.value = previewItem.value.title ?? ''
  }
}

async function saveRename(): Promise<void> {
  if (!previewItem.value) return
  await window.api.updateClipItemTitle(previewItem.value.id, renameDraft.value || null)
  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(previewItem.value.id)
  renameOpen.value = false
  showToast('已保存名称')
}

async function saveTextEdit(): Promise<void> {
  if (!previewItem.value) return
  await window.api.updateClipItemText(previewItem.value.id, editText.value)
  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(previewItem.value.id)
  editMode.value = false
  showToast('已保存文本')
}

async function saveLinkEdit(): Promise<void> {
  if (!previewItem.value || previewItem.value.type !== 'link') return
  await window.api.updateClipItemLink(previewItem.value.id, linkDraft.value)
  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(previewItem.value.id)
  linkEditMode.value = false
  showToast('已更新链接')
}

async function saveColor(): Promise<void> {
  if (!previewItem.value) return
  await window.api.updateClipItemColor(previewItem.value.id, colorDraft.value)
  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(previewItem.value.id)
  showToast('已更新颜色')
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = dataUrl
  })
}

async function rotateImage(direction: 'left' | 'right'): Promise<void> {
  const item = previewItem.value
  if (!item || item.type !== 'image') return

  const img = await loadImage(`data:image/png;base64,${item.content}`)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = img.height
  canvas.height = img.width

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(direction === 'right' ? Math.PI / 2 : -Math.PI / 2)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)

  const rotatedDataUrl = canvas.toDataURL('image/png')
  const contentBase64 = dataUrlToBase64(rotatedDataUrl)

  const thumbCanvas = document.createElement('canvas')
  const thumbCtx = thumbCanvas.getContext('2d')
  if (!thumbCtx) return
  const thumbWidth = 320
  const scale = thumbWidth / canvas.width
  thumbCanvas.width = thumbWidth
  thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale))
  thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
  const thumbnailBase64 = dataUrlToBase64(thumbCanvas.toDataURL('image/png'))

  await window.api.updateClipItemImage(item.id, { contentBase64, thumbnailBase64 })
  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(item.id)
  showToast('已旋转图片')
}

async function extractOcr(mode: 'copy' | 'create'): Promise<void> {
  const item = previewItem.value
  if (!item || item.type !== 'image') return

  const result = await window.api.extractImageOcr(item.id, mode)
  if (!result.text) {
    showToast('OCR 结果尚未就绪')
    return
  }

  await refreshAfterMutation()
  previewItem.value = await window.api.getClipItem(item.id)
  showToast(mode === 'copy' ? '已复制 OCR 文字' : '已创建文本条目')
}

async function quickLook(path: string): Promise<void> {
  await window.api.quickLookFile(path)
}

async function pasteImageAsFile(id: string): Promise<void> {
  await window.api.pasteClipItemAsFile(id)
  closePreview()
}

function onItemDragStart(event: DragEvent, item: ClipItem): void {
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

  await refreshAfterMutation()
  setActiveCard(id)
  closeCreateDialog()
  showToast(createType.value === 'link' ? '已创建链接条目' : '已创建文本条目')
}

async function renameFromContext(): Promise<void> {
  const item = ctxItem.value
  if (!item) return
  const next = window.prompt('重命名条目', item.title || '')?.trim()
  if (next === undefined) return
  await window.api.updateClipItemTitle(item.id, next || null)
  await refreshAfterMutation()
  closeAllMenus()
}

async function shareFromContext(): Promise<void> {
  const item = ctxItem.value
  if (!item) return
  await window.api.copyClipItem(item.id, { plainText: true })
  showToast('已复制到剪贴板，可粘贴分享')
  closeAllMenus()
}

async function previewFromContext(): Promise<void> {
  const item = ctxItem.value
  if (!item) return
  closeAllMenus()
  await openPreviewById(item.id)
}

async function deleteFromPreview(): Promise<void> {
  const item = previewItem.value
  if (!item) return
  const ok = window.confirm('确定删除该条目？')
  if (!ok) return
  await window.api.deleteClipItem(item.id)
  await refreshAfterMutation()
  closePreview()
  showToast('已删除条目')
}

async function bulkDelete(): Promise<void> {
  if (selectedIds.value.length === 0) return
  const ok = window.confirm(`确定删除选中的 ${selectedIds.value.length} 项？`)
  if (!ok) return
  await window.api.deleteClipItems(selectedIds.value)
  await refreshAfterMutation()
  clearSelection()
  showToast('已删除所选条目')
}

async function runClipAction(action: ClipMenuAction): Promise<void> {
  const item = ctxItem.value
  if (!item) return

  if (action === 'paste') {
    await window.api.pasteClipItem(item.id)
  }
  if (action === 'copy') {
    await window.api.copyClipItem(item.id)
  }
  if (action === 'pastePlain') {
    await window.api.pasteClipItem(item.id, { plainText: true })
  }
  if (action === 'pasteFile' && item.type === 'image') {
    await window.api.pasteClipItemAsFile(item.id)
  }
  if (action === 'delete') {
    await window.api.deleteClipItem(item.id)
    await refreshAfterMutation()
  }

  closeAllMenus()
}

async function togglePaused(): Promise<void> {
  await window.api.setClipboardPaused(!paused.value)
}

async function clearHistory(): Promise<void> {
  await window.api.clearHistory()
  await refreshAfterMutation()
  closeAllMenus()
}

function openSettings(): void {
  window.api.showSettings()
  closeAllMenus()
}

function quitApp(): void {
  window.api.quitApp()
}

let unsubItems: (() => void) | null = null
let unsubState: (() => void) | null = null
let unsubStack: (() => void) | null = null
let unsubPanelPreparing: (() => void) | null = null
let unsubPreparePanel: (() => void) | null = null
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
})

watch([typeChip, sourceAppFilter, datePreset, customFrom, customTo], () => {
  clearSelection()
  if (!hasRemoteSearchQuery.value) {
    resetRemoteSearchState()
    return
  }
  void runSearch()
})

watch(typeChip, (value) => {
  syncTypeFocus(value)
})

watch([historyItems, typeChip], async () => {
  if (!isSearchActive.value && panelMode.value === 'main') {
    await nextTick()
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateCardsViewportMetrics()
  }
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
  if (
    !(e.target as HTMLElement | null)?.closest?.('.card') &&
    !(e.target as HTMLElement | null)?.closest?.('.stack-row')
  ) {
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
  if (panelMode.value === 'stack') {
    return pasteStackState.value.entries[0]?.item_id ?? null
  }
  if (selectedIds.value.length === 1) return selectedIds.value[0]
  if (activeCardId.value) return activeCardId.value
  if (hoveredId.value) return hoveredId.value
  return visibleItems.value[0]?.id ?? null
}

function onWindowKeyDown(e: KeyboardEvent): void {
  const typing = isTypingTarget(e.target)
  const shortcuts = appSettings.value?.shortcuts

  if (shortcuts?.focusSearch && matchesAccelerator(e, shortcuts.focusSearch)) {
    e.preventDefault()
    searchExpanded.value = true
    focusSearchInput(true)
    return
  }

  if (shortcuts?.newItem && matchesAccelerator(e, shortcuts.newItem)) {
    e.preventDefault()
    openCreateDialog('text')
    return
  }

  if (createOpen.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeCreateDialog()
    }
    return
  }

  if (previewOpen.value) {
    if (e.key === 'Escape' || e.key === ' ') {
      e.preventDefault()
      closePreview()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      if (editMode.value) {
        e.preventDefault()
        void saveTextEdit()
      } else if (linkEditMode.value) {
        e.preventDefault()
        void saveLinkEdit()
      }
      return
    }

    if (!typing && e.key === 'Enter' && previewItem.value) {
      e.preventDefault()
      void pastePreview(false)
    }

    return
  }

  if (typing) return

  if (panelMode.value === 'stack') {
    if (e.key === 'Escape') {
      e.preventDefault()
      void exitPasteStack()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void pasteStackNow()
      return
    }
  }

  if (panelMode.value === 'main' && !filtersOpen.value && !moreOpen.value && !ctxOpen.value) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      // 如果焦点在 header 控件上，先 blur 防止浏览器将焦点元素滚入视图导致 chips 偏移
      const focused = document.activeElement as HTMLElement | null
      if (focused && chipRailRef.value?.contains(focused)) {
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

  if (e.key === 'Escape') {
    if (selectedIds.value.length > 0) {
      e.preventDefault()
      clearSelection()
    }
    closeAllMenus()
  }

  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.value.length > 0) {
    e.preventDefault()
    void bulkDelete()
  }
}

function onWindowFocus(): void {
  if (isSettingsRoute.value) return
  void refreshVisibleState()
}

function onWindowResize(): void {
  updateCardsViewportMetrics()
}

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange)
  const settingsSnapshot = await window.api.getSettingsSnapshot()
  appSettings.value = settingsSnapshot.settings
  applyTheme(settingsSnapshot.settings.general.theme)
  unsubSettings = window.api.onSettingsChanged((snapshot: SettingsSnapshot) => {
    appSettings.value = snapshot.settings
    applyTheme(snapshot.settings.general.theme)
  })

  if (isSettingsRoute.value) {
    return
  }

  syncTypeFocus(typeChip.value)
  unsubPanelPreparing = window.api.onPanelPreparing(async (requestId) => {
    currentPanelRequestId = requestId
    panelPreparing.value = false
    clearPanelPreparingTimer()
    clearSelection()
    closeAllMenus()
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
  unsubItems = window.api.onClipItemsChanged(async () => {
    await refreshAfterMutation()
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
  unsubItems?.()
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
  <div v-else class="app">
    <header class="app-header">
      <div class="header-placeholder" aria-hidden="true"></div>

      <div class="header-center" @click.stop>
        <div ref="chipRailRef" class="header-controls">
          <div class="chips">
            <button
              v-for="(option, index) in TYPE_OPTIONS"
              :key="option.value"
              class="chip"
              :tabindex="typeFocusIndex === index ? 0 : -1"
              :data-chip-index="index"
              :class="{
                active: typeChip === option.value,
                focused: typeFocusIndex === index
              }"
              @click="onChipClick(index)"
              @focus="onChipFocus(index)"
              @keydown="onChipKeyDown($event, index)"
            >
              {{ option.label }}
            </button>
          </div>

          <div
            class="search-shell"
            :class="{ open: searchExpanded, focused: typeFocusIndex === TYPE_OPTIONS.length }"
          >
            <button
              ref="searchToggleRef"
              class="search-toggle"
              title="搜索"
              :tabindex="typeFocusIndex === TYPE_OPTIONS.length ? 0 : -1"
              @click.stop="toggleSearch()"
              @focus="onSearchToggleFocus"
              @keydown="onSearchToggleKeyDown"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </button>
            <input
              v-if="searchExpanded"
              ref="searchInputRef"
              v-model="search"
              type="text"
              placeholder="搜索剪贴板..."
              class="search-input compact"
              @blur="collapseSearchIfIdle()"
              @keydown="onSearchKeyDown"
            />
          </div>
        </div>
      </div>

      <div class="header-actions">
        <div class="action-anchor">
          <button class="filter-btn" @click.stop="filtersOpen = !filtersOpen">
            {{ searching ? '搜索中…' : '筛选' }}
          </button>

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
        </div>

        <div class="action-anchor">
          <button class="more-btn" title="更多" @click.stop="moreOpen = !moreOpen">···</button>

          <div v-if="moreOpen" class="popover" @click.stop>
            <button class="menu-item" @click="openCreateDialog('text')">＋ 新建文本</button>
            <button class="menu-item" @click="openCreateDialog('link')">↗ 新建链接</button>
            <div class="menu-sep"></div>
            <button class="menu-item" @click="openSettings()">⚙ 打开设置</button>
            <button class="menu-item" @click="togglePaused()">
              {{ paused ? '▶︎ 恢复收集' : '⏸ 暂停收集' }}
            </button>
            <button class="menu-item" @click="openPasteStack()">
              📦 Paste Stack {{ pasteStackState.enabled ? '· ON' : '' }}
            </button>
            <button class="menu-item" @click="clearHistory()">🗑 清空历史</button>
            <div class="menu-sep"></div>
            <button class="menu-item danger" @click="quitApp()">⏻ 退出</button>
          </div>
        </div>
      </div>
    </header>

    <main class="app-content">
      <div class="layout">
        <section class="main-panel" :class="{ 'with-selection-bar': selectedIds.length > 0 }">
          <template v-if="panelMode === 'stack'">
            <div class="stack-header">
              <div class="stack-title">
                <span class="stack-icon">⧉</span>
                <span>Paste Stack</span>
                <span class="stack-badge" :class="{ on: pasteStackState.enabled }">
                  {{ pasteStackState.enabled ? 'ON' : 'OFF' }}
                </span>
              </div>
              <div class="stack-actions">
                <button class="sel-btn danger" @click="exitPasteStack()">退出</button>
                <button class="sel-btn" @click="clearPasteStackEntries()">清空</button>
                <button
                  class="sel-btn"
                  :disabled="pasteStackState.entries.length === 0"
                  @click="pasteStackNow()"
                >
                  开始粘贴
                </button>
              </div>
            </div>

            <div class="stack-hint">复制会持续追加到队列，按顺序逐条自动粘贴。</div>

            <div v-if="pasteStackState.entries.length === 0" class="empty-state">
              <p>队列为空</p>
              <p class="empty-hint">打开 Stack 后，复制内容将自动入队</p>
            </div>

            <div v-else class="stack-list">
              <div
                v-for="(entry, index) in pasteStackState.entries"
                :key="entry.entry_id"
                class="stack-row"
                draggable="true"
                @dragstart="onStackDragStart($event, entry.entry_id)"
                @dragover.prevent
                @drop.prevent="onStackDrop(entry.entry_id)"
                @click="entry.item && openPreviewById(entry.item_id)"
              >
                <div class="stack-index">{{ index + 1 }}</div>
                <div class="stack-body">
                  <div class="stack-text">{{ stackEntryTitle(entry) }}</div>
                  <div class="stack-sub">
                    {{ entry.item?.source_app_name || '' }}
                  </div>
                </div>
                <button
                  class="stack-remove"
                  title="移除"
                  @click.stop="removePasteStackEntryUi(entry.entry_id)"
                >
                  ×
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-if="paused" class="banner">已暂停收集（Pause Paste）</div>

            <div v-if="panelPreparing && !hasItems && !loading" class="loading-state">
              <div class="loading-spinner"></div>
              <div class="loading-title">正在同步最新剪贴板…</div>
              <div class="loading-sub">内容准备好后会立即显示</div>
            </div>

            <div v-else-if="!hasItems && !loading" class="empty-state">
              <p>{{ isSearchActive ? '没有匹配结果' : 'ClipMate 已就绪' }}</p>
              <p class="empty-hint">
                {{ isSearchActive ? '试试更换关键词或筛选条件' : '复制内容后将自动显示在这里' }}
              </p>
            </div>

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
                  @dragstart="onItemDragStart($event, item)"
                  @contextmenu="openClipContextMenu($event, item)"
                >
                  <div class="card-top">
                    <div class="badge">{{ typeLabel(item.type) }}</div>
                  </div>

                  <div class="card-body">
                    <template v-if="item.type === 'image'">
                      <div class="image-box">
                        <img v-if="imageSrc(item)" :src="imageSrc(item)!" alt="" />
                      </div>
                    </template>
                    <template v-else-if="item.type === 'color'">
                      <div class="color-box" :style="{ background: item.content }">
                        <span class="color-text">{{ item.content }}</span>
                      </div>
                    </template>
                    <template v-else>
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <div class="text-preview" v-html="highlight(previewText(item))"></div>
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
          </template>

          <div
            v-if="ctxOpen"
            class="ctx-menu"
            :style="{ left: `${ctxX}px`, top: `${ctxY}px` }"
            @click.stop
          >
            <button class="menu-item" @click="previewFromContext()">👁 预览</button>
            <button class="menu-item" @click="runClipAction('paste')">📋 直接粘贴</button>
            <button class="menu-item" @click="runClipAction('copy')">📄 复制</button>
            <button class="menu-item" @click="runClipAction('pastePlain')">Tt 粘贴为纯文本</button>
            <button
              v-if="ctxItem?.type === 'image'"
              class="menu-item"
              @click="runClipAction('pasteFile')"
            >
              ⤴︎ 粘贴为文件
            </button>
            <button class="menu-item" @click="renameFromContext()">🏷 重命名</button>
            <button class="menu-item" @click="shareFromContext()">🔗 分享</button>
            <div class="menu-sep"></div>
            <button class="menu-item danger" @click="runClipAction('delete')">🗑 删除</button>
          </div>

          <div v-if="selectedIds.length > 0" class="selection-bar" @click.stop>
            <div class="sel-count">{{ selectedIds.length }} 项已选择</div>
            <div class="sel-actions">
              <button class="sel-btn danger" @click="bulkDelete()">🗑 删除</button>
              <button class="sel-btn" @click="clearSelection()">取消</button>
            </div>
          </div>

          <div v-if="toast" class="toast" @click.stop>{{ toast }}</div>
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
            <button class="icon-btn" title="关闭" @click="closeCreateDialog()">✕</button>
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
          <span class="hint">{{ appSettings?.shortcuts.newItem || '⌘N' }} 新建</span>
          <button class="primary-btn" @click="saveCreatedItem()">保存条目</button>
        </div>
      </div>
    </div>

    <div v-if="previewOpen" class="preview-overlay" @click.self="closePreview">
      <div class="preview-window" @click.stop>
        <div class="preview-header">
          <div class="preview-left">
            <div class="badge">
              {{ previewItem ? typeLabel(previewItem.type) : '预览' }}
            </div>
            <div class="preview-sub">
              {{
                previewItem
                  ? `${previewItem.source_app_name || '未知来源'} · ${formatRelativeTime(
                      previewItem.created_at
                    )}`
                  : ''
              }}
            </div>
          </div>

          <div class="preview-actions">
            <button class="icon-btn" title="复制" @click="copyPreview(true)">📄</button>
            <button class="icon-btn" title="粘贴" @click="pastePreview(false)">📋</button>
            <button
              v-if="previewItem && (previewItem.type === 'text' || previewItem.type === 'richtext')"
              class="icon-btn"
              :class="{ active: editMode }"
              title="编辑"
              @click="toggleEdit()"
            >
              ✏️
            </button>
            <button v-if="editMode" class="icon-btn" title="保存" @click="saveTextEdit()">
              💾
            </button>
            <button
              v-if="previewItem?.type === 'link'"
              class="icon-btn"
              :class="{ active: linkEditMode }"
              title="编辑链接"
              @click="toggleLinkEdit()"
            >
              🔗
            </button>
            <button v-if="linkEditMode" class="icon-btn" title="保存链接" @click="saveLinkEdit()">
              💾
            </button>
            <button
              class="icon-btn"
              :class="{ active: renameOpen }"
              title="重命名"
              @click="toggleRename()"
            >
              🏷
            </button>
            <button class="icon-btn danger" title="删除" @click="deleteFromPreview()">🗑</button>
            <button class="icon-btn" title="关闭" @click="closePreview()">✕</button>
          </div>
        </div>

        <div class="preview-body">
          <div v-if="previewLoading" class="preview-loading">加载中…</div>

          <template v-else-if="previewItem">
            <div v-if="renameOpen" class="rename-row">
              <input v-model="renameDraft" class="rename-input" placeholder="名称（可选）" />
              <button class="primary-btn" @click="saveRename()">保存</button>
            </div>

            <template v-if="previewItem.type === 'text' || previewItem.type === 'richtext'">
              <textarea v-if="editMode" v-model="editText" class="edit-area"></textarea>
              <pre v-else class="preview-text">{{
                previewItem.plain_text || previewItem.content
              }}</pre>
            </template>

            <template v-else-if="previewItem.type === 'link'">
              <div v-if="linkEditMode" class="rename-row">
                <input v-model="linkDraft" class="rename-input" placeholder="https://example.com" />
                <button class="primary-btn" @click="saveLinkEdit()">保存链接</button>
              </div>
              <div v-if="previewLinkMeta" class="link-meta-card">
                <img
                  v-if="previewLinkMeta.image"
                  class="link-thumb"
                  :src="previewLinkMeta.image"
                  alt=""
                />
                <div class="link-meta-text">
                  <div class="link-title">{{ previewLinkMeta.title || previewItem.content }}</div>
                  <div v-if="previewLinkMeta.description" class="link-desc">
                    {{ previewLinkMeta.description }}
                  </div>
                </div>
              </div>
              <webview class="webview" :src="previewItem.content"></webview>
            </template>

            <template v-else-if="previewItem.type === 'image'">
              <div class="image-preview-lg">
                <img
                  :src="`data:image/png;base64,${previewItem.content}`"
                  alt=""
                  draggable="true"
                  @dragstart="onItemDragStart($event, previewItem)"
                />
              </div>
              <div class="image-tools">
                <button class="tool-btn" @click="rotateImage('left')">⟲</button>
                <button class="tool-btn" @click="rotateImage('right')">⟳</button>
                <button class="tool-btn" @click="pasteImageAsFile(previewItem.id)">文件粘贴</button>
              </div>
              <div class="ocr-card">
                <div class="ocr-head">
                  <span>OCR 识别</span>
                  <span class="hint">{{ previewItem.ocr_text ? '已完成' : '识别中…' }}</span>
                </div>
                <pre v-if="previewItem.ocr_text" class="ocr-text">{{ previewItem.ocr_text }}</pre>
                <div v-else class="ocr-empty">后台识别完成后会显示在这里</div>
                <div class="ocr-actions">
                  <button
                    class="primary-btn"
                    :disabled="!previewItem.ocr_text"
                    @click="extractOcr('copy')"
                  >
                    复制文字
                  </button>
                  <button
                    class="tool-btn"
                    :disabled="!previewItem.ocr_text"
                    @click="extractOcr('create')"
                  >
                    转为文本条目
                  </button>
                </div>
              </div>
            </template>

            <template v-else-if="previewItem.type === 'color'">
              <div class="color-preview-lg" :style="{ background: colorDraft }">
                <div class="color-value">{{ colorDraft }}</div>
              </div>
              <div class="color-tools">
                <input v-model="colorDraft" type="color" class="color-input" />
                <button class="primary-btn" @click="saveColor()">保存</button>
              </div>
            </template>

            <template v-else-if="previewItem.type === 'file'">
              <div class="file-list">
                <div v-for="p in getFilePaths(previewItem)" :key="p" class="file-row">
                  <span>{{ p }}</span>
                  <button class="tool-btn small" @click="quickLook(p)">Quick Look</button>
                </div>
              </div>
            </template>
          </template>
        </div>

        <div class="preview-footer">
          <span class="hint">空格 / ESC 关闭</span>
          <span v-if="editMode || linkEditMode" class="hint">⌘S 保存</span>
          <span class="hint">回车直接粘贴</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
:root {
  --bg-primary: rgba(245, 245, 247, 0.92);
  --bg-surface: rgba(255, 255, 255, 0.85);
  --bg-card: rgba(255, 255, 255, 0.9);
  --text-primary: #1d1d1f;
  --text-secondary: rgba(0, 0, 0, 0.55);
  --border-color: rgba(0, 0, 0, 0.1);
  --shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  --accent-color: #007aff;
  --accent-fill: rgba(0, 122, 255, 0.1);
  --accent-fill-strong: rgba(0, 122, 255, 0.16);
  --accent-border: rgba(0, 122, 255, 0.24);
  --accent-border-strong: rgba(0, 122, 255, 0.46);
  --danger-color: #ff3b30;
  --radius-pill: 999px;
  --radius-card: 18px;
  --radius-card-inner: 14px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg-primary: rgba(245, 245, 247, 0.92);
    --bg-surface: rgba(255, 255, 255, 0.85);
    --bg-card: rgba(255, 255, 255, 0.9);
    --text-primary: #1d1d1f;
    --text-secondary: rgba(0, 0, 0, 0.55);
    --border-color: rgba(0, 0, 0, 0.1);
    --shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: rgba(20, 20, 22, 0.92);
    --bg-surface: rgba(40, 40, 43, 0.75);
    --bg-card: rgba(34, 34, 37, 0.92);
    --text-primary: rgba(255, 255, 255, 0.92);
    --text-secondary: rgba(255, 255, 255, 0.6);
    --border-color: rgba(255, 255, 255, 0.12);
    --shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  }
}

:root[data-theme='light'] {
  --bg-primary: rgba(245, 245, 247, 0.92);
  --bg-surface: rgba(255, 255, 255, 0.85);
  --bg-card: rgba(255, 255, 255, 0.9);
  --text-primary: #1d1d1f;
  --text-secondary: rgba(0, 0, 0, 0.55);
  --border-color: rgba(0, 0, 0, 0.1);
  --shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
}

:root[data-theme='dark'] {
  --bg-primary: rgba(20, 20, 22, 0.92);
  --bg-surface: rgba(40, 40, 43, 0.75);
  --bg-card: rgba(34, 34, 37, 0.92);
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --border-color: rgba(255, 255, 255, 0.12);
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  user-select: none;
  -webkit-app-region: no-drag;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.app-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 14px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: no-drag;
  position: relative;
}

.header-placeholder {
  min-width: 0;
}

.header-center {
  justify-self: center;
  max-width: min(72vw, 900px);
  min-width: 0;
  overflow: visible;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 4px 0;
  overflow: visible;
}

.header-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-anchor {
  position: relative;
  display: flex;
  align-items: center;
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  max-width: min(58vw, 720px);
  padding: 4px;
  margin: -4px;
  scroll-behavior: smooth;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  position: relative;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.chip:hover {
  background: color-mix(in srgb, var(--bg-card) 92%, white 8%);
  border-color: color-mix(in srgb, var(--border-color) 82%, var(--accent-border));
  color: var(--text-primary);
}

.chip.active {
  background: color-mix(in srgb, var(--bg-card) 88%, var(--accent-fill-strong));
  border-color: var(--accent-border);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.1);
}

.chip.focused {
  background: color-mix(in srgb, var(--bg-card) 84%, var(--accent-fill));
  border-color: var(--accent-border-strong);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.18);
}

.chip.active.focused {
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.24);
}

.search-shell {
  display: flex;
  align-items: center;
  width: 38px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transition:
    width 0.2s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.search-shell.open {
  width: 224px;
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--bg-card) 90%, var(--accent-fill));
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.1);
}

.search-shell.focused {
  border-color: var(--accent-border-strong);
  background: color-mix(in srgb, var(--bg-card) 86%, var(--accent-fill));
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.18);
}

.search-shell.open.focused {
  box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.24);
}

.search-toggle {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.search-toggle:hover {
  color: var(--text-primary);
}

.search-toggle svg {
  width: 15px;
  height: 15px;
}

.search-input {
  width: 100%;
  padding: 0 12px 0 2px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-input.compact {
  height: 36px;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.more-btn {
  -webkit-app-region: no-drag;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 10px;
}

.more-btn:hover {
  background: var(--bg-card);
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
  padding: 14px 18px 22px;
  -webkit-app-region: no-drag;
  position: relative;
}

.banner {
  align-self: flex-start;
  margin-bottom: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-primary);
  background: rgba(255, 149, 0, 0.2);
  border: 1px solid rgba(255, 149, 0, 0.35);
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

.main-panel.with-selection-bar {
  padding-bottom: 62px;
}

.filter-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.filter-btn:hover {
  background: var(--bg-card);
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

.empty-state {
  text-align: center;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-state p {
  font-size: 15px;
  color: var(--text-secondary);
}

.empty-hint {
  margin-top: 4px;
  font-size: 12px !important;
}

.loading-state {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  animation: spin 0.8s linear infinite;
}

.loading-title {
  font-size: 15px;
  color: var(--text-primary);
}

.loading-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.cards-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  padding: 14px 14px 22px;
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
  min-height: 254px;
  padding: 0 2px 6px;
}

.card {
  position: absolute;
  isolation: isolate;
  top: 0;
  width: 236px;
  min-width: 236px;
  height: 248px;
  min-height: 248px;
  max-height: 248px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-card) 96%, rgba(255, 255, 255, 0.26)) 0%,
    var(--bg-card) 100%
  );
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  font-size: 12px;
  color: var(--text-secondary);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: hidden;
}

.text-preview {
  font-size: 14px;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 7;
  -webkit-box-orient: vertical;
}

.text-preview mark {
  background: rgba(0, 122, 255, 0.22);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.image-box {
  width: 100%;
  height: 136px;
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
  height: 136px;
  border-radius: var(--radius-card-inner);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 10px;
  overflow: hidden;
}

.color-text {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.card-footer {
  display: flex;
  justify-content: flex-start;
  min-height: 40px;
}

.app-pill {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-dot {
  width: 34px;
  height: 34px;
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
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  object-fit: cover;
  flex-shrink: 0;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-name {
  font-size: 13px;
  color: var(--text-primary);
}

.time {
  font-size: 12px;
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

.menu-sep {
  height: 1px;
  background: var(--border-color);
  margin: 6px 6px;
}

.toast {
  position: absolute;
  left: 12px;
  bottom: 64px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow);
  font-size: 13px;
  color: var(--text-primary);
  z-index: 20;
  max-width: 520px;
}

.selection-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.03);
  backdrop-filter: blur(18px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  z-index: 15;
}

@media (prefers-color-scheme: dark) {
  .selection-bar {
    background: rgba(255, 255, 255, 0.04);
  }
}

.sel-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.sel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.sel-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
}

.sel-btn:hover {
  background: var(--bg-surface);
}

.sel-btn.danger {
  color: var(--danger-color);
}

.stack-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.stack-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.stack-icon {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  background: rgba(0, 122, 255, 0.18);
  border: 1px solid var(--border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.stack-badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  background: var(--bg-surface);
}

.stack-badge.on {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.16);
  color: var(--text-primary);
}

.stack-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.stack-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.stack-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.stack-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
}

.stack-row:hover {
  border-color: rgba(0, 122, 255, 0.3);
}

.stack-index {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 122, 255, 0.18);
  border: 1px solid var(--border-color);
  font-weight: 800;
}

.stack-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stack-text {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack-sub {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack-remove {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  cursor: pointer;
  color: var(--text-secondary);
}

.stack-remove:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  -webkit-app-region: no-drag;
}

.preview-window {
  width: min(980px, calc(100vw - 24px));
  height: min(640px, calc(100vh - 24px));
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.create-window {
  width: min(680px, calc(100vw - 24px));
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.preview-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.preview-sub {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  color: var(--text-primary);
}

.icon-btn:hover {
  background: var(--bg-surface);
}

.icon-btn.active {
  border-color: rgba(0, 122, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.16);
}

.icon-btn.danger {
  color: var(--danger-color);
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.preview-loading {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 10px;
}

.create-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 14px;
}

.create-switch {
  display: flex;
  gap: 8px;
}

.rename-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.rename-input {
  flex: 1;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}

.primary-btn {
  border: 1px solid rgba(0, 122, 255, 0.35);
  background: rgba(0, 122, 255, 0.18);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.primary-btn:hover {
  background: rgba(0, 122, 255, 0.24);
}

.preview-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.edit-area {
  width: 100%;
  min-height: 260px;
  resize: none;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 14px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.link-meta-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  margin-bottom: 12px;
}

.link-thumb {
  width: 84px;
  height: 84px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.link-meta-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.webview {
  width: 100%;
  height: 320px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.image-preview-lg {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  background: var(--bg-surface);
}

.image-preview-lg img {
  width: 100%;
  height: auto;
  display: block;
}

.image-tools {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tool-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
}

.tool-btn:hover {
  background: var(--bg-card);
}

.tool-btn.small {
  padding: 7px 10px;
  font-size: 12px;
}

.tool-btn:disabled,
.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ocr-card {
  margin-top: 14px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-surface);
  padding: 12px;
}

.ocr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.ocr-text {
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
}

.ocr-empty {
  font-size: 12px;
  color: var(--text-secondary);
}

.ocr-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.color-preview-lg {
  height: 180px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 12px;
}

.color-value {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.color-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.color-input {
  width: 44px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-surface);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  font-size: 12px;
  color: var(--text-primary);
}

.file-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
