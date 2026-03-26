import { BrowserWindow } from 'electron'
import type {
  ClipItemSummary,
  HistoryMutationEvent,
  HistoryMutationReason,
  PanelPerformanceMark,
  SourceAppSummary
} from '../shared/types'

export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  }
}

export function broadcastHistoryMutation(mutation: HistoryMutationEvent): void {
  broadcastToAllWindows('history:mutation', mutation)
}

export function broadcastHistoryReset(
  items: ClipItemSummary[],
  sourceApps: SourceAppSummary[],
  reason: HistoryMutationReason = 'reset'
): void {
  broadcastHistoryMutation({
    type: 'reset',
    reason,
    items,
    sourceApps
  })
}

export function broadcastHistoryUpsert(
  items: ClipItemSummary[],
  sourceApps?: SourceAppSummary[],
  reason: HistoryMutationReason = 'update'
): void {
  if (items.length === 0) return
  broadcastHistoryMutation({
    type: 'upsert',
    reason,
    items,
    sourceApps
  })
}

export function broadcastHistoryDelete(
  ids: string[],
  sourceApps?: SourceAppSummary[],
  reason: HistoryMutationReason = 'delete'
): void {
  if (ids.length === 0) return
  broadcastHistoryMutation({
    type: 'delete',
    reason,
    ids,
    sourceApps
  })
}

export function broadcastHistorySourceApps(
  sourceApps: SourceAppSummary[],
  reason: HistoryMutationReason = 'update'
): void {
  broadcastHistoryMutation({
    type: 'source-apps',
    reason,
    sourceApps
  })
}

export function broadcastClipStateChanged(paused: boolean): void {
  broadcastToAllWindows('clip:stateChanged', { paused })
}

export function broadcastPasteStackChanged(): void {
  broadcastToAllWindows('clip:stackChanged')
}

export function broadcastPanelPerformanceMark(mark: PanelPerformanceMark): void {
  broadcastToAllWindows('window:panelPerformanceMark', mark)
}
