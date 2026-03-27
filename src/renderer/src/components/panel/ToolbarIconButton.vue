<script setup lang="ts">
import UiIcon from '../UiIcon.vue'

const props = withDefaults(
  defineProps<{
    icon: 'filter' | 'more'
    title: string
    active?: boolean
    badge?: string | number | null
    danger?: boolean
    disabled?: boolean
  }>(),
  {
    active: false,
    badge: null,
    danger: false,
    disabled: false
  }
)

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="toolbar-icon-button"
    :class="{ 'is-active': props.active, 'is-danger': props.danger }"
    :title="props.title"
    :disabled="props.disabled"
    type="button"
    @click.stop="emit('click')"
  >
    <UiIcon :name="props.icon" :size="17" :stroke-width="1.9" />
    <span v-if="props.badge !== null && props.badge !== ''" class="toolbar-icon-button__badge">
      {{ props.badge }}
    </span>
  </button>
</template>

<style scoped>
.toolbar-icon-button {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  backdrop-filter: blur(18px);
  transition:
    color var(--motion-normal) var(--ease-standard),
    border-color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.toolbar-icon-button:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--surface-hover));
}

.toolbar-icon-button.is-active {
  color: var(--text-primary);
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--accent-fill));
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.toolbar-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-icon-button__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-color);
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
</style>
