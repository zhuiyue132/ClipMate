<script setup lang="ts">
import { ref } from 'vue'
import SearchField from './SearchField.vue'
import SegmentedFilter from './SegmentedFilter.vue'
import ToolbarIconButton from './ToolbarIconButton.vue'
import ToolbarStatus from './ToolbarStatus.vue'

interface ToolbarOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    typeOptions: ToolbarOption[]
    typeValue: string
    focusedIndex: number
    searchValue: string
    searchBusy?: boolean
    status?: { kind: 'paused' | 'searching' | 'selection' | 'idle'; label: string } | null
    filterActiveCount?: number
    filtersOpen?: boolean
    moreOpen?: boolean
  }>(),
  {
    searchBusy: false,
    status: null,
    filterActiveCount: 0,
    filtersOpen: false,
    moreOpen: false
  }
)

const emit = defineEmits<{
  'update:typeValue': [value: string]
  'update:searchValue': [value: string]
  'chip-focus': [index: number]
  'chip-keydown': [event: KeyboardEvent, index: number]
  'search-focus': []
  'search-keydown': [event: KeyboardEvent]
  'toggle-filters': []
  'toggle-more': []
}>()

const segmentedRef = ref<InstanceType<typeof SegmentedFilter> | null>(null)
const searchRef = ref<InstanceType<typeof SearchField> | null>(null)

function onChipFocus(index: number): void {
  emit('chip-focus', index)
}

function onChipKeydown(event: KeyboardEvent, index: number): void {
  emit('chip-keydown', event, index)
}

function focusChip(index: number): void {
  segmentedRef.value?.focusIndex(index)
}

function focusSearch(selectText = false): void {
  searchRef.value?.focus(selectText)
}

defineExpose({ focusChip, focusSearch })
</script>

<template>
  <header class="panel-toolbar">
    <div class="panel-toolbar__spacer" aria-hidden="true"></div>

    <div class="panel-toolbar__center">
      <SegmentedFilter
        ref="segmentedRef"
        :options="props.typeOptions"
        :model-value="props.typeValue"
        :focused-index="props.focusedIndex"
        @update:model-value="emit('update:typeValue', $event)"
        @chip-focus="onChipFocus"
        @chip-keydown="onChipKeydown"
      />

      <SearchField
        ref="searchRef"
        :model-value="props.searchValue"
        :busy="props.searchBusy"
        :focused="props.focusedIndex === props.typeOptions.length"
        @update:model-value="emit('update:searchValue', $event)"
        @focus="emit('search-focus')"
        @keydown="emit('search-keydown', $event)"
      />
    </div>

    <div class="panel-toolbar__actions">
      <ToolbarStatus :status="props.status" />

      <div class="panel-toolbar__anchor">
        <ToolbarIconButton
          icon="filter"
          title="筛选"
          :active="props.filtersOpen"
          :badge="props.filterActiveCount > 0 ? props.filterActiveCount : null"
          @click="emit('toggle-filters')"
        />
        <slot name="filter-popover" />
      </div>

      <div class="panel-toolbar__anchor">
        <ToolbarIconButton
          icon="more"
          title="更多"
          :active="props.moreOpen"
          @click="emit('toggle-more')"
        />
        <slot name="more-popover" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.panel-toolbar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 18px 10px;
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
}

.panel-toolbar__spacer {
  min-width: 0;
}

.panel-toolbar__center {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: min(78vw, 920px);
}

.panel-toolbar__actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-toolbar__anchor {
  position: relative;
  display: flex;
  align-items: center;
}
</style>
