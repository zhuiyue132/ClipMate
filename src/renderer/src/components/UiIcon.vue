<script setup lang="ts">
import { computed } from 'vue'
import {
  IconAdjustmentsHorizontal,
  IconClipboard,
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconInfoCircle,
  IconLink,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconSearch,
  IconSettings,
  IconStack2,
  IconTag,
  IconTrash,
  IconX
} from '@tabler/icons-vue'

const ICON_COMPONENTS = {
  close: IconX,
  copy: IconCopy,
  edit: IconPencil,
  filter: IconAdjustmentsHorizontal,
  info: IconInfoCircle,
  link: IconLink,
  more: IconDots,
  paste: IconClipboard,
  pause: IconPlayerPause,
  play: IconPlayerPlay,
  preview: IconEye,
  save: IconDeviceFloppy,
  search: IconSearch,
  settings: IconSettings,
  stack: IconStack2,
  tag: IconTag,
  trash: IconTrash
} as const

type UiIconName = keyof typeof ICON_COMPONENTS

const props = withDefaults(
  defineProps<{
    name: UiIconName
    size?: number
    strokeWidth?: number
  }>(),
  {
    size: 16,
    strokeWidth: 1.8
  }
)

const iconComponent = computed(() => ICON_COMPONENTS[props.name])
</script>

<template>
  <component
    :is="iconComponent"
    class="ui-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>
