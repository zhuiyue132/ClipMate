<script setup lang="ts">
import UiIcon from '../UiIcon.vue'
import PanelOverlaySurface from './PanelOverlaySurface.vue'

const props = defineProps<{
  paused: boolean
  pasteStackEnabled: boolean
}>()

const emit = defineEmits<{
  settings: []
  about: []
  togglePaused: []
  togglePasteStack: []
  clearHistory: []
}>()
</script>

<template>
  <PanelOverlaySurface class="popover" variant="menu" @click.stop>
    <button class="menu-item panel-menu-item" @click="emit('settings')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="settings" /></span>
      <span class="menu-item-label panel-menu-item__label">打开设置</span>
    </button>
    <button class="menu-item panel-menu-item" @click="emit('about')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="info" /></span>
      <span class="menu-item-label panel-menu-item__label">关于 ClipMate</span>
    </button>
    <div class="menu-sep panel-menu-sep"></div>
    <button class="menu-item panel-menu-item" @click="emit('togglePaused')">
      <span class="menu-item-icon panel-menu-item__icon">
        <UiIcon :name="props.paused ? 'play' : 'pause'" />
      </span>
      <span class="menu-item-label panel-menu-item__label">
        {{ props.paused ? '恢复收集' : '暂停收集' }}
      </span>
    </button>
    <button class="menu-item panel-menu-item" @click="emit('togglePasteStack')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="stack" /></span>
      <span class="menu-item-label panel-menu-item__label">
        {{ props.pasteStackEnabled ? '关闭 Paste Stack' : '启用 Paste Stack' }}
      </span>
    </button>
    <button class="menu-item panel-menu-item danger" @click="emit('clearHistory')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="trash" /></span>
      <span class="menu-item-label panel-menu-item__label">清空历史</span>
    </button>
  </PanelOverlaySurface>
</template>

<style scoped>
.popover {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 252px;
  z-index: 30;
}
</style>
