<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
    title?: string
    message?: string
    compact?: boolean
  }>(),
  {
    tone: 'neutral',
    title: '',
    message: '',
    compact: false
  }
)
</script>

<template>
  <div
    class="feedback-banner"
    :class="[`feedback-banner--${tone}`, { 'feedback-banner--compact': compact }]"
  >
    <div class="feedback-banner__body">
      <div v-if="title" class="feedback-banner__title">{{ title }}</div>
      <div v-if="message" class="feedback-banner__message">{{ message }}</div>
      <slot />
    </div>

    <div v-if="$slots.actions" class="feedback-banner__actions">
      <slot name="actions" />
    </div>
  </div>
</template>
