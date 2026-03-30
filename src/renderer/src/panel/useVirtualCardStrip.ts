import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ClipItemSummary } from '../../../shared/types'

const CARD_WIDTH = 224
const CARD_GAP = 12
const CARD_STRIDE = CARD_WIDTH + CARD_GAP
const CARD_OVERSCAN = 3

export function useVirtualCardStrip(
  visibleItems: ComputedRef<ClipItemSummary[]>,
  activeCardId: Ref<string | null>
): {
  historyCardsRef: Ref<HTMLElement | null>
  virtualStartIndex: ComputedRef<number>
  virtualEndIndex: ComputedRef<number>
  virtualItems: ComputedRef<ClipItemSummary[]>
  virtualTrackWidth: ComputedRef<number>
  CARD_STRIDE: number
  setCardRef: (itemId: string, el: unknown) => void
  updateViewportMetrics: () => void
  onCardsScroll: (event: Event) => void
  scheduleScrollCardIntoView: (itemId: string) => void
  scrollToStart: () => void
} {
  const historyCardsRef = ref<HTMLElement | null>(null)
  const cardsViewportWidth = ref(0)
  const cardsViewportScrollLeft = ref(0)
  const cardRefs = new Map<string, HTMLElement>()
  let activeCardScrollFrame: number | null = null

  const virtualStartIndex = computed(() => {
    const start = Math.floor(cardsViewportScrollLeft.value / CARD_STRIDE) - CARD_OVERSCAN
    return Math.max(0, start)
  })

  const virtualEndIndex = computed(() => {
    const visibleCount = Math.ceil(cardsViewportWidth.value / CARD_STRIDE) + CARD_OVERSCAN * 2
    return Math.min(visibleItems.value.length, virtualStartIndex.value + Math.max(visibleCount, 8))
  })

  const virtualItems = computed(() =>
    visibleItems.value.slice(virtualStartIndex.value, virtualEndIndex.value)
  )

  const virtualTrackWidth = computed(() =>
    Math.max(visibleItems.value.length * CARD_STRIDE - CARD_GAP, CARD_WIDTH)
  )

  function setCardRef(itemId: string, el: unknown): void {
    const element =
      el instanceof HTMLElement
        ? el
        : typeof el === 'object' &&
            el !== null &&
            '$el' in el &&
            (el as { $el?: unknown }).$el instanceof HTMLElement
          ? ((el as { $el: HTMLElement }).$el ?? null)
          : null

    if (element instanceof HTMLElement) {
      cardRefs.set(itemId, element)
      return
    }
    cardRefs.delete(itemId)
  }

  function updateViewportMetrics(): void {
    const container = historyCardsRef.value
    if (!container) return

    cardsViewportWidth.value = container.clientWidth
    cardsViewportScrollLeft.value = container.scrollLeft
  }

  function onCardsScroll(event: Event): void {
    const target = event.target as HTMLElement | null
    cardsViewportScrollLeft.value = target?.scrollLeft ?? 0
  }

  function scrollCardIntoView(itemId: string): void {
    const container = historyCardsRef.value
    if (!container) return

    const index = visibleItems.value.findIndex((item) => item.id === itemId)
    if (index < 0) return

    const leftInContainer = index * CARD_STRIDE
    const rightInContainer = leftInContainer + CARD_WIDTH
    const viewportLeft = container.scrollLeft
    const viewportRight = viewportLeft + container.clientWidth
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    let nextLeft = viewportLeft

    if (leftInContainer < viewportLeft) {
      nextLeft = leftInContainer
    } else if (rightInContainer > viewportRight) {
      nextLeft = rightInContainer - container.clientWidth
    } else {
      return
    }

    nextLeft = Math.max(0, Math.min(maxScrollLeft, nextLeft))

    container.scrollLeft = nextLeft
    cardsViewportScrollLeft.value = nextLeft
  }

  function scheduleScrollCardIntoView(itemId: string): void {
    if (activeCardScrollFrame !== null) {
      window.cancelAnimationFrame(activeCardScrollFrame)
      activeCardScrollFrame = null
    }

    activeCardScrollFrame = window.requestAnimationFrame(() => {
      activeCardScrollFrame = null
      scrollCardIntoView(itemId)
    })
  }

  function scrollToStart(): void {
    historyCardsRef.value?.scrollTo({ left: 0, behavior: 'auto' })
    updateViewportMetrics()
  }

  watch(
    activeCardId,
    (itemId) => {
      if (!itemId) return
      scheduleScrollCardIntoView(itemId)
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    if (activeCardScrollFrame !== null) {
      window.cancelAnimationFrame(activeCardScrollFrame)
      activeCardScrollFrame = null
    }
  })

  return {
    historyCardsRef,
    virtualStartIndex,
    virtualEndIndex,
    virtualItems,
    virtualTrackWidth,
    CARD_STRIDE,
    setCardRef,
    updateViewportMetrics,
    onCardsScroll,
    scheduleScrollCardIntoView,
    scrollToStart
  }
}
