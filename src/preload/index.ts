import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ClipItem, Pinboard } from '../shared/types'

const api = {
  // 数据库操作
  getClipItems: (limit?: number, offset?: number): Promise<ClipItem[]> =>
    ipcRenderer.invoke('db:getClipItems', limit, offset),
  getClipItem: (id: string): Promise<ClipItem | null> => ipcRenderer.invoke('db:getClipItem', id),
  deleteClipItem: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteClipItem', id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('db:clearHistory'),

  // Pinboard 操作
  getPinboards: (): Promise<Pinboard[]> => ipcRenderer.invoke('db:getPinboards'),
  createPinboard: (name: string, color: string): Promise<Pinboard> =>
    ipcRenderer.invoke('db:createPinboard', name, color),
  deletePinboard: (id: string): Promise<void> => ipcRenderer.invoke('db:deletePinboard', id),

  // 窗口操作
  hideWindow: (): void => ipcRenderer.send('window:hide'),
  showSettings: (): void => ipcRenderer.send('window:showSettings'),

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
