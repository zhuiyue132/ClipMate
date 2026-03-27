<script setup lang="ts">
import SurfaceSection from '../shared/SurfaceSection.vue'

withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
    tone?: 'default' | 'muted' | 'accent' | 'danger'
  }>(),
  {
    eyebrow: '',
    description: '',
    tone: 'default'
  }
)
</script>

<template>
  <SurfaceSection
    class="settings-section"
    :eyebrow="eyebrow"
    :title="title"
    :description="description"
    :tone="tone"
  >
    <slot />

    <template v-if="$slots.headerExtra" #headerExtra>
      <slot name="headerExtra" />
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </SurfaceSection>
</template>
