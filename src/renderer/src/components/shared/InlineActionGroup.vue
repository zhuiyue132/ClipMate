<script setup lang="ts">
withDefaults(
  defineProps<{
    align?: 'start' | 'center' | 'end'
    wrap?: boolean
    compact?: boolean
  }>(),
  {
    align: 'start',
    wrap: true,
    compact: false
  }
)
</script>

<template>
  <div
    class="inline-action-group"
    :class="[
      `inline-action-group--${align}`,
      { 'inline-action-group--nowrap': !wrap, 'inline-action-group--compact': compact }
    ]"
  >
    <slot />
  </div>
</template>
