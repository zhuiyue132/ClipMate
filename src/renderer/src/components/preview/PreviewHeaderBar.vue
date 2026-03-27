<script setup lang="ts">
import InlineActionGroup from '../shared/InlineActionGroup.vue'
import StatusPill from '../shared/StatusPill.vue'

withDefaults(
  defineProps<{
    kindLabel: string
    modeLabel?: string
    title?: string
    subtitle?: string
    accentLabel?: string
  }>(),
  {
    modeLabel: '',
    title: '',
    subtitle: '',
    accentLabel: ''
  }
)
</script>

<template>
  <header class="preview-header preview-header--native">
    <div class="preview-left preview-header__summary">
      <div class="preview-header__badges">
        <StatusPill :label="kindLabel" tone="neutral" />
        <StatusPill v-if="modeLabel" :label="modeLabel" tone="accent" :strong="true" />
        <StatusPill v-if="accentLabel" :label="accentLabel" tone="success" />
      </div>
      <div class="preview-meta preview-header__meta">
        <div v-if="title" class="preview-title preview-header__title">{{ title }}</div>
        <div v-if="subtitle" class="preview-sub preview-header__subtitle">{{ subtitle }}</div>
      </div>
    </div>

    <InlineActionGroup align="end" class="preview-actions preview-header__actions">
      <slot />
    </InlineActionGroup>
  </header>
</template>
