<script setup lang="ts">
import { ref } from 'vue'
import UiIcon from '../UiIcon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    busy?: boolean
    focused?: boolean
  }>(),
  {
    placeholder: '搜索剪贴板...',
    busy: false,
    focused: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  keydown: [event: KeyboardEvent]
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function focus(selectText = false): void {
  inputRef.value?.focus()
  if (selectText) {
    inputRef.value?.select()
  }
}

defineExpose({ focus })
</script>

<template>
  <label class="search-field" :class="{ 'is-focused': props.focused }">
    <button
      class="search-field__toggle search-toggle"
      tabindex="-1"
      type="button"
      @click.prevent="focus()"
    >
      <UiIcon name="search" :size="15" :stroke-width="2" />
    </button>
    <input
      ref="inputRef"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      class="search-field__input search-input"
      type="text"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="emit('focus')"
      @keydown="emit('keydown', $event)"
    />
    <span v-if="props.busy" class="search-field__busy">搜索中</span>
  </label>
</template>

<style scoped>
.search-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: min(240px, 32vw);
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  backdrop-filter: blur(18px);
  transition:
    border-color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.search-field:focus-within,
.search-field.is-focused {
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--accent-fill));
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.search-field__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex: 0 0 auto;
}

.search-field__toggle {
  border: none;
  background: transparent;
  color: inherit;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.search-field__input {
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-field__input::placeholder {
  color: var(--text-tertiary);
}

.search-field__busy {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
