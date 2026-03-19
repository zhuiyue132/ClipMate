<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ClipItem, PasteStackEntry, PasteStackState } from '../../shared/types'

const pasteStackState = ref<PasteStackState>({ enabled: false, entries: [] })
let unsubStack: (() => void) | null = null

function clipItemTitle(item: ClipItem): string {
  return item.title?.trim() ?? ''
}

function previewText(item: ClipItem): string {
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

function stackEntryTitle(entry: PasteStackEntry): string {
  if (entry.item) return clipItemTitle(entry.item) || previewText(entry.item)
  return '(条目已删除)'
}

function stackEntryLabel(entry: PasteStackEntry): string {
  const compact = stackEntryTitle(entry).replace(/\s+/g, ' ').trim()
  return compact.slice(0, 8) || '空内容'
}

const visibleEntries = computed(() => pasteStackState.value.entries)

async function refreshPasteStack(): Promise<void> {
  pasteStackState.value = await window.api.getPasteStackState()
}

async function exitPasteStack(): Promise<void> {
  await window.api.setPasteStackEnabled(false)
}

onMounted(async () => {
  await refreshPasteStack()
  unsubStack = window.api.onPasteStackChanged(() => {
    void refreshPasteStack()
  })
})

onBeforeUnmount(() => {
  unsubStack?.()
})
</script>

<template>
  <div class="stack-screen-dock">
    <div class="stack-screen-dock-list">
      <div v-for="(entry, index) in visibleEntries" :key="entry.entry_id" class="stack-screen-item">
        <div class="stack-screen-chip" :title="stackEntryTitle(entry)">
          <div class="stack-screen-chip-index">{{ index + 1 }}</div>
          <div class="stack-screen-chip-label">{{ stackEntryLabel(entry) }}</div>
        </div>

        <button
          v-if="index === visibleEntries.length - 1"
          class="stack-screen-exit"
          @click="exitPasteStack()"
        >
          Exit Stack
        </button>
      </div>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  background: transparent !important;
}

body {
  overflow: hidden;
  user-select: none;
  -webkit-app-region: no-drag;
}

.stack-screen-dock {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  background: transparent;
  pointer-events: none;
}

.stack-screen-dock-list {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 12px 10px;
  scrollbar-width: none;
}

.stack-screen-dock-list::-webkit-scrollbar {
  display: none;
}

.stack-screen-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.stack-screen-chip {
  margin-left: auto;
  width: 100%;
  min-height: 72px;
  border-radius: 18px 0 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(24, 24, 28, 0.78);
  color: rgba(255, 255, 255, 0.92);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 10px 10px 14px;
}

.stack-screen-chip-index {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.64);
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.stack-screen-chip-label {
  font-size: 13px;
  line-height: 1.18;
  font-weight: 700;
  letter-spacing: 0.01em;
  word-break: break-all;
}

.stack-screen-exit {
  margin-left: auto;
  width: 100%;
  min-height: 40px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px 0 16px 0;
  background: rgba(178, 34, 34, 0.78);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  /* box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.08); */
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.stack-screen-exit:hover {
  background: rgba(205, 49, 49, 0.86);
}
</style>
