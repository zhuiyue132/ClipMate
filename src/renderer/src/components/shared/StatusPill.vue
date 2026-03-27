<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
    strong?: boolean
  }>(),
  {
    tone: 'neutral',
    strong: false
  }
)
</script>

<template>
  <span class="status-pill" :class="[`status-pill--${tone}`, { 'status-pill--strong': strong }]">
    {{ label }}
  </span>
</template>
