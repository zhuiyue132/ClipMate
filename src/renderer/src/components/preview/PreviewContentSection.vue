<script setup lang="ts">
import SurfaceSection from '../shared/SurfaceSection.vue'

withDefaults(
  defineProps<{
    eyebrow?: string
    title?: string
    description?: string
    tone?: 'default' | 'muted' | 'accent' | 'danger'
    compact?: boolean
  }>(),
  {
    eyebrow: '',
    title: '',
    description: '',
    tone: 'default',
    compact: false
  }
)
</script>

<template>
  <SurfaceSection
    class="preview-content-section"
    :eyebrow="eyebrow"
    :title="title"
    :description="description"
    :tone="tone"
    :compact="compact"
  >
    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>

    <template v-if="$slots.headerExtra" #headerExtra>
      <slot name="headerExtra" />
    </template>
  </SurfaceSection>
</template>
