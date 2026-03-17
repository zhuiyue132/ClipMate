import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ClipItem, Pinboard, SearchFilters, SourceAppSummary } from '../shared/types'

const api = {
  // 数据库操作
  getClipItems: (limit?: number, offset?: number): Promise<ClipItem[]> =>
    ipcRenderer.invoke('db:getClipItems', limit, offset),
  getClipItem: (id: string): Promise<ClipItem | null> => ipcRenderer.invoke('db:getClipItem', id),
  deleteClipItem: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteClipItem', id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('db:clearHistory'),
  searchClipItems: (filters: SearchFilters): Promise<ClipItem[]> =>
    ipcRenderer.invoke('db:searchClipItems', filters),
  getSourceApps: (): Promise<SourceAppSummary[]> => ipcRenderer.invoke('db:getSourceApps'),

  // 剪贴板
  getClipboardState: (): Promise<{ paused: boolean }> => ipcRenderer.invoke('clip:getState'),
  setClipboardPaused: (paused: boolean): Promise<void> =>
    ipcRenderer.invoke('clip:setPaused', paused),
  pasteClipItem: (id: string, options?: { plainText?: boolean }): Promise<void> =>
    ipcRenderer.invoke('clip:pasteItem', id, options),
  copyClipItem: (id: string, options?: { plainText?: boolean }): Promise<void> =>
    ipcRenderer.invoke('clip:copyItem', id, options),
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

  // Pinboard 操作
  getPinboards: (): Promise<Pinboard[]> => ipcRenderer.invoke('db:getPinboards'),
  createPinboard: (name: string, color: string): Promise<Pinboard> =>
    ipcRenderer.invoke('db:createPinboard', name, color),
  deletePinboard: (id: string): Promise<void> => ipcRenderer.invoke('db:deletePinboard', id),
  renamePinboard: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('db:renamePinboard', id, name),
  getPinboardItems: (pinboardId: string): Promise<ClipItem[]> =>
    ipcRenderer.invoke('db:getPinboardItems', pinboardId),
  addItemToPinboard: (pinboardId: string, itemId: string): Promise<void> =>
    ipcRenderer.invoke('db:addItemToPinboard', pinboardId, itemId),
  removeItemFromPinboard: (pinboardId: string, itemId: string): Promise<void> =>
    ipcRenderer.invoke('db:removeItemFromPinboard', pinboardId, itemId),
  reorderPinboardItems: (pinboardId: string, itemIds: string[]): Promise<void> =>
    ipcRenderer.invoke('db:reorderPinboardItems', pinboardId, itemIds),

  // 窗口操作
  hideWindow: (): void => ipcRenderer.send('window:hide'),
  showSettings: (): void => ipcRenderer.send('window:showSettings'),
  quitApp: (): void => ipcRenderer.send('app:quit'),

  // 系统权限
  getAccessibilityPermission: (): Promise<boolean> =>
    ipcRenderer.invoke('system:getAccessibilityPermission'),
  requestAccessibilityPermission: (): void =>
    ipcRenderer.send('system:requestAccessibilityPermission')
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
