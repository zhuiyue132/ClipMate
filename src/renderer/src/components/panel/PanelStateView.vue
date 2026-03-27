<script setup lang="ts">
const props = defineProps<{
  mode: 'empty' | 'loading'
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="panel-state-view" :data-mode="props.mode">
    <div v-if="props.mode === 'loading'" class="panel-state-view__spinner" aria-hidden="true"></div>
    <p class="panel-state-view__title">{{ props.title }}</p>
    <p v-if="props.subtitle" class="panel-state-view__subtitle">{{ props.subtitle }}</p>
  </div>
</template>

<style scoped>
.panel-state-view {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.panel-state-view__spinner {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  animation: spin 0.8s linear infinite;
}

.panel-state-view__title {
  font-size: 15px;
  color: var(--text-primary);
}

.panel-state-view__subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
