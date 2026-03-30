<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  AppSettings,
  AppIconTarget,
  ClipItemSummary,
  SettingsSnapshot,
  ThemePreference
} from '../../../shared/types'
import ClipCard from '../components/panel/ClipCard.vue'
import ClipContextMenu from '../components/panel/ClipContextMenu.vue'
import ClipCreateDialog from '../components/panel/ClipCreateDialog.vue'
import PanelFilterPopover from '../components/panel/PanelFilterPopover.vue'
import PanelMoreMenu from '../components/panel/PanelMoreMenu.vue'
import PanelStateView from '../components/panel/PanelStateView.vue'
import PanelToolbar from '../components/panel/PanelToolbar.vue'
import ToastNotice from '../components/panel/ToastNotice.vue'
import FeedbackBanner from '../components/shared/FeedbackBanner.vue'
import InlineActionGroup from '../components/shared/InlineActionGroup.vue'
import StatusPill from '../components/shared/StatusPill.vue'
import {
  buildCardSearchContextLines,
  canOpenPreviewEdit,
  cardPreviewHtml,
  clipItemTitle,
  formatRelativeTime,
  highlight,
  typeLabel
} from './panelPresentation'
import { usePanelFeed } from './usePanelFeed'
import { usePanelQueryState, type TypeChip } from './usePanelQueryState'
import { usePanelSearchResults } from './usePanelSearchResults'
import { usePanelSelection } from './usePanelSelection'
import { useVirtualCardStrip } from './useVirtualCardStrip'

type ClipMenuAction = 'delete'
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

const toolbarRef = ref<InstanceType<typeof PanelToolbar> | null>(null)
const appSettings = ref<AppSettings | null>(null)

const moreOpen = ref(false)
const filtersOpen = ref(false)
const createOpen = ref(false)
const createType = ref<'text' | 'link'>('text')
const createTitle = ref('')
const createContent = ref('')
const toast = ref<string | null>(null)
const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxItem = ref<HistoryCardItem | null>(null)
const appIcons = ref<Record<string, string | null>>({})
const appIconFailures = ref<Record<string, true>>({})

let toastTimer: number | null = null
let unsubSettings: (() => void) | null = null

const feed = usePanelFeed()
const {
  sourceApps,
  paused,
  loading,
  panelPreparing,
  pasteStackState,
  prepareSeq,
  freshOpenSeq,
  refreshState,
  refreshAll,
  refreshPasteStack,
  refreshSummaryById
} = feed
const query = usePanelQueryState(feed.sourceApps)
const {
  search,
  typeChip,
  typeFocusIndex,
  sourceAppFilter,
  datePreset,
  customFrom,
  customTo,
  trimmedSearch,
  hasRemoteSearchQuery,
  isSearchActive,
  filterActiveCount,
  searchSceneChips,
  activeSearchKey,
  clearSearchQuery: clearSearchQueryState,
  clearAllFilters: clearAllFilterState,
  resetAll: resetAllQueryState
} = query
const searchState = usePanelSearchResults(feed.historyItems, query, feed.dataVersion)
const { searching, visibleItems, hasItems } = searchState
const selection = usePanelSelection(searchState.visibleItems)
const {
  activeCardId,
  selectedIds,
  selectedSet,
  multiSelectActive,
  clearSelection,
  resetAll: resetSelectionState,
  setActiveCard
} = selection
const virtualStrip = useVirtualCardStrip(searchState.visibleItems, selection.activeCardId)
const { virtualStartIndex, virtualTrackWidth, virtualItems, CARD_STRIDE } = virtualStrip

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    return
  }

  root.dataset.theme = theme
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

const showSearchBanner = computed(() => {
  return hasRemoteSearchQuery.value || sourceAppFilter.value !== null || datePreset.value !== 'all'
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

function onSearchFieldFocus(): void {
  typeFocusIndex.value = TYPE_OPTIONS.length
}

function focusSearchInput(selectText = false): void {
  void nextTick(() => {
    toolbarRef.value?.focusSearch(selectText)
  })
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
  }
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
    void searchState.runSearchNow()
  }
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

function clearSearchQuery(): void {
  clearSearchQueryState()
  focusSearchInput(true)
}

function clearAllFilters(): void {
  clearAllFilterState()
  filtersOpen.value = false
}

function exitSearchScene(): void {
  clearSearchQuery()
  clearAllFilters()
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

function closeCreateDialog(): void {
  createOpen.value = false
  createTitle.value = ''
  createContent.value = ''
}

function resetTransientPanelState(): void {
  closeAllMenus()
  resetSelectionState()
  closeCreateDialog()
}

function dismissMainPanel(): void {
  resetTransientPanelState()
  window.api.hideWindow()
}

async function pasteHistoryItem(item: HistoryCardItem): Promise<void> {
  selection.selectOnly(item.id)
  await window.api.pasteClipItem(item.id)
}

function onItemDoubleClick(event: MouseEvent, item: HistoryCardItem): void {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
  void pasteHistoryItem(item)
}

function openClipContextMenu(event: MouseEvent, item: HistoryCardItem): void {
  event.preventDefault()
  setActiveCard(item.id)
  ctxItem.value = item
  ctxX.value = event.clientX
  ctxY.value = event.clientY
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

async function togglePasteStackUi(): Promise<void> {
  closeAllMenus()
  await window.api.setPasteStackEnabled(!pasteStackState.value.enabled)
  await refreshPasteStack()
}

function openSettings(): void {
  window.api.showSettings()
  closeAllMenus()
}

function openAbout(): void {
  window.api.showSettings({ tab: 'about' })
  closeAllMenus()
}

function appIconKey(target: AppIconTarget): string {
  return `${target.bundleId ?? ''}|${target.name ?? ''}`
}

function appIconTargetForItem(item: HistoryCardItem): AppIconTarget {
  return {
    bundleId: item.source_app,
    name: item.source_app_name
  }
}

function appIconKeyForItem(item: HistoryCardItem): string {
  return appIconKey(appIconTargetForItem(item))
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

const virtualCardEntries = computed(() =>
  virtualItems.value.map((item) => ({
    item,
    typeLabel: typeLabel(item.type),
    titleHtml: clipItemTitle(item) ? highlight(clipItemTitle(item), query.trimmedSearch.value) : '',
    previewHtml: cardPreviewHtml(item, trimmedSearch.value, hasRemoteSearchQuery.value),
    matchLines: buildCardSearchContextLines(item, trimmedSearch.value),
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

function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === 'Process' || event.keyCode === 229
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || Boolean(el.isContentEditable)
}

async function confirmActiveCard(): Promise<void> {
  const id = selection.getConfirmCandidateId()
  if (!id) return
  const item = visibleItems.value.find((entry) => entry.id === id)
  if (!item) return
  await pasteHistoryItem(item)
}

function onWindowContextMenu(event: MouseEvent): void {
  if (!(event.target as HTMLElement | null)?.closest?.('.card')) {
    closeAllMenus()
  }
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (isComposingEvent(event)) return

  const typing = isTypingTarget(event.target)
  const shortcuts = appSettings.value?.shortcuts

  if (event.key === 'Escape') {
    event.preventDefault()
    dismissMainPanel()
    return
  }

  if (shortcuts?.focusSearch && matchesAccelerator(event, shortcuts.focusSearch)) {
    event.preventDefault()
    focusSearchInput(true)
    return
  }

  if (shortcuts?.newTextItem && matchesAccelerator(event, shortcuts.newTextItem)) {
    event.preventDefault()
    openCreateDialog('text')
    return
  }

  if (shortcuts?.newLinkItem && matchesAccelerator(event, shortcuts.newLinkItem)) {
    event.preventDefault()
    openCreateDialog('link')
    return
  }

  if (typing) return

  if (!filtersOpen.value && !moreOpen.value && !ctxOpen.value) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const focused = document.activeElement as HTMLElement | null
      if (focused?.closest('.panel-toolbar')) {
        focused.blur()
      }
      selection.moveActiveCard(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      void confirmActiveCard()
      return
    }
  }

  if (event.key === ' ') {
    const id = selection.getPreviewCandidateId()
    if (id) {
      event.preventDefault()
      void openPreviewById(id)
    }
  }

  if ((event.key === 'Backspace' || event.key === 'Delete') && selectedIds.value.length > 0) {
    event.preventDefault()
    void bulkDelete()
  }
}

function onWindowFocus(): void {
  void Promise.all([refreshState(), refreshPasteStack()])
}

function onWindowResize(): void {
  virtualStrip.updateViewportMetrics()
}

watch(
  () => activeSearchKey.value,
  () => {
    selection.clearSelection()
    void nextTick(() => {
      virtualStrip.scrollToStart()
    })
  }
)

watch(prepareSeq, () => {
  resetTransientPanelState()
})

watch(freshOpenSeq, () => {
  resetAllQueryState()
  resetSelectionState()
  closeCreateDialog()
  closeAllMenus()
  searchState.resetRemoteSearchState()
  void nextTick(() => {
    virtualStrip.scrollToStart()
  })
})

watch(
  visibleItems,
  (items) => {
    void ensureVisibleAppIcons(items)
  },
  { immediate: true }
)

onMounted(async () => {
  const settingsSnapshot = await window.api.getSettingsSnapshot()
  appSettings.value = settingsSnapshot.settings
  applyTheme(settingsSnapshot.settings.general.theme)
  unsubSettings = window.api.onSettingsChanged((snapshot: SettingsSnapshot) => {
    appSettings.value = snapshot.settings
    applyTheme(snapshot.settings.general.theme)
  })

  await refreshAll()
  await nextTick()
  virtualStrip.updateViewportMetrics()

  window.addEventListener('click', closeAllMenus)
  window.addEventListener('contextmenu', onWindowContextMenu)
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  unsubSettings?.()
  window.removeEventListener('click', closeAllMenus)
  window.removeEventListener('contextmenu', onWindowContextMenu)
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('resize', onWindowResize)
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app">
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
            :ref="virtualStrip.historyCardsRef"
            class="cards-viewport"
            :class="{ 'is-search-active': isSearchActive }"
            @scroll="virtualStrip.onCardsScroll"
          >
            <div class="cards-track" :style="{ width: `${virtualTrackWidth}px` }">
              <ClipCard
                v-for="(entry, index) in virtualCardEntries"
                :key="entry.item.id"
                :ref="(el) => virtualStrip.setCardRef(entry.item.id, el)"
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
                @mouseenter="selection.onItemMouseEnter(entry.item)"
                @mouseleave="selection.onItemMouseLeave(entry.item)"
                @click="selection.onItemClick($event, entry.item)"
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
