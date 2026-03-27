<script setup lang="ts">
import type { SourceAppSummary } from '../../../../shared/types'
import PanelOverlaySurface from './PanelOverlaySurface.vue'

type DatePreset = 'all' | 'today' | 'week' | 'custom'

const props = defineProps<{
  sourceApps: SourceAppSummary[]
  sourceAppFilter: string | null
  datePreset: DatePreset
  customFrom: string
  customTo: string
}>()

const emit = defineEmits<{
  'update:sourceAppFilter': [value: string | null]
  'update:datePreset': [value: DatePreset]
  'update:customFrom': [value: string]
  'update:customTo': [value: string]
}>()

function onSourceAppChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:sourceAppFilter', value === '__all__' ? null : value)
}
</script>

<template>
  <PanelOverlaySurface class="filter-popover" variant="popover" @click.stop>
    <div class="panel-filter-popover__group">
      <div class="panel-field-label">来源应用</div>
      <select
        :value="props.sourceAppFilter ?? '__all__'"
        class="panel-select"
        @change="onSourceAppChange"
      >
        <option value="__all__">全部应用</option>
        <option v-for="app in props.sourceApps" :key="app.source_app" :value="app.source_app">
          {{ app.source_app_name || app.source_app }} · {{ app.count }}
        </option>
      </select>
    </div>

    <div class="panel-filter-popover__group">
      <div class="panel-field-label">日期范围</div>
      <div class="panel-filter-popover__preset-row">
        <button
          class="panel-filter-popover__preset"
          :class="{ 'is-active': props.datePreset === 'all' }"
          @click="emit('update:datePreset', 'all')"
        >
          不限
        </button>
        <button
          class="panel-filter-popover__preset"
          :class="{ 'is-active': props.datePreset === 'today' }"
          @click="emit('update:datePreset', 'today')"
        >
          今天
        </button>
        <button
          class="panel-filter-popover__preset"
          :class="{ 'is-active': props.datePreset === 'week' }"
          @click="emit('update:datePreset', 'week')"
        >
          本周
        </button>
        <button
          class="panel-filter-popover__preset"
          :class="{ 'is-active': props.datePreset === 'custom' }"
          @click="emit('update:datePreset', 'custom')"
        >
          自定义
        </button>
      </div>

      <div v-if="props.datePreset === 'custom'" class="panel-filter-popover__custom-row">
        <input
          :value="props.customFrom"
          type="date"
          class="panel-input panel-input--date"
          @input="emit('update:customFrom', ($event.target as HTMLInputElement).value)"
        />
        <span class="panel-filter-popover__date-sep">–</span>
        <input
          :value="props.customTo"
          type="date"
          class="panel-input panel-input--date"
          @input="emit('update:customTo', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </PanelOverlaySurface>
</template>

<style scoped>
.filter-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 320px;
  z-index: 40;
}

.panel-filter-popover__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-raised) 86%, transparent);
  border: 1px solid var(--border-subtle);
}

.panel-filter-popover__group + .panel-filter-popover__group {
  margin-top: 10px;
}

.panel-filter-popover__preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-filter-popover__preset {
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--surface-card) 90%, transparent);
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  cursor: pointer;
  transition:
    color var(--motion-normal) var(--ease-standard),
    border-color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.panel-filter-popover__preset:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 92%, transparent);
}

.panel-filter-popover__preset.is-active {
  color: var(--text-primary);
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--accent-fill));
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.panel-filter-popover__custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-filter-popover__date-sep {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
