<script setup lang="ts">
import InlineActionGroup from '../shared/InlineActionGroup.vue'

defineProps<{
  hints: string[]
}>()
</script>

<template>
  <footer class="preview-footer preview-footer--native">
    <InlineActionGroup align="start" class="preview-footer__hints">
      <span v-for="hint in hints" :key="hint" class="hint preview-footer__hint">{{ hint }}</span>
    </InlineActionGroup>
    <InlineActionGroup v-if="$slots.actions" align="end" class="preview-footer__actions">
      <slot name="actions" />
    </InlineActionGroup>
  </footer>
</template>
