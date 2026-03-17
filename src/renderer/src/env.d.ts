/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '../../shared/types'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const component: DefineComponent<{}, {}, unknown>
  export default component
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcApi
  }
}
