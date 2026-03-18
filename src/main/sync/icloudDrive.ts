import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ClipItem, SyncState } from '../../shared/types'
import { getClipItemsForSync, upsertClipItems } from '../database/clipItems'

interface SerializedClipItem extends Omit<ClipItem, 'thumbnail'> {
  thumbnail: string | null
}

interface SyncPayload {
  version: 1
  updatedAt: number
  items: SerializedClipItem[]
}

const SYNC_FILE_NAME = 'clipmate-history.json'
const SYNC_INTERVAL_MS = 45_000

let syncTimer: NodeJS.Timeout | null = null
let running = false
let state: SyncState = {
  enabled: false,
  status: 'disabled',
  lastSyncAt: null,
  lastError: null,
  path: null
}
const listeners = new Set<(state: SyncState) => void>()

function emitState(): void {
  for (const listener of listeners) {
    listener(state)
  }
}

function setState(partial: Partial<SyncState>): void {
  state = {
    ...state,
    ...partial
  }
  emitState()
}

function serializeItem(item: ClipItem): SerializedClipItem {
  const thumbnail =
    item.thumbnail && item.thumbnail.length > 0
      ? Buffer.from(item.thumbnail).toString('base64')
      : null

  return {
    ...item,
    thumbnail
  }
}

function deserializeItem(item: SerializedClipItem): ClipItem {
  return {
    ...item,
    thumbnail: item.thumbnail ? Buffer.from(item.thumbnail, 'base64') : null
  }
}

function resolveICloudDriveDir(): string | null {
  if (process.platform !== 'darwin') return null
  const homePath = app.getPath('home')
  const dirPath = path.join(homePath, 'Library/Mobile Documents/com~apple~CloudDocs/ClipMate')
  const parentPath = path.dirname(dirPath)

  if (!existsSync(parentPath)) {
    return null
  }

  mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function getSyncFilePath(): string | null {
  const dirPath = resolveICloudDriveDir()
  return dirPath ? path.join(dirPath, SYNC_FILE_NAME) : null
}

function readRemoteItems(filePath: string): ClipItem[] {
  if (!existsSync(filePath)) return []

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<SyncPayload>
    const items = Array.isArray(raw.items) ? raw.items : []
    return items.map((item) => deserializeItem(item as SerializedClipItem))
  } catch {
    return []
  }
}

function mergeItems(localItems: ClipItem[], remoteItems: ClipItem[]): ClipItem[] {
  const merged = new Map<string, ClipItem>()

  for (const item of [...remoteItems, ...localItems]) {
    const current = merged.get(item.id)
    if (!current || item.updated_at >= current.updated_at) {
      merged.set(item.id, item)
    }
  }

  return Array.from(merged.values()).sort((left, right) => right.created_at - left.created_at)
}

function writeRemoteItems(filePath: string, items: ClipItem[]): void {
  const payload: SyncPayload = {
    version: 1,
    updatedAt: Date.now(),
    items: items.map((item) => serializeItem(item))
  }

  writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

export async function performSyncNow(): Promise<SyncState> {
  if (running) return state

  const filePath = getSyncFilePath()
  if (!state.enabled) {
    setState({
      status: 'disabled',
      path: filePath,
      lastError: null
    })
    return state
  }

  if (!filePath) {
    setState({
      status: 'unavailable',
      path: null,
      lastError: '未检测到 iCloud Drive 目录'
    })
    return state
  }

  running = true
  setState({
    status: 'syncing',
    path: filePath,
    lastError: null
  })

  try {
    const localItems = getClipItemsForSync()
    const remoteItems = readRemoteItems(filePath)
    const mergedItems = mergeItems(localItems, remoteItems)

    upsertClipItems(mergedItems)
    writeRemoteItems(filePath, mergedItems)

    setState({
      status: 'idle',
      lastSyncAt: Date.now(),
      lastError: null,
      path: filePath
    })
  } catch (error) {
    setState({
      status: 'error',
      path: filePath,
      lastError: error instanceof Error ? error.message : '同步失败'
    })
  } finally {
    running = false
  }

  return state
}

export function configureICloudSync(enabled: boolean): void {
  state = {
    ...state,
    enabled
  }

  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }

  if (!enabled) {
    setState({
      enabled,
      status: 'disabled',
      lastError: null,
      path: getSyncFilePath()
    })
    return
  }

  setState({
    enabled,
    status: 'idle',
    lastError: null,
    path: getSyncFilePath()
  })

  syncTimer = setInterval(() => {
    void performSyncNow()
  }, SYNC_INTERVAL_MS)

  void performSyncNow()
}

export function stopICloudSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }

  setState({
    enabled: false,
    status: 'disabled'
  })
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
