<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ClipItem, Pinboard, SearchFilters, SourceAppSummary } from '../../shared/types'

type ContextKind = 'clip' | 'pinboard'
type ClipMenuAction = 'paste' | 'copy' | 'pastePlain' | 'delete' | 'removeFromPinboard'
type PinboardMenuAction = 'rename' | 'delete'

const historyItems = ref<ClipItem[]>([])
const pinboardItems = ref<ClipItem[]>([])
const pinboards = ref<Pinboard[]>([])
const activePinboardId = ref<string | null>(null)

const paused = ref(false)
const loading = ref(false)

const search = ref('')
const moreOpen = ref(false)
const filtersOpen = ref(false)

type TypeChip = 'all' | 'text' | 'image' | 'link' | 'file' | 'color'
const typeChip = ref<TypeChip>('all')
const sourceApps = ref<SourceAppSummary[]>([])
const sourceAppFilter = ref<string | null>(null)
type DatePreset = 'all' | 'today' | 'week' | 'custom'
const datePreset = ref<DatePreset>('all')
const customFrom = ref('')
const customTo = ref('')

const searchResults = ref<ClipItem[] | null>(null)
const searching = ref(false)

const selectedIds = ref<string[]>([])
const anchorId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
const selectedSet = computed(() => new Set(selectedIds.value))

const previewOpen = ref(false)
const previewItem = ref<ClipItem | null>(null)
const previewLoading = ref(false)
const editMode = ref(false)
const editText = ref('')
const renameOpen = ref(false)
const renameDraft = ref('')
const colorDraft = ref('#007AFF')
const bulkPinOpen = ref(false)

const toast = ref<string | null>(null)
let toastTimer: number | null = null

const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxKind = ref<ContextKind | null>(null)
const ctxItem = ref<ClipItem | null>(null)
const ctxPinboard = ref<Pinboard | null>(null)
const pinPickerOpen = ref(false)

const draggingId = ref<string | null>(null)

const showingHistory = computed(() => activePinboardId.value === null)
const activePinboard = computed(() => {
  if (!activePinboardId.value) return null
  return pinboards.value.find((p) => p.id === activePinboardId.value) ?? null
})

const isSearchActive = computed(() => {
  const q = search.value.trim()
  return (
    q.length > 0 ||
    typeChip.value !== 'all' ||
    sourceAppFilter.value !== null ||
    datePreset.value !== 'all'
  )
})

const visibleItems = computed(() => {
  if (isSearchActive.value) return searchResults.value ?? []
  return showingHistory.value ? historyItems.value : pinboardItems.value
})

const hasItems = computed(() => visibleItems.value.length > 0)

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

async function refreshPinboards(): Promise<void> {
  pinboards.value = await window.api.getPinboards()
}

async function refreshSourceApps(): Promise<void> {
  sourceApps.value = await window.api.getSourceApps()
}

async function refreshPinboardItems(pinboardId: string): Promise<void> {
  loading.value = true
  try {
    pinboardItems.value = await window.api.getPinboardItems(pinboardId)
  } finally {
    loading.value = false
  }
}

async function refreshAfterMutation(): Promise<void> {
  await Promise.all([refreshSourceApps(), refreshHistoryItems()])
  if (activePinboardId.value) {
    await refreshPinboardItems(activePinboardId.value)
  }
  if (isSearchActive.value) {
    await runSearch()
  }
}

function startOfDayTs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function endOfDayTs(date: Date): number {
  return startOfDayTs(date) + 24 * 60 * 60 * 1000 - 1
}

function getWeekStartTs(date: Date): number {
  const day = date.getDay() // 0..6 (Sun..Sat)
  const diff = day === 0 ? 6 : day - 1 // Monday as start
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

function buildSearchFilters(): SearchFilters {
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

  return {
    query: search.value.trim(),
    types: typesForChip(typeChip.value),
    sourceApp: sourceAppFilter.value,
    dateFrom,
    dateTo,
    pinboardId: activePinboardId.value,
    limit: 200,
    offset: 0
  }
}

let searchSeq = 0
let searchTimer: number | null = null

function scheduleSearch(): void {
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void runSearch()
  }, 180)
}

async function runSearch(): Promise<void> {
  if (!isSearchActive.value) {
    searchResults.value = null
    return
  }

  const seq = ++searchSeq
  searching.value = true
  try {
    const results = await window.api.searchClipItems(buildSearchFilters())
    if (seq !== searchSeq) return
    searchResults.value = results
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
  bulkPinOpen.value = false
  ctxOpen.value = false
  ctxKind.value = null
  ctxItem.value = null
  ctxPinboard.value = null
  pinPickerOpen.value = false
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
  ctxKind.value = 'clip'
  ctxItem.value = item
  ctxPinboard.value = null
  ctxX.value = ev.clientX
  ctxY.value = ev.clientY
  ctxOpen.value = true
  moreOpen.value = false
  pinPickerOpen.value = false
}

async function openPreviewById(itemId: string): Promise<void> {
  previewLoading.value = true
  try {
    const item = await window.api.getClipItem(itemId)
    if (!item) return
    previewItem.value = item
    previewOpen.value = true
    editMode.value = false
    editText.value = item.plain_text ?? item.content ?? ''
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
  editMode.value = !editMode.value
  if (editMode.value) {
    editText.value = previewItem.value.plain_text ?? previewItem.value.content ?? ''
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

  // thumbnail
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

async function bulkPinTo(pinboardId: string): Promise<void> {
  if (selectedIds.value.length === 0) return
  await window.api.addItemsToPinboard(pinboardId, selectedIds.value)
  await refreshAfterMutation()
  bulkPinOpen.value = false
  clearSelection()
  showToast('已固定到 Pinboard')
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

async function bulkRemoveFromPinboard(): Promise<void> {
  if (!activePinboardId.value) return
  if (selectedIds.value.length === 0) return
  const ids = [...selectedIds.value]
  await Promise.all(ids.map((id) => window.api.removeItemFromPinboard(activePinboardId.value!, id)))
  await refreshAfterMutation()
  clearSelection()
  showToast('已从 Pinboard 移除')
}

function openPinboardContextMenu(ev: MouseEvent, pinboard: Pinboard): void {
  ev.preventDefault()
  ctxKind.value = 'pinboard'
  ctxPinboard.value = pinboard
  ctxItem.value = null
  ctxX.value = ev.clientX
  ctxY.value = ev.clientY
  ctxOpen.value = true
  moreOpen.value = false
  pinPickerOpen.value = false
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
  if (action === 'removeFromPinboard' && activePinboardId.value) {
    await window.api.removeItemFromPinboard(activePinboardId.value, item.id)
    await refreshAfterMutation()
  }
  if (action === 'delete') {
    await window.api.deleteClipItem(item.id)
    await refreshAfterMutation()
  }

  closeAllMenus()
}

async function runPinboardAction(action: PinboardMenuAction): Promise<void> {
  const pinboard = ctxPinboard.value
  if (!pinboard) return

  if (action === 'rename') {
    const next = window.prompt('重命名 Pinboard', pinboard.name)?.trim()
    if (!next || next === pinboard.name) return
    await window.api.renamePinboard(pinboard.id, next)
    await refreshPinboards()
  }

  if (action === 'delete') {
    const ok = window.confirm(`确定删除 Pinboard「${pinboard.name}」？`)
    if (!ok) return
    await window.api.deletePinboard(pinboard.id)
    if (activePinboardId.value === pinboard.id) {
      activePinboardId.value = null
      pinboardItems.value = []
    }
    await Promise.all([refreshPinboards(), refreshHistoryItems()])
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

async function selectHistory(): Promise<void> {
  activePinboardId.value = null
  await refreshHistoryItems()
}

async function selectPinboard(pinboardId: string): Promise<void> {
  activePinboardId.value = pinboardId
  await refreshPinboardItems(pinboardId)
}

async function createPinboard(): Promise<void> {
  const name = window.prompt('新建 Pinboard', '新 Pinboard')?.trim()
  if (!name) return
  await window.api.createPinboard(name, '#007AFF')
  await refreshPinboards()
}

async function addToPinboard(pinboardId: string): Promise<void> {
  if (!ctxItem.value) return
  await window.api.addItemToPinboard(pinboardId, ctxItem.value.id)
  await refreshAfterMutation()
  closeAllMenus()
}

async function removeFromActivePinboard(item: ClipItem): Promise<void> {
  if (!activePinboardId.value) return
  await window.api.removeItemFromPinboard(activePinboardId.value, item.id)
  await refreshAfterMutation()
}

function onPinDragStart(ev: DragEvent, itemId: string): void {
  draggingId.value = itemId
  ev.dataTransfer?.setData('text/plain', itemId)
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move'
  }
}

async function onPinDrop(targetId: string): Promise<void> {
  if (!activePinboardId.value) return
  if (isSearchActive.value) return
  const fromId = draggingId.value
  draggingId.value = null
  if (!fromId || fromId === targetId) return

  const from = pinboardItems.value.findIndex((i) => i.id === fromId)
  const to = pinboardItems.value.findIndex((i) => i.id === targetId)
  if (from < 0 || to < 0) return

  const next = [...pinboardItems.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  pinboardItems.value = next

  await window.api.reorderPinboardItems(
    activePinboardId.value,
    next.map((i) => i.id)
  )
}

let unsubItems: (() => void) | null = null
let unsubState: (() => void) | null = null

watch(
  [search, typeChip, sourceAppFilter, datePreset, customFrom, customTo, activePinboardId],
  () => {
    clearSelection()
    scheduleSearch()
  }
)

function onWindowContextMenu(e: MouseEvent): void {
  if (
    !(e.target as HTMLElement | null)?.closest?.('.card') &&
    !(e.target as HTMLElement | null)?.closest?.('.sidebar-item')
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
  if (selectedIds.value.length === 1) return selectedIds.value[0]
  if (hoveredId.value) return hoveredId.value
  return visibleItems.value[0]?.id ?? null
}

function onWindowKeyDown(e: KeyboardEvent): void {
  const typing = isTypingTarget(e.target)

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

onMounted(async () => {
  await Promise.all([
    refreshState(),
    refreshPinboards(),
    refreshSourceApps(),
    refreshHistoryItems()
  ])
  unsubItems = window.api.onClipItemsChanged(async () => {
    await Promise.all([refreshSourceApps(), refreshHistoryItems()])
    if (activePinboardId.value) await refreshPinboardItems(activePinboardId.value)
    if (isSearchActive.value) await runSearch()
  })
  unsubState = window.api.onClipStateChanged((state) => {
    paused.value = state.paused
  })

  window.addEventListener('click', closeAllMenus)
  window.addEventListener('contextmenu', onWindowContextMenu)
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  unsubItems?.()
  unsubState?.()
  window.removeEventListener('click', closeAllMenus)
  window.removeEventListener('contextmenu', onWindowContextMenu)
  window.removeEventListener('keydown', onWindowKeyDown)
  if (toastTimer) window.clearTimeout(toastTimer)
  if (searchTimer) window.clearTimeout(searchTimer)
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="search-box">
        <input v-model="search" type="text" placeholder="搜索剪贴板..." class="search-input" />
      </div>
      <button class="more-btn" title="更多" @click.stop="moreOpen = !moreOpen">···</button>

      <div v-if="moreOpen" class="popover" @click.stop>
        <button class="menu-item" @click="openSettings()">⚙ 打开设置</button>
        <button class="menu-item" @click="togglePaused()">
          {{ paused ? '▶︎ 恢复收集' : '⏸ 暂停收集' }}
        </button>
        <button class="menu-item" @click="clearHistory()">🗑 清空历史</button>
        <div class="menu-sep"></div>
        <button class="menu-item danger" @click="quitApp()">⏻ 退出</button>
      </div>
    </header>

    <main class="app-content">
      <div class="layout">
        <aside class="sidebar" @click.stop>
          <div class="sidebar-header">
            <div class="sidebar-title">Pinboard</div>
            <button class="sidebar-add" title="新建" @click.stop="createPinboard()">＋</button>
          </div>
          <div class="sidebar-list">
            <button
              class="sidebar-item"
              :class="{ active: showingHistory }"
              @click="selectHistory()"
            >
              <span class="sidebar-icon">🕘</span>
              <span class="sidebar-text">历史</span>
            </button>
            <div class="sidebar-sep"></div>
            <button
              v-for="pb in pinboards"
              :key="pb.id"
              class="sidebar-item"
              :class="{ active: activePinboardId === pb.id }"
              @click="selectPinboard(pb.id)"
              @contextmenu="openPinboardContextMenu($event, pb)"
            >
              <span class="pinboard-dot" :style="{ background: pb.color }"></span>
              <span class="sidebar-text">{{ pb.name }}</span>
            </button>
          </div>
        </aside>

        <section class="main-panel">
          <div class="filters" @click.stop>
            <div class="chips">
              <button
                class="chip"
                :class="{ active: typeChip === 'all' }"
                @click="typeChip = 'all'"
              >
                全部
              </button>
              <button
                class="chip"
                :class="{ active: typeChip === 'text' }"
                @click="typeChip = 'text'"
              >
                文本
              </button>
              <button
                class="chip"
                :class="{ active: typeChip === 'image' }"
                @click="typeChip = 'image'"
              >
                图片
              </button>
              <button
                class="chip"
                :class="{ active: typeChip === 'link' }"
                @click="typeChip = 'link'"
              >
                链接
              </button>
              <button
                class="chip"
                :class="{ active: typeChip === 'file' }"
                @click="typeChip = 'file'"
              >
                文件
              </button>
              <button
                class="chip"
                :class="{ active: typeChip === 'color' }"
                @click="typeChip = 'color'"
              >
                颜色
              </button>
            </div>

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

          <div v-if="paused" class="banner">已暂停收集（Pause Paste）</div>

          <div v-if="!hasItems && !loading" class="empty-state">
            <p>
              {{
                isSearchActive
                  ? '没有匹配结果'
                  : showingHistory
                    ? 'ClipMate 已就绪'
                    : 'Pinboard 为空'
              }}
            </p>
            <p class="empty-hint">
              {{
                isSearchActive
                  ? '试试更换关键词或筛选条件'
                  : showingHistory
                    ? '复制内容后将自动显示在这里'
                    : '在历史记录中右键 → 固定到 Pinboard'
              }}
            </p>
          </div>

          <template v-else>
            <div v-if="showingHistory" class="cards">
              <div
                v-for="item in visibleItems"
                :key="item.id"
                class="card"
                :class="{ selected: selectedSet.has(item.id) }"
                @mouseenter="onItemMouseEnter(item)"
                @mouseleave="onItemMouseLeave(item)"
                @click="onItemClick($event, item)"
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
                    <span class="app-dot">{{ (item.source_app_name || 'App').slice(0, 1) }}</span>
                    <div class="app-meta">
                      <div class="app-name">{{ item.source_app_name || '未知来源' }}</div>
                      <div class="time">{{ formatRelativeTime(item.created_at) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="pinboard-view">
              <div class="pinboard-head">
                <div class="pinboard-name">{{ activePinboard?.name || 'Pinboard' }}</div>
                <div class="pinboard-count">{{ visibleItems.length }} 项</div>
              </div>

              <div class="pin-items">
                <div
                  v-for="(item, index) in visibleItems"
                  :key="item.id"
                  class="pin-row"
                  :class="{ selected: selectedSet.has(item.id) }"
                  :draggable="!isSearchActive"
                  @dragstart="onPinDragStart($event, item.id)"
                  @dragover.prevent
                  @drop.prevent="onPinDrop(item.id)"
                  @mouseenter="onItemMouseEnter(item)"
                  @mouseleave="onItemMouseLeave(item)"
                  @click="onItemClick($event, item)"
                  @contextmenu="openClipContextMenu($event, item)"
                >
                  <div class="pin-index">{{ index + 1 }}</div>
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div class="pin-title" v-html="highlight(previewText(item))"></div>
                  <button
                    class="pin-remove"
                    title="移除"
                    @click.stop="removeFromActivePinboard(item)"
                  >
                    ×
                  </button>
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
            <template v-if="ctxKind === 'clip'">
              <button class="menu-item" @click="previewFromContext()">👁 预览</button>
              <button class="menu-item" @click="runClipAction('paste')">📋 直接粘贴</button>
              <button class="menu-item" @click="runClipAction('copy')">📄 复制</button>
              <button class="menu-item" @click="runClipAction('pastePlain')">
                Tt 粘贴为纯文本
              </button>
              <button class="menu-item" @click.stop="pinPickerOpen = !pinPickerOpen">
                📌 固定到 Pinboard
              </button>
              <div v-if="pinPickerOpen" class="submenu">
                <button
                  v-for="pb in pinboards"
                  :key="pb.id"
                  class="menu-item submenu-item"
                  @click="addToPinboard(pb.id)"
                >
                  <span class="pinboard-dot small" :style="{ background: pb.color }"></span>
                  {{ pb.name }}
                </button>
              </div>
              <button
                v-if="activePinboardId"
                class="menu-item"
                @click="runClipAction('removeFromPinboard')"
              >
                ➖ 从当前 Pinboard 移除
              </button>
              <button class="menu-item" @click="renameFromContext()">🏷 重命名</button>
              <button class="menu-item" @click="shareFromContext()">🔗 分享</button>
              <div class="menu-sep"></div>
              <button class="menu-item danger" @click="runClipAction('delete')">🗑 删除</button>
            </template>

            <template v-else-if="ctxKind === 'pinboard'">
              <button class="menu-item" @click="runPinboardAction('rename')">✏️ 重命名</button>
              <div class="menu-sep"></div>
              <button class="menu-item danger" @click="runPinboardAction('delete')">🗑 删除</button>
            </template>
          </div>

          <div v-if="toast" class="toast" @click.stop>{{ toast }}</div>

          <div v-if="selectedIds.length > 0" class="selection-bar" @click.stop>
            <div class="sel-count">{{ selectedIds.length }} 项已选择</div>
            <div class="sel-actions">
              <button class="sel-btn" @click.stop="bulkPinOpen = !bulkPinOpen">📌 固定…</button>
              <button v-if="activePinboardId" class="sel-btn" @click="bulkRemoveFromPinboard()">
                ➖ 移除
              </button>
              <button class="sel-btn danger" @click="bulkDelete()">🗑 删除</button>
              <button class="sel-btn" @click="clearSelection()">取消</button>
            </div>

            <div v-if="bulkPinOpen" class="sel-popover" @click.stop>
              <button
                v-for="pb in pinboards"
                :key="pb.id"
                class="sel-item"
                @click="bulkPinTo(pb.id)"
              >
                <span class="pinboard-dot small" :style="{ background: pb.color }"></span>
                {{ pb.name }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>

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
                <img :src="`data:image/png;base64,${previewItem.content}`" alt="" />
              </div>
              <div class="image-tools">
                <button class="tool-btn" @click="rotateImage('left')">⟲</button>
                <button class="tool-btn" @click="rotateImage('right')">⟳</button>
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
                <div v-for="p in getFilePaths(previewItem)" :key="p" class="file-row">{{ p }}</div>
              </div>
            </template>
          </template>
        </div>

        <div class="preview-footer">
          <span class="hint">空格 / ESC 关闭</span>
          <span v-if="editMode" class="hint">⌘S 保存</span>
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
  --danger-color: #ff3b30;
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
  -webkit-app-region: drag;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  position: relative;
}

.search-box {
  flex: 1;
  -webkit-app-region: no-drag;
}

.search-input {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
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
  right: 16px;
  top: 48px;
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
  padding: 16px;
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
  height: 100%;
  display: flex;
  gap: 12px;
}

.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.sidebar-add {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  cursor: pointer;
  color: var(--text-primary);
}

.sidebar-add:hover {
  background: var(--bg-card);
}

.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  padding-right: 2px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
}

.sidebar-item:hover {
  background: var(--bg-surface);
  border-color: var(--border-color);
}

.sidebar-item.active {
  background: rgba(0, 122, 255, 0.18);
  border-color: rgba(0, 122, 255, 0.28);
}

.sidebar-icon {
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.sidebar-text {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-sep {
  height: 1px;
  background: var(--border-color);
  margin: 4px 2px;
}

.pinboard-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

@media (prefers-color-scheme: dark) {
  .pinboard-dot {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
}

.pinboard-dot.small {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.main-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  position: relative;
  padding-bottom: 58px;
}

.filters {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: auto;
  padding-bottom: 2px;
}

.chip {
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.chip:hover {
  background: var(--bg-card);
}

.chip.active {
  background: rgba(0, 122, 255, 0.18);
  border-color: rgba(0, 122, 255, 0.28);
  color: var(--text-primary);
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
  top: 36px;
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
  height: 100%;
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

.cards {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
  scroll-snap-type: x mandatory;
}

.card {
  width: 260px;
  min-width: 260px;
  height: 100%;
  max-height: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  scroll-snap-align: start;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.card:hover {
  border-color: rgba(0, 122, 255, 0.3);
}

.card.selected {
  border-color: rgba(0, 122, 255, 0.65);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.18);
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
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  font-size: 12px;
  color: var(--text-secondary);
}

.card-body {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.text-preview {
  font-size: 14px;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
}

.text-preview mark,
.pin-title mark {
  background: rgba(0, 122, 255, 0.22);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.image-box {
  width: 100%;
  height: 132px;
  border-radius: 12px;
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
  height: 132px;
  border-radius: 12px;
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
}

.app-pill {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-dot {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 122, 255, 0.18);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  font-weight: 700;
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

.sel-popover {
  position: absolute;
  right: 12px;
  bottom: 50px;
  width: 260px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 8px;
}

.sel-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 10px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.sel-item:hover {
  background: var(--bg-surface);
}

.submenu {
  margin: 6px 6px 2px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-surface);
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 0;
}

.pinboard-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pinboard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 2px 10px;
}

.pinboard-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.pinboard-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.pin-items {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.pin-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
}

.pin-row:hover {
  border-color: rgba(0, 122, 255, 0.3);
}

.pin-row.selected {
  border-color: rgba(0, 122, 255, 0.65);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.16);
}

.pin-index {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 122, 255, 0.18);
  border: 1px solid var(--border-color);
  font-weight: 700;
}

.pin-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-remove {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  cursor: pointer;
  color: var(--text-secondary);
}

.pin-remove:hover {
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
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  font-size: 12px;
  color: var(--text-primary);
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
