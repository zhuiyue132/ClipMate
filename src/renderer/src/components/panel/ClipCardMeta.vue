<script setup lang="ts">
const props = defineProps<{
  appIconSrc: string | null
  appIconAlt: string
  appInitial: string
  appName: string
  timeLabel: string
}>()

const emit = defineEmits<{
  iconError: [event: Event]
}>()
</script>

<template>
  <div class="panel-card-meta">
    <img
      v-if="props.appIconSrc"
      class="panel-card-meta__icon"
      :src="props.appIconSrc"
      :alt="props.appIconAlt"
      @error="emit('iconError', $event)"
    />
    <span v-else class="panel-card-meta__dot">{{ props.appInitial }}</span>
    <div class="panel-card-meta__text">
      <div class="panel-card-meta__name">{{ props.appName }}</div>
      <div class="panel-card-meta__time">{{ props.timeLabel }}</div>
    </div>
  </div>
</template>

<style scoped>
.panel-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-card-meta__icon,
.panel-card-meta__dot {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  border: 1px solid var(--border-color);
}

.panel-card-meta__icon {
  object-fit: cover;
}

.panel-card-meta__dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-card) 88%, var(--accent-fill));
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.panel-card-meta__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.panel-card-meta__name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-card-meta__time {
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
