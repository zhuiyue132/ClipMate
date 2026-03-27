<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'menu' | 'popover' | 'dialog'
  }>(),
  {
    variant: 'popover'
  }
)
</script>

<template>
  <div class="panel-overlay-surface" :class="`panel-overlay-surface--${variant}`">
    <slot />
  </div>
</template>
