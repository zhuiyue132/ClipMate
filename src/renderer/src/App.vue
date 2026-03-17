<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ClipItem, Pinboard } from '../../shared/types'

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

const displayItems = computed(() =>
  showingHistory.value ? historyItems.value : pinboardItems.value
)
const hasItems = computed(() => displayItems.value.length > 0)

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

async function refreshPinboardItems(pinboardId: string): Promise<void> {
  loading.value = true
  try {
    pinboardItems.value = await window.api.getPinboardItems(pinboardId)
  } finally {
    loading.value = false
  }
}

async function refreshCurrentView(): Promise<void> {
  if (showingHistory.value) {
    await refreshHistoryItems()
    return
  }
  if (activePinboardId.value) {
    await refreshPinboardItems(activePinboardId.value)
  }
}

async function refreshState(): Promise<void> {
  const state = await window.api.getClipboardState()
  paused.value = state.paused
}

function closeAllMenus(): void {
  moreOpen.value = false
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
    await Promise.all([refreshHistoryItems(), refreshPinboardItems(activePinboardId.value)])
  }
  if (action === 'delete') {
    await window.api.deleteClipItem(item.id)
    await refreshCurrentView()
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
  await refreshHistoryItems()
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
  await refreshHistoryItems()
  if (activePinboardId.value === pinboardId) {
    await refreshPinboardItems(pinboardId)
  }
  closeAllMenus()
}

async function removeFromActivePinboard(item: ClipItem): Promise<void> {
  if (!activePinboardId.value) return
  await window.api.removeItemFromPinboard(activePinboardId.value, item.id)
  await Promise.all([refreshHistoryItems(), refreshPinboardItems(activePinboardId.value)])
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

function onWindowContextMenu(e: MouseEvent): void {
  if (
    !(e.target as HTMLElement | null)?.closest?.('.card') &&
    !(e.target as HTMLElement | null)?.closest?.('.sidebar-item')
  ) {
    closeAllMenus()
  }
}

onMounted(async () => {
  await Promise.all([refreshState(), refreshPinboards(), refreshHistoryItems()])
  unsubItems = window.api.onClipItemsChanged(async () => {
    await refreshHistoryItems()
    if (activePinboardId.value) await refreshPinboardItems(activePinboardId.value)
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
        <input
          v-model="search"
          type="text"
          placeholder="搜索剪贴板..."
          class="search-input"
          disabled
        />
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
          <div v-if="paused" class="banner">已暂停收集（Pause Paste）</div>

          <div v-if="!hasItems && !loading" class="empty-state">
            <p>{{ showingHistory ? 'ClipMate 已就绪' : 'Pinboard 为空' }}</p>
            <p class="empty-hint">
              {{
                showingHistory ? '复制内容后将自动显示在这里' : '在历史记录中右键 → 固定到 Pinboard'
              }}
            </p>
          </div>

          <template v-else>
            <div v-if="showingHistory" class="cards">
              <div
                v-for="item in historyItems"
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
                    <div class="text-preview">{{ previewText(item) }}</div>
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
                <div class="pinboard-count">{{ pinboardItems.length }} 项</div>
              </div>

              <div class="pin-items">
                <div
                  v-for="(item, index) in pinboardItems"
                  :key="item.id"
                  class="pin-row"
                  draggable="true"
                  @dragstart="onPinDragStart($event, item.id)"
                  @dragover.prevent
                  @drop.prevent="onPinDrop(item.id)"
                  @click="onCardClick(item)"
                  @contextmenu="openClipContextMenu($event, item)"
                >
                  <div class="pin-index">{{ index + 1 }}</div>
                  <div class="pin-title">{{ previewText(item) }}</div>
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
