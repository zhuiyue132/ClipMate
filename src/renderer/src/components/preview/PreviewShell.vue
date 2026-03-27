<template>
  <div class="preview-shell preview-shell--native">
    <div class="preview-window preview-window-standalone preview-shell__window">
      <slot name="header" />
      <div class="preview-shell__content">
        <slot />
      </div>
      <slot name="footer" />
    </div>

    <div v-if="$slots.feedback" class="preview-shell__feedback">
      <slot name="feedback" />
    </div>
  </div>
</template>
