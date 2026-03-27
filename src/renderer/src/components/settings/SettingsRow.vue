<script setup lang="ts">
import SurfaceRow from '../shared/SurfaceRow.vue'

withDefaults(
  defineProps<{
    label: string
    hint?: string
    stacked?: boolean
    compact?: boolean
  }>(),
  {
    hint: '',
    stacked: false,
    compact: false
  }
)
</script>

<template>
  <SurfaceRow
    class="settings-row"
    :label="label"
    :hint="hint"
    :stacked="stacked"
    align="start"
    :compact="compact"
  >
    <slot />
  </SurfaceRow>
</template>
