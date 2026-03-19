import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  AppSettings,
  SettingsSnapshot,
  ShortcutRegistrationState,
  SyncState,
  UpdateState
} from '../../shared/types'
import { getDbPath } from '../database'

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtLogin: false,
    theme: 'system',
    updateFeedUrl: null
  },
  storage: {
    maxItems: 500,
    maxAgeDays: 30
  },
  privacy: {
    excludedApps: [],
    hideOnScreenShare: true,
    ignoreConcealed: true
  },
  shortcuts: {
    togglePanel: 'CommandOrControl+Shift+V',
    quickPasteLatest: 'CommandOrControl+Shift+Option+V',
    pasteLatestPlainText: 'CommandOrControl+Shift+Option+P',
    togglePasteStack: 'CommandOrControl+Shift+S',
    pasteStackPaste: 'CommandOrControl+V',
    togglePauseCapture: 'CommandOrControl+Shift+P',
    focusSearch: 'CommandOrControl+F',
    newTextItem: 'CommandOrControl+N',
    newLinkItem: 'CommandOrControl+Shift+N'
  },
  sync: {
    enabled: false
  }
}

let settings = DEFAULT_SETTINGS
const listeners = new Set<(settings: AppSettings) => void>()

function normalizeExcludedApps(
  input: AppSettings['privacy']['excludedApps']
): AppSettings['privacy']['excludedApps'] {
  const unique = new Map<string, { bundleId: string; name: string | null }>()

  for (const item of input ?? []) {
    const bundleId = item?.bundleId?.trim()
    if (!bundleId) continue

    unique.set(bundleId, {
      bundleId,
      name: item?.name?.trim() || null
    })
  }

  return Array.from(unique.values()).sort((left, right) =>
    left.bundleId.localeCompare(right.bundleId)
  )
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const next = input ?? {}

  return {
    general: {
      launchAtLogin: Boolean(next.general?.launchAtLogin ?? DEFAULT_SETTINGS.general.launchAtLogin),
      theme:
        next.general?.theme === 'light' || next.general?.theme === 'dark'
          ? next.general.theme
          : DEFAULT_SETTINGS.general.theme,
      updateFeedUrl: next.general?.updateFeedUrl?.trim() || null
    },
    storage: {
      maxItems:
        typeof next.storage?.maxItems === 'number' && next.storage.maxItems > 0
          ? Math.round(next.storage.maxItems)
          : next.storage?.maxItems === null
            ? null
            : DEFAULT_SETTINGS.storage.maxItems,
      maxAgeDays:
        typeof next.storage?.maxAgeDays === 'number' && next.storage.maxAgeDays > 0
          ? Math.round(next.storage.maxAgeDays)
          : next.storage?.maxAgeDays === null
            ? null
            : DEFAULT_SETTINGS.storage.maxAgeDays
    },
    privacy: {
      excludedApps: normalizeExcludedApps(
        next.privacy?.excludedApps ?? DEFAULT_SETTINGS.privacy.excludedApps
      ),
      hideOnScreenShare: Boolean(
        next.privacy?.hideOnScreenShare ?? DEFAULT_SETTINGS.privacy.hideOnScreenShare
      ),
      ignoreConcealed: Boolean(
        next.privacy?.ignoreConcealed ?? DEFAULT_SETTINGS.privacy.ignoreConcealed
      )
    },
    shortcuts: {
      togglePanel: next.shortcuts?.togglePanel?.trim() || DEFAULT_SETTINGS.shortcuts.togglePanel,
      quickPasteLatest:
        next.shortcuts?.quickPasteLatest?.trim() || DEFAULT_SETTINGS.shortcuts.quickPasteLatest,
      pasteLatestPlainText:
        next.shortcuts?.pasteLatestPlainText?.trim() ||
        DEFAULT_SETTINGS.shortcuts.pasteLatestPlainText,
      togglePasteStack:
        next.shortcuts?.togglePasteStack?.trim() || DEFAULT_SETTINGS.shortcuts.togglePasteStack,
      pasteStackPaste:
        next.shortcuts?.pasteStackPaste?.trim() || DEFAULT_SETTINGS.shortcuts.pasteStackPaste,
      togglePauseCapture:
        next.shortcuts?.togglePauseCapture?.trim() || DEFAULT_SETTINGS.shortcuts.togglePauseCapture,
      focusSearch: next.shortcuts?.focusSearch?.trim() || DEFAULT_SETTINGS.shortcuts.focusSearch,
      newTextItem: next.shortcuts?.newTextItem?.trim() || DEFAULT_SETTINGS.shortcuts.newTextItem,
      newLinkItem: next.shortcuts?.newLinkItem?.trim() || DEFAULT_SETTINGS.shortcuts.newLinkItem
    },
    sync: {
      enabled: Boolean(next.sync?.enabled ?? DEFAULT_SETTINGS.sync.enabled)
    }
  }
}

export function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function writeSettingsFile(next: AppSettings): void {
  const filePath = getSettingsPath()
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(next, null, 2))
}

export function initSettingsStore(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    settings = sanitizeSettings(DEFAULT_SETTINGS)
    writeSettingsFile(settings)
    return settings
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AppSettings>
    settings = sanitizeSettings(parsed)
  } catch {
    settings = sanitizeSettings(DEFAULT_SETTINGS)
  }

  writeSettingsFile(settings)
  return settings
}

export function getSettings(): AppSettings {
  return settings
}

export function updateSettings(next: AppSettings): AppSettings {
  settings = sanitizeSettings(next)
  writeSettingsFile(settings)

  for (const listener of listeners) {
    listener(settings)
  }

  return settings
}

export function subscribeSettings(listener: (settings: AppSettings) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function createSettingsSnapshot(options: {
  syncState: SyncState
  shortcutState: ShortcutRegistrationState
  updateState: UpdateState
}): SettingsSnapshot {
  return {
    settings,
    syncState: options.syncState,
    shortcutState: options.shortcutState,
    updateState: options.updateState,
    appVersion: app.getVersion(),
    dbPath: getDbPath()
  }
}
