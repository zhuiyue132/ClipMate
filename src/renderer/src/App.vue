<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PreviewView from './PreviewView.vue'
import SettingsView from './SettingsView.vue'
import StackDockView from './StackDockView.vue'
import MainPanelView from './panel/MainPanelView.vue'

const routeHash = ref(window.location.hash || '#/')

function onHashChange(): void {
  routeHash.value = window.location.hash || '#/'
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
})

const isSettingsRoute = computed(() => routeHash.value.startsWith('#/settings'))
const isPreviewRoute = computed(() => routeHash.value.startsWith('#/preview'))
const isStackDockRoute = computed(() => routeHash.value.startsWith('#/stack-dock'))
</script>

<template>
  <SettingsView v-if="isSettingsRoute" />
  <PreviewView v-else-if="isPreviewRoute" />
  <StackDockView v-else-if="isStackDockRoute" />
  <MainPanelView v-else />
</template>
