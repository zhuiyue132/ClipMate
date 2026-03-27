<script setup lang="ts">
import { computed } from 'vue'
import {
  IconAdjustmentsHorizontal,
  IconArrowUpRight,
  IconCheck,
  IconClipboard,
  IconCloud,
  IconCopy,
  IconDatabase,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconFile,
  IconInfoCircle,
  IconLink,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShieldLock,
  IconStack2,
  IconTag,
  IconTrash,
  IconX
} from '@tabler/icons-vue'

const ICON_COMPONENTS = {
  arrowUpRight: IconArrowUpRight,
  check: IconCheck,
  close: IconX,
  cloud: IconCloud,
  copy: IconCopy,
  database: IconDatabase,
  edit: IconPencil,
  file: IconFile,
  filter: IconAdjustmentsHorizontal,
  image: IconPhoto,
  info: IconInfoCircle,
  link: IconLink,
  more: IconDots,
  palette: IconPalette,
  paste: IconClipboard,
  pause: IconPlayerPause,
  play: IconPlayerPlay,
  preview: IconEye,
  refresh: IconRefresh,
  save: IconDeviceFloppy,
  search: IconSearch,
  settings: IconSettings,
  shield: IconShieldLock,
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
