import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  AppIconTarget,
  ClipItem,
  ClipItemSummary,
  CreateClipItemInput,
  HistoryMutationEvent,
  PanelSnapshot,
  PanelPerformanceMark,
  PreviewOpenMode,
  SettingsSnapshot,
  SettingsTabId,
  PasteStackState,
  SearchFilters,
  SyncState,
  SourceAppSummary
} from '../shared/types'

const api = {
  // 数据库操作
  getClipItems: (limit?: number, offset?: number): Promise<ClipItemSummary[]> =>
    ipcRenderer.invoke('db:getClipItems', limit, offset),
  getClipItemSummary: (id: string): Promise<ClipItemSummary | null> =>
    ipcRenderer.invoke('db:getClipItemSummary', id),
  getClipItem: (id: string): Promise<ClipItem | null> => ipcRenderer.invoke('db:getClipItem', id),
  createClipItem: (input: CreateClipItemInput): Promise<string> =>
    ipcRenderer.invoke('db:createClipItem', input),
  updateClipItemTitle: (id: string, title: string | null): Promise<void> =>
    ipcRenderer.invoke('db:updateClipItemTitle', id, title),
  updateClipItemText: (id: string, text: string): Promise<void> =>
    ipcRenderer.invoke('db:updateClipItemText', id, text),
  updateClipItemLink: (id: string, url: string): Promise<void> =>
    ipcRenderer.invoke('db:updateClipItemLink', id, url),
  updateClipItemColor: (id: string, color: string): Promise<void> =>
    ipcRenderer.invoke('db:updateClipItemColor', id, color),
  updateClipItemImage: (
    id: string,
    payload: { contentBase64: string; thumbnailBase64?: string | null }
  ): Promise<void> => ipcRenderer.invoke('db:updateClipItemImage', id, payload),
  extractImageOcr: (
    id: string,
    mode: 'copy' | 'create'
  ): Promise<{ text: string; createdItemId: string | null }> =>
    ipcRenderer.invoke('db:extractImageOcr', id, mode),
  deleteClipItem: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteClipItem', id),
  deleteClipItems: (ids: string[]): Promise<void> => ipcRenderer.invoke('db:deleteClipItems', ids),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('db:clearHistory'),
  searchClipItems: (filters: SearchFilters): Promise<ClipItemSummary[]> =>
    ipcRenderer.invoke('db:searchClipItems', filters),
  getSourceApps: (): Promise<SourceAppSummary[]> => ipcRenderer.invoke('db:getSourceApps'),

  // 剪贴板
  getClipboardState: (): Promise<{ paused: boolean }> => ipcRenderer.invoke('clip:getState'),
  setClipboardPaused: (paused: boolean): Promise<void> =>
    ipcRenderer.invoke('clip:setPaused', paused),
  pasteClipItem: (id: string, options?: { plainText?: boolean }): Promise<void> =>
    ipcRenderer.invoke('clip:pasteItem', id, options),
  pasteClipItemAsFile: (id: string): Promise<void> =>
    ipcRenderer.invoke('clip:pasteItemAsFile', id),
  copyClipItem: (id: string, options?: { plainText?: boolean }): Promise<void> =>
    ipcRenderer.invoke('clip:copyItem', id, options),
  copyClipItemsAsText: (ids: string[], separator?: string): Promise<number> =>
    ipcRenderer.invoke('clip:copyItemsAsText', ids, separator),
  startImageDrag: (id: string): void => ipcRenderer.send('clip:startImageDrag', id),
  onClipItemsChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('clip:itemsChanged', listener)
    return () => ipcRenderer.removeListener('clip:itemsChanged', listener)
  },
  onClipStateChanged: (callback: (state: { paused: boolean }) => void): (() => void) => {
    const listener = (_event, state: { paused: boolean }): void => callback(state)
    ipcRenderer.on('clip:stateChanged', listener)
    return () => ipcRenderer.removeListener('clip:stateChanged', listener)
  },
  onHistoryMutation: (callback: (mutation: HistoryMutationEvent) => void): (() => void) => {
    const listener = (_event, mutation: HistoryMutationEvent): void => callback(mutation)
    ipcRenderer.on('history:mutation', listener)
    return () => ipcRenderer.removeListener('history:mutation', listener)
  },
  onPanelPreparing: (callback: (requestId: number) => void | Promise<void>): (() => void) => {
    const listener = (_event, requestId: number): void => {
      void callback(requestId)
    }
    ipcRenderer.on('window:panelPreparing', listener)
    return () => ipcRenderer.removeListener('window:panelPreparing', listener)
  },
  onPreparePanelShow: (
    callback: (requestId: number, snapshot: PanelSnapshot) => void | Promise<void>
  ): (() => void) => {
    const listener = (_event, requestId: number, snapshot: PanelSnapshot): void => {
      void callback(requestId, snapshot)
    }
    ipcRenderer.on('window:preparePanelShow', listener)
    return () => ipcRenderer.removeListener('window:preparePanelShow', listener)
  },
  onPanelPerformanceMark: (callback: (mark: PanelPerformanceMark) => void): (() => void) => {
    const listener = (_event, mark: PanelPerformanceMark): void => callback(mark)
    ipcRenderer.on('window:panelPerformanceMark', listener)
    return () => ipcRenderer.removeListener('window:panelPerformanceMark', listener)
  },
  getPasteStackState: (): Promise<PasteStackState> => ipcRenderer.invoke('clip:getStackState'),
  setPasteStackEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('clip:setStackEnabled', enabled),
  clearPasteStack: (): Promise<void> => ipcRenderer.invoke('clip:clearStack'),
  enqueuePasteStackItems: (ids: string[]): Promise<number> =>
    ipcRenderer.invoke('clip:enqueueStackItems', ids),
  removePasteStackEntry: (entryId: string): Promise<void> =>
    ipcRenderer.invoke('clip:removeStackEntry', entryId),
  reorderPasteStack: (entryIds: string[]): Promise<void> =>
    ipcRenderer.invoke('clip:reorderStack', entryIds),
  pastePasteStack: (): Promise<void> => ipcRenderer.invoke('clip:pasteStack'),
  onPasteStackChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('clip:stackChanged', listener)
    return () => ipcRenderer.removeListener('clip:stackChanged', listener)
  },

  // 窗口操作
  hideWindow: (): void => ipcRenderer.send('window:hide'),
  showSettings: (options?: { tab?: SettingsTabId }): void =>
    ipcRenderer.send('window:showSettings', options),
  showPreview: (itemId: string, options?: { mode?: PreviewOpenMode }): void =>
    ipcRenderer.send('window:showPreview', itemId, options),
  closeCurrentWindow: (): void => ipcRenderer.send('window:closeSelf'),
  quitApp: (): void => ipcRenderer.send('app:quit'),
  onPreviewItemRequested: (
    callback: (request: { itemId: string; mode: PreviewOpenMode }) => void
  ): (() => void) => {
    const listener = (_event, request: { itemId: string; mode: PreviewOpenMode }): void =>
      callback(request)
    ipcRenderer.on('window:previewItem', listener)
    return () => ipcRenderer.removeListener('window:previewItem', listener)
  },
  onSettingsTabRequested: (callback: (tab: SettingsTabId) => void): (() => void) => {
    const listener = (_event, tab: SettingsTabId): void => callback(tab)
    ipcRenderer.on('window:settingsTab', listener)
    return () => ipcRenderer.removeListener('window:settingsTab', listener)
  },

  // 系统权限
  getAccessibilityPermission: (): Promise<boolean> =>
    ipcRenderer.invoke('system:getAccessibilityPermission'),
  requestAccessibilityPermission: (): void =>
    ipcRenderer.send('system:requestAccessibilityPermission'),
  getSystemPermissions: () => ipcRenderer.invoke('system:getPermissions'),
  openPrivacySettings: (kind: 'accessibility' | 'screen'): Promise<void> =>
    ipcRenderer.invoke('system:openPrivacySettings', kind),
  getAppIcons: (targets: AppIconTarget[]): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('system:getAppIcons', targets),
  quickLookFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('system:quickLookFile', filePath),

  // 设置与同步
  getSettingsSnapshot: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:getSnapshot'),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', settings),
  triggerSyncNow: (): Promise<SyncState> => ipcRenderer.invoke('sync:now'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onSettingsChanged: (callback: (snapshot: SettingsSnapshot) => void): (() => void) => {
    const listener = (_event, snapshot: SettingsSnapshot): void => callback(snapshot)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
