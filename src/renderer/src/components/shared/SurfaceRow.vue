<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    hint?: string
    stacked?: boolean
    align?: 'start' | 'center'
    compact?: boolean
  }>(),
  {
    label: '',
    hint: '',
    stacked: false,
    align: 'center',
    compact: false
  }
)
</script>

<template>
  <div
    class="surface-row"
    :class="[
      `surface-row--align-${align}`,
      { 'surface-row--stacked': stacked, 'surface-row--compact': compact }
    ]"
  >
    <div v-if="label || hint || $slots.prefix" class="surface-row__meta">
      <div v-if="$slots.prefix" class="surface-row__prefix">
        <slot name="prefix" />
      </div>
      <div class="surface-row__copy">
        <div v-if="label" class="surface-row__label">{{ label }}</div>
        <div v-if="hint" class="surface-row__hint">{{ hint }}</div>
      </div>
    </div>

    <div class="surface-row__content">
      <slot />
    </div>
  </div>
</template>
