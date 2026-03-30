import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type {
  ClipItemSummary,
  HistoryMutationEvent,
  PanelPerformanceMark,
  PanelSnapshot,
  PasteStackState,
  SourceAppSummary
} from '../../../shared/types'

function sortHistoryItems(items: ClipItemSummary[]): ClipItemSummary[] {
  return [...items].sort((left, right) => {
    if (right.created_at !== left.created_at) {
      return right.created_at - left.created_at
    }
    return right.updated_at - left.updated_at
  })
}

export function usePanelFeed(): {
  historyItems: Ref<ClipItemSummary[]>
  sourceApps: Ref<SourceAppSummary[]>
  paused: Ref<boolean>
  loading: Ref<boolean>
  panelPreparing: Ref<boolean>
  pasteStackState: Ref<PasteStackState>
  panelPerformanceMarks: Ref<PanelPerformanceMark[]>
  dataVersion: Ref<number>
  prepareSeq: Ref<number>
  freshOpenSeq: Ref<number>
  refreshState: () => Promise<void>
  refreshAll: () => Promise<void>
  refreshPasteStack: () => Promise<void>
  refreshSummaryById: (id: string) => Promise<void>
} {
  const historyItems = ref<ClipItemSummary[]>([])
  const sourceApps = ref<SourceAppSummary[]>([])
  const paused = ref(false)
  const loading = ref(false)
  const panelPreparing = ref(false)
  const pasteStackState = ref<PasteStackState>({ enabled: false, entries: [] })
  const panelPerformanceMarks = ref<PanelPerformanceMark[]>([])
  const dataVersion = ref(0)
  const prepareSeq = ref(0)
  const freshOpenSeq = ref(0)

  let unsubHistoryMutation: (() => void) | null = null
  let unsubState: (() => void) | null = null
  let unsubStack: (() => void) | null = null
  let unsubPanelPreparing: (() => void) | null = null
  let unsubPreparePanel: (() => void) | null = null
  let unsubPanelPerformance: (() => void) | null = null
  let panelPreparingTimer: number | null = null
  let currentPanelRequestId: number | null = null
  let lastAppliedPanelRequestId: number | null = null

  function bumpDataVersion(): void {
    dataVersion.value += 1
  }

  function clearPanelPreparingTimer(): void {
    if (panelPreparingTimer !== null) {
      window.clearTimeout(panelPreparingTimer)
      panelPreparingTimer = null
    }
  }

  async function refreshHistoryItems(): Promise<void> {
    historyItems.value = await window.api.getClipItems(200, 0)
    bumpDataVersion()
  }

  async function refreshSourceApps(): Promise<void> {
    sourceApps.value = await window.api.getSourceApps()
  }

  async function refreshState(): Promise<void> {
    const state = await window.api.getClipboardState()
    paused.value = state.paused
  }

  async function refreshPasteStack(): Promise<void> {
    pasteStackState.value = await window.api.getPasteStackState()
  }

  function upsertHistoryItems(items: ClipItemSummary[]): void {
    if (items.length === 0) return
    const next = new Map(historyItems.value.map((item) => [item.id, item]))
    for (const item of items) {
      next.set(item.id, item)
    }
    historyItems.value = sortHistoryItems(Array.from(next.values()))
    bumpDataVersion()
  }

  function removeHistoryItems(ids: string[]): void {
    if (ids.length === 0) return
    const removed = new Set(ids)
    historyItems.value = historyItems.value.filter((item) => !removed.has(item.id))
    bumpDataVersion()
  }

  function recordPanelPerformanceMark(mark: PanelPerformanceMark): void {
    panelPerformanceMarks.value = [...panelPerformanceMarks.value.slice(-11), mark]
    console.debug('[panel-performance]', mark.name, mark)
  }

  function applyHistoryMutation(mutation: HistoryMutationEvent): void {
    switch (mutation.type) {
      case 'reset':
        historyItems.value = sortHistoryItems(mutation.items ?? [])
        if (mutation.sourceApps) {
          sourceApps.value = mutation.sourceApps
        }
        bumpDataVersion()
        break
      case 'upsert':
        upsertHistoryItems(mutation.items ?? [])
        if (mutation.sourceApps) {
          sourceApps.value = mutation.sourceApps
        }
        break
      case 'delete':
        removeHistoryItems(mutation.ids ?? [])
        if (mutation.sourceApps) {
          sourceApps.value = mutation.sourceApps
        }
        break
      case 'source-apps':
        if (mutation.sourceApps) {
          sourceApps.value = mutation.sourceApps
        }
        break
    }
  }

  async function refreshSummaryById(id: string): Promise<void> {
    const [item, apps] = await Promise.all([
      window.api.getClipItemSummary(id),
      window.api.getSourceApps()
    ])
    if (!item) return
    applyHistoryMutation({
      type: 'upsert',
      reason: 'update',
      items: [item],
      sourceApps: apps
    })
  }

  async function refreshAll(): Promise<void> {
    loading.value = true
    try {
      await Promise.all([
        refreshState(),
        refreshPasteStack(),
        refreshSourceApps(),
        refreshHistoryItems()
      ])
    } finally {
      loading.value = false
    }
  }

  function applyPanelSnapshot(snapshot: PanelSnapshot, requestId: number): void {
    paused.value = snapshot.paused
    historyItems.value = sortHistoryItems(snapshot.historyItems)
    sourceApps.value = snapshot.sourceApps
    pasteStackState.value = snapshot.pasteStackState
    bumpDataVersion()

    if (lastAppliedPanelRequestId !== requestId) {
      freshOpenSeq.value += 1
    }
    lastAppliedPanelRequestId = requestId
  }

  onMounted(() => {
    unsubPanelPreparing = window.api.onPanelPreparing(async (requestId) => {
      currentPanelRequestId = requestId
      prepareSeq.value += 1
      panelPreparing.value = false
      clearPanelPreparingTimer()
      panelPreparingTimer = window.setTimeout(() => {
        if (currentPanelRequestId !== requestId) return
        if (historyItems.value.length === 0 && !loading.value) {
          panelPreparing.value = true
        }
      }, 160)
    })

    unsubPreparePanel = window.api.onPreparePanelShow(async (requestId, snapshot) => {
      if (currentPanelRequestId !== null && requestId < currentPanelRequestId) return
      currentPanelRequestId = requestId
      clearPanelPreparingTimer()
      panelPreparing.value = false
      applyPanelSnapshot(snapshot, requestId)
      await nextTick()
    })

    unsubHistoryMutation = window.api.onHistoryMutation((mutation) => {
      applyHistoryMutation(mutation)
    })
    unsubPanelPerformance = window.api.onPanelPerformanceMark((mark) => {
      recordPanelPerformanceMark(mark)
    })
    unsubState = window.api.onClipStateChanged((state) => {
      paused.value = state.paused
    })
    unsubStack = window.api.onPasteStackChanged(() => {
      void refreshPasteStack()
    })
  })

  onBeforeUnmount(() => {
    unsubHistoryMutation?.()
    unsubState?.()
    unsubStack?.()
    unsubPanelPreparing?.()
    unsubPreparePanel?.()
    unsubPanelPerformance?.()
    clearPanelPreparingTimer()
  })

  return {
    historyItems,
    sourceApps,
    paused,
    loading,
    panelPreparing,
    pasteStackState,
    panelPerformanceMarks,
    dataVersion,
    prepareSeq,
    freshOpenSeq,
    refreshState,
    refreshAll,
    refreshPasteStack,
    refreshSummaryById
  }
}
