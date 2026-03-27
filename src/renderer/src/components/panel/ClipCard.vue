<script setup lang="ts">
import type { ClipItemSummary } from '../../../../shared/types'
import UiIcon from '../UiIcon.vue'
import ClipCardBody from './ClipCardBody.vue'
import ClipCardMeta from './ClipCardMeta.vue'

const props = defineProps<{
  item: ClipItemSummary
  typeLabel: string
  titleHtml: string
  previewHtml: string
  matchLines: Array<{ key: string; label: string; html: string }>
  searchMode: boolean
  appIconSrc: string | null
  appIconAlt: string
  appInitial: string
  appName: string
  timeLabel: string
  canEdit: boolean
  active: boolean
  selected: boolean
  draggable?: boolean
}>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  click: [event: MouseEvent]
  dblclick: [event: MouseEvent]
  dragstart: [event: DragEvent]
  contextmenu: [event: MouseEvent]
  edit: []
  iconError: [event: Event]
}>()
</script>

<template>
  <article
    class="card panel-card"
    :class="{
      active: props.active,
      selected: props.selected,
      'is-search-mode': props.searchMode
    }"
    :draggable="props.draggable"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick', $event)"
    @dragstart="emit('dragstart', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="panel-card__top">
      <div class="panel-card__heading">
        <div class="badge panel-card__badge">{{ props.typeLabel }}</div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="props.titleHtml" class="panel-card__title" v-html="props.titleHtml"></div>
      </div>
      <div v-if="props.canEdit" class="panel-card__tools">
        <button
          class="card-tool-btn panel-quiet-action panel-card__action"
          @click.stop="emit('edit')"
        >
          <UiIcon name="edit" :size="13" :stroke-width="2" />
          <span>编辑</span>
        </button>
      </div>
    </div>

    <ClipCardBody
      :item="props.item"
      :preview-html="props.previewHtml"
      :match-lines="props.matchLines"
      :search-mode="props.searchMode"
    />

    <div class="panel-card__footer">
      <ClipCardMeta
        :app-icon-src="props.appIconSrc"
        :app-icon-alt="props.appIconAlt"
        :app-initial="props.appInitial"
        :app-name="props.appName"
        :time-label="props.timeLabel"
        @icon-error="emit('iconError', $event)"
      />
    </div>
  </article>
</template>

<style scoped>
.panel-card {
  position: absolute;
  isolation: isolate;
  top: 0;
  width: 224px;
  min-width: 224px;
  height: 232px;
  min-height: 232px;
  max-height: 232px;
  overflow: hidden;
  background: linear-gradient(180deg, var(--card-surface-top) 0%, var(--card-surface-bottom) 100%);
  border: 1px solid var(--card-border-default);
  border-radius: var(--radius-card);
  padding: 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  box-shadow: var(--card-shadow-rest);
  transition:
    background var(--motion-panel) var(--ease-standard),
    border-color var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard),
    transform var(--motion-normal) var(--ease-standard);
}

.panel-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: linear-gradient(180deg, var(--card-gloss-top), transparent 34%);
  pointer-events: none;
  transition: opacity var(--motion-normal) var(--ease-standard);
}

.panel-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  box-shadow: inset 0 0 0 1px transparent;
  pointer-events: none;
  transition:
    opacity var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.panel-card:hover {
  border-color: var(--card-border-hover);
  box-shadow: var(--card-shadow-hover);
}

.panel-card:hover::before {
  opacity: 0.62;
}

.panel-card.active {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-card) 92%, var(--accent-fill-strong)) 0%,
    color-mix(in srgb, var(--surface-selected-strong) 70%, var(--surface-card)) 100%
  );
  border-color: var(--card-border-active);
  box-shadow: var(--card-shadow-active);
}

.panel-card.active::before {
  opacity: 0.76;
}

.panel-card.selected {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-card) 92%, var(--accent-fill)) 0%,
    color-mix(in srgb, var(--surface-selected) 62%, var(--surface-card)) 100%
  );
  border-color: var(--card-border-selected);
  box-shadow: var(--card-shadow-selected);
}

.panel-card.selected::before {
  opacity: 0.65;
}

.panel-card.active.selected {
  border-color: var(--card-border-active);
  box-shadow: var(--card-shadow-active-selected);
}

.panel-card.active.selected::before {
  opacity: 0.82;
}

.panel-card.is-search-mode:not(.active):not(.selected) {
  border-color: color-mix(in srgb, var(--card-border-default) 65%, var(--accent-border));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent-border) 46%, transparent),
    var(--card-shadow-rest);
}

.panel-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.panel-card__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.panel-card__badge {
  flex: 0 0 auto;
}

.panel-card__title {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  line-height: 1.25;
  font-weight: 650;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-card__title :deep(mark) {
  background: color-mix(in srgb, var(--accent-fill-strong) 92%, transparent);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.panel-card__tools {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}

.panel-card__action {
  opacity: 0;
  transform: translateY(-2px);
  pointer-events: none;
}

.panel-card:hover .panel-card__action,
.panel-card.active .panel-card__action,
.panel-card.selected .panel-card__action {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.panel-card__footer {
  display: flex;
  justify-content: flex-start;
  min-height: 34px;
}

.panel-card.is-search-mode .panel-card__badge {
  background: color-mix(in srgb, var(--surface-card) 84%, var(--accent-fill));
  border-color: color-mix(in srgb, var(--border-color) 70%, var(--accent-border));
  color: var(--text-primary);
}

.panel-card.is-search-mode .panel-card__footer {
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 58%, transparent);
}

.panel-card.active .panel-card__badge,
.panel-card.selected .panel-card__badge {
  background: color-mix(in srgb, var(--surface-card) 86%, var(--accent-fill));
  border-color: color-mix(in srgb, var(--border-color) 70%, var(--accent-border));
  color: var(--text-primary);
}
</style>
