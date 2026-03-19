import { globalShortcut } from 'electron'
import type { AppSettings, ShortcutAction, ShortcutRegistrationState } from '../shared/types'

interface ShortcutCallbacks {
  togglePanel: () => void
  quickPasteLatest: () => void
  pasteLatestPlainText: () => void
  togglePasteStack: () => void
  togglePauseCapture: () => void
}

const LOCAL_SHORTCUTS = new Set<ShortcutAction>(['focusSearch', 'newItem'])
const PASTE_STACK_ACCELERATOR = 'CommandOrControl+V'

let shortcutState: ShortcutRegistrationState = createEmptyShortcutState()
let pasteStackPasteHandler: (() => void) | null = null
let pasteStackPasteShortcutEnabled = false
let pasteStackPasteShortcutSuspendDepth = 0

function createEmptyShortcutState(): ShortcutRegistrationState {
  return {
    togglePanel: { scope: 'global', registered: false, accelerator: '' },
    quickPasteLatest: { scope: 'global', registered: false, accelerator: '' },
    pasteLatestPlainText: { scope: 'global', registered: false, accelerator: '' },
    togglePasteStack: { scope: 'global', registered: false, accelerator: '' },
    togglePauseCapture: { scope: 'global', registered: false, accelerator: '' },
    focusSearch: { scope: 'local', registered: true, accelerator: '' },
    newItem: { scope: 'local', registered: true, accelerator: '' }
  }
}

export function registerGlobalShortcuts(
  settings: AppSettings,
  callbacks: ShortcutCallbacks
): ShortcutRegistrationState {
  globalShortcut.unregisterAll()

  const nextState = createEmptyShortcutState()
  const shortcutEntries: Array<[keyof ShortcutCallbacks, string]> = [
    ['togglePanel', settings.shortcuts.togglePanel],
    ['quickPasteLatest', settings.shortcuts.quickPasteLatest],
    ['pasteLatestPlainText', settings.shortcuts.pasteLatestPlainText],
    ['togglePasteStack', settings.shortcuts.togglePasteStack],
    ['togglePauseCapture', settings.shortcuts.togglePauseCapture]
  ]

  for (const [action, accelerator] of shortcutEntries) {
    nextState[action] = {
      scope: 'global',
      accelerator,
      registered: false
    }

    if (!accelerator) continue

    try {
      nextState[action].registered = globalShortcut.register(accelerator, callbacks[action])
    } catch {
      nextState[action].registered = false
    }
  }

  for (const action of LOCAL_SHORTCUTS) {
    nextState[action] = {
      scope: 'local',
      accelerator: settings.shortcuts[action],
      registered: Boolean(settings.shortcuts[action])
    }
  }

  shortcutState = nextState
  return shortcutState
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

export function getShortcutRegistrationState(): ShortcutRegistrationState {
  return shortcutState
}

export function configurePasteStackPasteShortcut(handler: () => void): void {
  pasteStackPasteHandler = handler
}

function applyPasteStackPasteShortcutRegistration(): boolean {
  globalShortcut.unregister(PASTE_STACK_ACCELERATOR)

  if (
    !pasteStackPasteShortcutEnabled ||
    !pasteStackPasteHandler ||
    pasteStackPasteShortcutSuspendDepth > 0
  ) {
    return false
  }

  try {
    return globalShortcut.register(PASTE_STACK_ACCELERATOR, pasteStackPasteHandler)
  } catch {
    return false
  }
}

export function syncPasteStackPasteShortcut(enabled: boolean): boolean {
  pasteStackPasteShortcutEnabled = enabled
  return applyPasteStackPasteShortcutRegistration()
}

export async function withPasteStackPasteShortcutSuspended<T>(
  fn: () => Promise<T> | T
): Promise<T> {
  pasteStackPasteShortcutSuspendDepth += 1
  applyPasteStackPasteShortcutRegistration()

  try {
    return await fn()
  } finally {
    pasteStackPasteShortcutSuspendDepth = Math.max(0, pasteStackPasteShortcutSuspendDepth - 1)
    applyPasteStackPasteShortcutRegistration()
  }
}
