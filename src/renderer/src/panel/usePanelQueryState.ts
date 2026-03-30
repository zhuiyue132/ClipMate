import { computed, ref, watch, type Ref } from 'vue'
import type { ClipItemSummary, SearchFilters, SourceAppSummary } from '../../../shared/types'

export type TypeChip = 'all' | 'text' | 'image' | 'link' | 'file' | 'color'
export type DatePreset = 'all' | 'today' | 'week' | 'custom'

export function usePanelQueryState(sourceApps: Ref<SourceAppSummary[]>) {
  const search = ref('')
  const typeChip = ref<TypeChip>('all')
  const typeFocusIndex = ref(0)
  const sourceAppFilter = ref<string | null>(null)
  const datePreset = ref<DatePreset>('all')
  const customFrom = ref('')
  const customTo = ref('')

  const trimmedSearch = computed(() => search.value.trim())
  const hasRemoteSearchQuery = computed(() => trimmedSearch.value.length > 0)
  const isSearchActive = computed(() => {
    const q = trimmedSearch.value
    return (
      q.length > 0 ||
      typeChip.value !== 'all' ||
      sourceAppFilter.value !== null ||
      datePreset.value !== 'all'
    )
  })
  const filterActiveCount = computed(() => {
    let count = 0
    if (sourceAppFilter.value !== null) count += 1
    if (datePreset.value !== 'all') count += 1
    return count
  })

  function typeChipIndex(value: TypeChip): number {
    const options: TypeChip[] = ['all', 'text', 'image', 'link', 'file', 'color']
    const idx = options.indexOf(value)
    return idx >= 0 ? idx : 0
  }

  function syncTypeFocus(value: TypeChip): void {
    typeFocusIndex.value = typeChipIndex(value)
  }

  watch(typeChip, (value) => {
    syncTypeFocus(value)
  })

  const activeDateFilterLabel = computed(() => {
    switch (datePreset.value) {
      case 'today':
        return '日期：今天'
      case 'week':
        return '日期：本周'
      case 'custom':
        if (customFrom.value && customTo.value)
          return `日期：${customFrom.value} → ${customTo.value}`
        if (customFrom.value) return `日期：${customFrom.value} 之后`
        if (customTo.value) return `日期：${customTo.value} 之前`
        return '日期：自定义'
      default:
        return ''
    }
  })

  const searchSceneChips = computed(() => {
    const chips: Array<{ key: string; label: string }> = []

    if (trimmedSearch.value) {
      chips.push({ key: 'query', label: `关键词：${trimmedSearch.value}` })
    }

    if (typeChip.value !== 'all') {
      const labelMap: Record<TypeChip, string> = {
        all: '全部',
        text: '文本',
        image: '图片',
        link: '链接',
        file: '文件',
        color: '颜色'
      }
      chips.push({ key: 'type', label: `类型：${labelMap[typeChip.value]}` })
    }

    if (sourceAppFilter.value) {
      const appName =
        sourceApps.value.find((item) => item.source_app === sourceAppFilter.value)
          ?.source_app_name ?? sourceAppFilter.value
      chips.push({ key: 'source', label: `来源：${appName}` })
    }

    const dateLabel = activeDateFilterLabel.value
    if (dateLabel) chips.push({ key: 'date', label: dateLabel })

    return chips
  })

  const activeSearchKey = computed(() =>
    JSON.stringify({
      query: trimmedSearch.value,
      type: typeChip.value,
      sourceApp: sourceAppFilter.value,
      datePreset: datePreset.value,
      customFrom: customFrom.value,
      customTo: customTo.value
    })
  )

  const allowedTypes = computed<Array<ClipItemSummary['type']>>(() => {
    if (typeChip.value === 'all') return []
    if (typeChip.value === 'text') return ['text', 'richtext']
    if (typeChip.value === 'image') return ['image']
    if (typeChip.value === 'link') return ['link']
    if (typeChip.value === 'file') return ['file']
    if (typeChip.value === 'color') return ['color']
    return []
  })

  function startOfDayTs(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }

  function endOfDayTs(date: Date): number {
    return startOfDayTs(date) + 24 * 60 * 60 * 1000 - 1
  }

  function getWeekStartTs(date: Date): number {
    const day = date.getDay()
    const diff = day === 0 ? 6 : day - 1
    const d = new Date(date)
    d.setDate(date.getDate() - diff)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  const dateRange = computed(() => {
    const now = new Date()
    let dateFrom: number | null = null
    let dateTo: number | null = null

    if (datePreset.value === 'today') {
      dateFrom = startOfDayTs(now)
      dateTo = Date.now()
    }

    if (datePreset.value === 'week') {
      dateFrom = getWeekStartTs(now)
      dateTo = Date.now()
    }

    if (datePreset.value === 'custom') {
      if (customFrom.value) {
        const d = new Date(customFrom.value)
        dateFrom = startOfDayTs(d)
      }
      if (customTo.value) {
        const d = new Date(customTo.value)
        dateTo = endOfDayTs(d)
      }
    }

    return { dateFrom, dateTo }
  })

  function buildSearchFilters(): SearchFilters {
    const { dateFrom, dateTo } = dateRange.value
    return {
      query: trimmedSearch.value || undefined,
      types: allowedTypes.value.length > 0 ? allowedTypes.value : undefined,
      sourceApp: sourceAppFilter.value,
      dateFrom,
      dateTo,
      limit: 200,
      offset: 0
    }
  }

  function clearSearchQuery(): void {
    search.value = ''
  }

  function clearAllFilters(): void {
    typeChip.value = 'all'
    syncTypeFocus('all')
    sourceAppFilter.value = null
    datePreset.value = 'all'
    customFrom.value = ''
    customTo.value = ''
  }

  function resetAll(): void {
    clearSearchQuery()
    clearAllFilters()
  }

  return {
    search,
    typeChip,
    typeFocusIndex,
    sourceAppFilter,
    datePreset,
    customFrom,
    customTo,
    trimmedSearch,
    hasRemoteSearchQuery,
    isSearchActive,
    filterActiveCount,
    searchSceneChips,
    activeDateFilterLabel,
    activeSearchKey,
    allowedTypes,
    dateRange,
    buildSearchFilters,
    clearSearchQuery,
    clearAllFilters,
    resetAll,
    syncTypeFocus
  }
}
