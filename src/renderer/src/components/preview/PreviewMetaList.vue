<script setup lang="ts">
import SurfaceRow from '../shared/SurfaceRow.vue'

interface PreviewMetaRow {
  key: string
  label: string
  value: string
  hint?: string
}

defineProps<{
  rows: PreviewMetaRow[]
}>()
</script>

<template>
  <div class="preview-meta-list">
    <SurfaceRow
      v-for="row in rows"
      :key="row.key"
      :label="row.label"
      :hint="row.hint || ''"
      align="start"
      compact
    >
      <div class="preview-meta-list__value">{{ row.value }}</div>
    </SurfaceRow>
  </div>
</template>
