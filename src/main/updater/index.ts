import { app } from 'electron'
import { MacUpdater } from 'electron-updater'
import type { AppUpdater, UpdateDownloadedEvent, UpdateInfo, ProgressInfo } from 'electron-updater'
import type { UpdateState } from '../../shared/types'

let updater: AppUpdater | null = null
let configuredFeedUrl: string | null = null
let state: UpdateState = {
  status: 'unavailable',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: null,
  message: '未配置更新源'
}
const listeners = new Set<(state: UpdateState) => void>()

function emitState(): void {
  for (const listener of listeners) {
    listener(state)
  }
}

function setState(partial: Partial<UpdateState>): void {
  state = {
    ...state,
    ...partial,
    currentVersion: app.getVersion()
  }
  emitState()
}

function updateAvailable(info: UpdateInfo): void {
  setState({
    status: 'available',
    availableVersion: info.version,
    progress: null,
    message: '发现新版本'
  })
}

function updateDownloaded(info: UpdateDownloadedEvent): void {
  setState({
    status: 'downloaded',
    availableVersion: info.version,
    progress: 100,
    message: '更新已下载，重启后安装'
  })
}

function resolveFeedUrl(): string | null {
  return configuredFeedUrl || process.env['CLIPMATE_UPDATE_URL']?.trim() || null
}

export function configureAutoUpdater(feedUrl: string | null | undefined): void {
  const nextFeedUrl = feedUrl?.trim() || null
  if (configuredFeedUrl === nextFeedUrl) return

  configuredFeedUrl = nextFeedUrl
  updater = null
  setState({
    status: 'unavailable',
    availableVersion: null,
    progress: null,
    message: nextFeedUrl ? '更新源已更新' : '未配置更新源'
  })
}

export function initAutoUpdater(): void {
  if (updater) return

  const feedUrl = resolveFeedUrl()
  if (!app.isPackaged) {
    setState({
      status: 'unavailable',
      message: '仅打包版本支持检查更新'
    })
    return
  }

  if (!feedUrl) {
    setState({
      status: 'unavailable',
      message: '请在设置中填写更新源 URL'
    })
    return
  }

  updater = new MacUpdater({
    provider: 'generic',
    url: feedUrl,
    channel: 'latest'
  })
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true

  updater.on('checking-for-update', () => {
    setState({
      status: 'checking',
      progress: null,
      message: '正在检查更新…'
    })
  })

  updater.on('update-available', (info) => {
    updateAvailable(info)
  })

  updater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      availableVersion: null,
      progress: null,
      message: '当前已是最新版本'
    })
  })

  updater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      status: 'downloading',
      progress: progress.percent,
      message: `正在下载更新 ${Math.round(progress.percent)}%`
    })
  })

  updater.on('update-downloaded', (info) => {
    updateDownloaded(info)
  })

  updater.on('error', (error) => {
    setState({
      status: 'error',
      progress: null,
      message: error?.message || '检查更新失败'
    })
  })

  setState({
    status: 'idle',
    message: '可检查更新'
  })
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updater) {
    initAutoUpdater()
  }

  if (!updater) return state

  await updater.checkForUpdates()
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updater) return state
  await updater.downloadUpdate()
  return state
}

export function installUpdate(): void {
  if (!updater) return
  updater.quitAndInstall(false, true)
}

export function getUpdateState(): UpdateState {
  return state
}

export function subscribeUpdateState(listener: (state: UpdateState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
