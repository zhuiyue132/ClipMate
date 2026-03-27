<script setup lang="ts">
import { computed } from 'vue'
import type { ClipItemSummary } from '../../../../shared/types'

const props = defineProps<{
  item: ClipItemSummary
  previewHtml: string
  matchLines: Array<{ key: string; label: string; html: string }>
  searchMode: boolean
}>()

const linkHost = computed(() => {
  const raw = props.item.link_url
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0] ?? raw
  }
})

const fileCountLabel = computed(() => {
  if (!props.item.file_count || props.item.file_count <= 1) return null
  return `${props.item.file_count} 个文件`
})

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const linkDescriptionHtml = computed(() => {
  if (props.item.link_description?.trim()) return escapeHtml(props.item.link_description)
  return null
})
</script>

<template>
  <div class="panel-card-body" :data-kind="props.item.type" :data-search-mode="props.searchMode">
    <template v-if="props.item.type === 'image'">
      <div class="panel-card-body__image-box">
        <img v-if="props.item.image_preview" :src="props.item.image_preview" alt="" />
      </div>
    </template>

    <template v-else-if="props.item.type === 'color'">
      <div
        class="panel-card-body__color-box"
        :style="{ background: props.item.content_preview || '#000000' }"
      >
        <span class="panel-card-body__color-value">{{ props.item.content_preview }}</span>
      </div>
    </template>

    <template v-else-if="props.item.type === 'link'">
      <div class="panel-card-body__link-kicker-row">
        <span v-if="linkHost" class="panel-chip-tag panel-card-body__link-kicker">{{
          linkHost
        }}</span>
      </div>
      <div class="panel-card-body__link-text">
        <!-- eslint-disable vue/no-v-html -->
        <div
          v-if="props.item.link_title || props.item.title"
          class="panel-card-body__link-title"
          v-html="props.previewHtml"
        ></div>
        <div
          v-if="linkDescriptionHtml"
          class="panel-card-body__link-description"
          v-html="linkDescriptionHtml"
        ></div>
        <!-- eslint-enable vue/no-v-html -->
        <div v-if="props.item.link_url" class="panel-card-body__link-url">
          {{ props.item.link_url }}
        </div>
      </div>
    </template>

    <template v-else-if="props.item.type === 'file'">
      <div class="panel-card-body__file-shell">
        <div class="panel-card-body__file-title">
          {{ props.item.file_label || props.item.content_preview || '文件' }}
        </div>
        <div class="panel-card-body__file-sub">
          <span v-if="fileCountLabel" class="panel-chip-tag">{{ fileCountLabel }}</span>
          <span v-else class="panel-card-body__file-subtext">已捕获文件条目</span>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="panel-card-body__text-preview" v-html="props.previewHtml"></div>
    </template>

    <div v-if="props.matchLines.length > 0" class="panel-card-body__search-context">
      <div class="panel-card-body__search-title">命中内容</div>
      <div class="panel-card-body__search-lines">
        <div v-for="line in props.matchLines" :key="line.key" class="panel-card-body__search-line">
          <span class="panel-chip-tag panel-card-body__search-label">{{ line.label }}</span>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="panel-card-body__search-value" v-html="line.html"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  overflow: hidden;
}

.panel-card-body__text-preview,
.panel-card-body__link-title {
  width: 100%;
  font-size: 13px;
  line-height: 1.42;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
}

.panel-card-body__text-preview :deep(mark),
.panel-card-body__link-title :deep(mark),
.panel-card-body__search-value :deep(mark) {
  background: color-mix(in srgb, var(--accent-fill-strong) 92%, transparent);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.panel-card-body__image-box,
.panel-card-body__color-box {
  width: 100%;
  height: 122px;
  border-radius: calc(var(--radius-card-inner) + 2px);
  border: 1px solid var(--border-color);
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-raised) 86%, transparent);
}

.panel-card-body__image-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-card-body__image-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.panel-card-body__color-box {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 9px;
}

.panel-card-body__color-value {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.panel-card-body__link-kicker-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.panel-card-body__link-text {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-card-body__link-kicker {
  max-width: 100%;
}

.panel-card-body__link-description {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.panel-card-body__link-url {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-card-body__file-shell {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  border-radius: calc(var(--radius-card-inner) + 2px);
  border: 1px solid var(--border-color);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-card) 92%, white 8%) 0%,
    color-mix(in srgb, var(--surface-raised) 88%, transparent) 100%
  );
}

.panel-card-body__file-title {
  font-size: 14px;
  line-height: 1.35;
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.panel-card-body__file-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.panel-card-body__file-subtext {
  font-size: 11px;
  color: var(--text-secondary);
}

.panel-card-body__search-context {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: 2px;
}

.panel-card-body__search-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.panel-card-body__search-lines {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.panel-card-body__search-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.panel-card-body__search-label {
  flex: 0 0 auto;
  margin-top: 1px;
}

.panel-card-body__search-value {
  min-width: 0;
  flex: 1;
  font-size: 11px;
  line-height: 1.42;
  color: var(--text-secondary);
}

.panel-card-body[data-search-mode='true'] {
  gap: 10px;
}

.panel-card-body[data-search-mode='true'] .panel-card-body__search-context {
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
}

.panel-card-body[data-search-mode='true'] .panel-card-body__text-preview,
.panel-card-body[data-search-mode='true'] .panel-card-body__link-title {
  -webkit-line-clamp: 5;
}
</style>
