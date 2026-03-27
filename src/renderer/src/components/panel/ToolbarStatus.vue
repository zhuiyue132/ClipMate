<script setup lang="ts">
const props = defineProps<{
  status: { kind: 'paused' | 'searching' | 'selection' | 'idle'; label: string } | null
}>()
</script>

<template>
  <div v-if="props.status" class="toolbar-status" :data-kind="props.status.kind">
    <span class="toolbar-status__dot" aria-hidden="true"></span>
    <span class="toolbar-status__label">{{ props.status.label }}</span>
  </div>
</template>

<style scoped>
.toolbar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
}

.toolbar-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 10%, transparent);
}

.toolbar-status[data-kind='paused'] .toolbar-status__dot {
  background: var(--warning-color);
}

.toolbar-status[data-kind='searching'] .toolbar-status__dot {
  background: var(--accent-color);
}

.toolbar-status[data-kind='selection'] .toolbar-status__dot {
  background: var(--text-tertiary);
}

.toolbar-status__label {
  white-space: nowrap;
}
</style>
