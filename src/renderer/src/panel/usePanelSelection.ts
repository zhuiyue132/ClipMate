import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ClipItemSummary } from '../../../shared/types'

export function usePanelSelection(visibleItems: ComputedRef<ClipItemSummary[]>): {
  activeCardId: Ref<string | null>
  selectedIds: Ref<string[]>
  anchorId: Ref<string | null>
  hoveredId: Ref<string | null>
  selectedSet: ComputedRef<Set<string>>
  multiSelectActive: ComputedRef<boolean>
  clearSelection: () => void
  resetAll: () => void
  setActiveCard: (itemId: string | null) => void
  selectOnly: (itemId: string) => void
  toggleSelection: (itemId: string) => void
  selectRange: (toId: string) => void
  onItemClick: (event: MouseEvent, item: ClipItemSummary) => void
  onItemMouseEnter: (item: ClipItemSummary) => void
  onItemMouseLeave: (item: ClipItemSummary) => void
  moveActiveCard: (direction: -1 | 1) => void
  getPreviewCandidateId: () => string | null
  getConfirmCandidateId: () => string | null
} {
  const activeCardId = ref<string | null>(null)
  const selectedIds = ref<string[]>([])
  const anchorId = ref<string | null>(null)
  const hoveredId = ref<string | null>(null)

  const selectedSet = computed(() => new Set(selectedIds.value))
  const multiSelectActive = computed(() => selectedIds.value.length > 1)

  function clearSelection(): void {
    selectedIds.value = []
    anchorId.value = null
  }

  function resetAll(): void {
    clearSelection()
    activeCardId.value = null
    hoveredId.value = null
  }

  function setActiveCard(itemId: string | null): void {
    activeCardId.value = itemId
  }

  function selectOnly(itemId: string): void {
    selectedIds.value = [itemId]
    anchorId.value = itemId
    activeCardId.value = itemId
  }

  function toggleSelection(itemId: string): void {
    const list = [...selectedIds.value]
    const idx = list.indexOf(itemId)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(itemId)
    }
    selectedIds.value = list
    anchorId.value = itemId
  }

  function selectRange(toId: string): void {
    const items = visibleItems.value
    const fromId = anchorId.value ?? toId
    const from = items.findIndex((item) => item.id === fromId)
    const to = items.findIndex((item) => item.id === toId)
    if (from < 0 || to < 0) {
      selectOnly(toId)
      return
    }
    const [start, end] = from < to ? [from, to] : [to, from]
    selectedIds.value = items.slice(start, end + 1).map((item) => item.id)
  }

  function onItemClick(event: MouseEvent, item: ClipItemSummary): void {
    if (event.shiftKey) {
      selectRange(item.id)
      return
    }
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(item.id)
      return
    }
    selectOnly(item.id)
  }

  function onItemMouseEnter(item: ClipItemSummary): void {
    hoveredId.value = item.id
  }

  function onItemMouseLeave(item: ClipItemSummary): void {
    if (hoveredId.value === item.id) hoveredId.value = null
  }

  function getActiveCardIndex(): number {
    if (visibleItems.value.length === 0) return -1
    const currentId =
      activeCardId.value ??
      (selectedIds.value.length === 1 ? selectedIds.value[0] : hoveredId.value)
    if (!currentId) return -1
    return visibleItems.value.findIndex((item) => item.id === currentId)
  }

  function moveActiveCard(direction: -1 | 1): void {
    const items = visibleItems.value
    if (items.length === 0) return
    if (selectedIds.value.length > 0) {
      clearSelection()
    }

    const currentIndex = getActiveCardIndex()
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : (currentIndex + direction + items.length) % items.length
    activeCardId.value = items[nextIndex].id
  }

  function getPreviewCandidateId(): string | null {
    if (selectedIds.value.length === 1) return selectedIds.value[0]
    if (activeCardId.value) return activeCardId.value
    if (hoveredId.value) return hoveredId.value
    return visibleItems.value[0]?.id ?? null
  }

  function getConfirmCandidateId(): string | null {
    const items = visibleItems.value
    const activeItemId =
      items.find((entry) => entry.id === activeCardId.value)?.id ??
      (selectedIds.value.length === 1
        ? (items.find((entry) => entry.id === selectedIds.value[0])?.id ?? null)
        : null)
    return activeItemId
  }

  watch(
    visibleItems,
    (items) => {
      if (items.length === 0) {
        activeCardId.value = null
      } else if (!activeCardId.value || !items.some((item) => item.id === activeCardId.value)) {
        activeCardId.value = items[0].id
      }
    },
    { immediate: true }
  )

  return {
    activeCardId,
    selectedIds,
    anchorId,
    hoveredId,
    selectedSet,
    multiSelectActive,
    clearSelection,
    resetAll,
    setActiveCard,
    selectOnly,
    toggleSelection,
    selectRange,
    onItemClick,
    onItemMouseEnter,
    onItemMouseLeave,
    moveActiveCard,
    getPreviewCandidateId,
    getConfirmCandidateId
  }
}
