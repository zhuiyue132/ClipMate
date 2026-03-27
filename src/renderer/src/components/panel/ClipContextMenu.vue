<script setup lang="ts">
import UiIcon from '../UiIcon.vue'
import PanelOverlaySurface from './PanelOverlaySurface.vue'

const props = defineProps<{
  x: number
  y: number
  canEdit: boolean
}>()

const emit = defineEmits<{
  preview: []
  edit: []
  delete: []
}>()
</script>

<template>
  <PanelOverlaySurface
    class="ctx-menu"
    variant="menu"
    :style="{ left: `${props.x}px`, top: `${props.y}px` }"
    @click.stop
  >
    <button class="menu-item panel-menu-item" @click="emit('preview')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="preview" /></span>
      <span class="menu-item-label panel-menu-item__label">预览</span>
    </button>
    <button v-if="props.canEdit" class="menu-item panel-menu-item" @click="emit('edit')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="edit" /></span>
      <span class="menu-item-label panel-menu-item__label">编辑</span>
    </button>
    <button class="menu-item panel-menu-item danger" @click="emit('delete')">
      <span class="menu-item-icon panel-menu-item__icon"><UiIcon name="trash" /></span>
      <span class="menu-item-label panel-menu-item__label">删除</span>
    </button>
  </PanelOverlaySurface>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  min-width: 220px;
  z-index: 50;
  transform: translateY(4px);
}
</style>
