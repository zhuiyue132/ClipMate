import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ClipItemSummary, SearchFilters } from '../../../shared/types'
import type { DatePreset, TypeChip } from './usePanelQueryState'

interface PanelQueryInputs {
  search: Ref<string>
  trimmedSearch: ComputedRef<string>
  hasRemoteSearchQuery: ComputedRef<boolean>
  isSearchActive: ComputedRef<boolean>
  activeSearchKey: ComputedRef<string>
  allowedTypes: ComputedRef<Array<ClipItemSummary['type']>>
  sourceAppFilter: Ref<string | null>
  datePreset: Ref<DatePreset>
  dateRange: ComputedRef<{ dateFrom: number | null; dateTo: number | null }>
  customFrom: Ref<string>
  customTo: Ref<string>
  buildSearchFilters: () => SearchFilters
  typeChip: Ref<TypeChip>
}

export function usePanelSearchResults(
  historyItems: Ref<ClipItemSummary[]>,
  query: PanelQueryInputs,
  invalidationSeq: Ref<number>
): {
  searching: Ref<boolean>
  searchResults: Ref<ClipItemSummary[] | null>
  resolvedSearchKey: Ref<string | null>
  filteredHistoryItems: ComputedRef<ClipItemSummary[]>
  visibleItems: ComputedRef<ClipItemSummary[]>
  hasItems: ComputedRef<boolean>
  resetRemoteSearchState: () => void
  runSearchNow: () => Promise<void>
} {
  const searchResults = ref<ClipItemSummary[] | null>(null)
  const searching = ref(false)
  const resolvedSearchKey = ref<string | null>(null)

  let searchTimer: number | null = null
  let searchSeq = 0

  function itemMatchesActiveFilters(item: ClipItemSummary): boolean {
    const allowedTypes = query.allowedTypes.value
    if (allowedTypes.length > 0 && !allowedTypes.includes(item.type)) return false

    if (query.sourceAppFilter.value !== null && item.source_app !== query.sourceAppFilter.value) {
      return false
    }

    const { dateFrom, dateTo } = query.dateRange.value
    if (dateFrom !== null && item.created_at < dateFrom) return false
    if (dateTo !== null && item.created_at > dateTo) return false

    return true
  }

  const filteredHistoryItems = computed(() => historyItems.value.filter(itemMatchesActiveFilters))

  const visibleItems = computed(() => {
    if (!query.isSearchActive.value) return historyItems.value
    if (!query.hasRemoteSearchQuery.value) return filteredHistoryItems.value
    if (resolvedSearchKey.value === query.activeSearchKey.value && searchResults.value !== null) {
      return searchResults.value
    }
    return filteredHistoryItems.value
  })

  const hasItems = computed(() => visibleItems.value.length > 0)

  function clearSearchTimer(): void {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }
  }

  function resetRemoteSearchState(): void {
    searchSeq += 1
    clearSearchTimer()
    searching.value = false
    searchResults.value = null
    resolvedSearchKey.value = null
  }

  function scheduleSearch(): void {
    clearSearchTimer()
    searchTimer = window.setTimeout(() => {
      searchTimer = null
      void runSearchNow()
    }, 180)
  }

  async function runSearchNow(): Promise<void> {
    if (!query.hasRemoteSearchQuery.value) {
      resetRemoteSearchState()
      return
    }

    const requestKey = query.activeSearchKey.value
    const seq = ++searchSeq
    searching.value = true
    try {
      const results = await window.api.searchClipItems(query.buildSearchFilters())
      if (seq !== searchSeq) return
      searchResults.value = results
      resolvedSearchKey.value = requestKey
    } finally {
      if (seq === searchSeq) searching.value = false
    }
  }

  watch(query.search, () => {
    if (!query.hasRemoteSearchQuery.value) {
      resetRemoteSearchState()
      return
    }
    scheduleSearch()
  })

  watch(
    [query.typeChip, query.sourceAppFilter, query.datePreset, query.customFrom, query.customTo],
    () => {
      if (!query.hasRemoteSearchQuery.value) {
        resetRemoteSearchState()
      } else {
        void runSearchNow()
      }
    }
  )

  watch(invalidationSeq, () => {
    if (query.hasRemoteSearchQuery.value) {
      void runSearchNow()
    }
  })

  onBeforeUnmount(() => {
    clearSearchTimer()
  })

  return {
    searching,
    searchResults,
    resolvedSearchKey,
    filteredHistoryItems,
    visibleItems,
    hasItems,
    resetRemoteSearchState,
    runSearchNow
  }
}
