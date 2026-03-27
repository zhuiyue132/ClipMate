<script setup lang="ts">
import { ref } from 'vue'

interface SegmentedOption {
  value: string
  label: string
}

const props = defineProps<{
  options: SegmentedOption[]
  modelValue: string
  focusedIndex: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'chip-focus': [index: number]
  'chip-keydown': [event: KeyboardEvent, index: number]
}>()

const buttonRefs = ref<Array<HTMLButtonElement | null>>([])

function setButtonRef(index: number, el: HTMLButtonElement | null): void {
  buttonRefs.value[index] = el
}

function focusIndex(index: number): void {
  buttonRefs.value[index]?.focus({ preventScroll: true })
  buttonRefs.value[index]?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'smooth'
  })
}

defineExpose({ focusIndex })
</script>

<template>
  <div class="segmented-filter" role="tablist" aria-label="内容类型筛选">
    <button
      v-for="(option, index) in props.options"
      :key="option.value"
      :ref="(el) => setButtonRef(index, el as HTMLButtonElement | null)"
      class="segmented-filter__option"
      :class="{
        'is-active': props.modelValue === option.value,
        'is-focused': props.focusedIndex === index
      }"
      :tabindex="props.focusedIndex === index ? 0 : -1"
      type="button"
      @click="emit('update:modelValue', option.value)"
      @focus="emit('chip-focus', index)"
      @keydown="emit('chip-keydown', $event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  border: 1px solid var(--border-subtle);
  backdrop-filter: blur(18px);
}

.segmented-filter__option {
  position: relative;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.segmented-filter__option:hover {
  color: var(--text-primary);
}

.segmented-filter__option.is-active {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--surface-hover));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 0 0 1px rgba(0, 0, 0, 0.04);
}

.segmented-filter__option.is-focused {
  color: var(--text-primary);
}

.segmented-filter__option.is-focused::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 0 2px var(--ring-accent);
  pointer-events: none;
}
</style>
