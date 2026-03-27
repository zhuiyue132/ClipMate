<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="toast toast-notice" @click.stop>
    {{ message }}
  </div>
</template>

<style scoped>
.toast-notice {
  left: 16px;
  bottom: 20px;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--surface-hover));
}
</style>
