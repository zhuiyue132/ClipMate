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
  return (item.plain_text || item.content || '').slice(0, 80)
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
  ctxOpen.value = false
  ctxKind.value = null
  ctxItem.value = null
  ctxPinboard.value = null
  pinPickerOpen.value = false
}

async function onCardClick(item: ClipItem): Promise<void> {
  await window.api.pasteClipItem(item.id)
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
})

onBeforeUnmount(() => {
  unsubItems?.()
  unsubState?.()
  window.removeEventListener('click', closeAllMenus)
  window.removeEventListener('contextmenu', onWindowContextMenu)
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
                @click="onCardClick(item)"
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
                  :draggable="!isSearchActive"
                  @dragstart="onPinDragStart($event, item.id)"
                  @dragover.prevent
                  @drop.prevent="onPinDrop(item.id)"
                  @click="onCardClick(item)"
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
              <div class="menu-sep"></div>
              <button class="menu-item danger" @click="runClipAction('delete')">🗑 删除</button>
            </template>

            <template v-else-if="ctxKind === 'pinboard'">
              <button class="menu-item" @click="runPinboardAction('rename')">✏️ 重命名</button>
              <div class="menu-sep"></div>
              <button class="menu-item danger" @click="runPinboardAction('delete')">🗑 删除</button>
            </template>
          </div>
        </section>
      </div>
    </main>
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
</style>
