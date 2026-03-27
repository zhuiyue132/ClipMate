<script setup lang="ts">
import UiIcon from '../UiIcon.vue'

const props = defineProps<{
  open: boolean
  createType: 'text' | 'link'
  titleValue: string
  contentValue: string
  newTextShortcut?: string | null
  newLinkShortcut?: string | null
}>()

const emit = defineEmits<{
  close: []
  save: []
  'update:createType': [value: 'text' | 'link']
  'update:titleValue': [value: string]
  'update:contentValue': [value: string]
}>()
</script>

<template>
  <div v-if="props.open" class="preview-overlay" @click.self="emit('close')">
    <div class="create-window panel-create-dialog" @click.stop>
      <div class="panel-create-dialog__header">
        <div class="panel-create-dialog__header-left">
          <div class="badge">新建条目</div>
          <div class="panel-create-dialog__sub">无需先复制，可直接保存到历史记录</div>
        </div>
        <div class="panel-create-dialog__header-actions">
          <button class="icon-btn panel-create-dialog__close" title="关闭" @click="emit('close')">
            <UiIcon name="close" :size="18" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div class="create-body panel-create-dialog__body">
        <div class="create-switch panel-create-dialog__switch">
          <button
            class="panel-create-dialog__type-chip"
            :class="{ 'is-active': props.createType === 'text' }"
            @click="emit('update:createType', 'text')"
          >
            文本
          </button>
          <button
            class="panel-create-dialog__type-chip"
            :class="{ 'is-active': props.createType === 'link' }"
            @click="emit('update:createType', 'link')"
          >
            链接
          </button>
        </div>

        <input
          :value="props.titleValue"
          class="rename-input panel-create-dialog__input"
          placeholder="名称（可选）"
          @input="emit('update:titleValue', ($event.target as HTMLInputElement).value)"
        />
        <textarea
          :value="props.contentValue"
          class="edit-area panel-create-dialog__textarea"
          :placeholder="props.createType === 'link' ? 'https://example.com' : '输入文本内容...'"
          @input="emit('update:contentValue', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>

      <div class="preview-footer panel-create-dialog__footer">
        <span class="hint panel-create-dialog__hint">
          {{ props.newTextShortcut || '⌘N' }} 文本 · {{ props.newLinkShortcut || '⌘⇧N' }} 链接
        </span>
        <button class="primary-btn panel-create-dialog__save" @click="emit('save')">
          保存条目
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-create-dialog {
  border-color: var(--overlay-border-color);
  box-shadow: var(--shadow-float);
  background: linear-gradient(180deg, var(--overlay-surface-strong) 0%, var(--surface-card) 100%);
}

.panel-create-dialog__header,
.panel-create-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-create-dialog__header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
}

.panel-create-dialog__header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.panel-create-dialog__header-actions {
  display: flex;
  align-items: center;
}

.panel-create-dialog__sub {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-create-dialog__body {
  gap: 14px;
  padding: 18px 16px;
}

.panel-create-dialog__switch {
  gap: 10px;
}

.panel-create-dialog__type-chip {
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--surface-card) 92%, transparent);
  color: var(--text-secondary);
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--motion-normal) var(--ease-standard),
    border-color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.panel-create-dialog__type-chip:hover {
  color: var(--text-primary);
}

.panel-create-dialog__type-chip.is-active {
  color: var(--text-primary);
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--surface-card) 90%, var(--accent-fill));
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.panel-create-dialog__input,
.panel-create-dialog__textarea {
  border-color: var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
}

.panel-create-dialog__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
}

.panel-create-dialog__hint {
  flex: 1;
}
</style>
