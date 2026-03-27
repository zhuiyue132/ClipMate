<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title?: string
    description?: string
    tone?: 'default' | 'muted' | 'accent' | 'danger'
    compact?: boolean
  }>(),
  {
    eyebrow: '',
    title: '',
    description: '',
    tone: 'default',
    compact: false
  }
)
</script>

<template>
  <section
    class="surface-section"
    :class="[`surface-section--${tone}`, { 'surface-section--compact': compact }]"
  >
    <header
      v-if="eyebrow || title || description || $slots.headerExtra"
      class="surface-section__header"
    >
      <div class="surface-section__heading">
        <div v-if="eyebrow" class="surface-section__eyebrow">{{ eyebrow }}</div>
        <h3 v-if="title" class="surface-section__title">{{ title }}</h3>
        <p v-if="description" class="surface-section__description">{{ description }}</p>
      </div>
      <div v-if="$slots.headerExtra" class="surface-section__header-extra">
        <slot name="headerExtra" />
      </div>
    </header>

    <div class="surface-section__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="surface-section__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>
