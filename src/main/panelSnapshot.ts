import type { PanelSnapshot } from '../shared/types'
import { getPasteStackState, isClipboardPaused } from './clipboard'
import { getClipItems, getSourceAppSummaries } from './database/clipItems'

export function buildPanelSnapshot(): PanelSnapshot {
  return {
    paused: isClipboardPaused(),
    historyItems: getClipItems(200, 0),
    sourceApps: getSourceAppSummaries(),
    pasteStackState: getPasteStackState()
  }
}
