import { execFileSync } from 'node:child_process'

export interface FrontmostAppInfo {
  bundleId: string | null
  name: string | null
}

function safeTrim(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const FRONTMOST_APP_SCRIPT = `
ObjC.import('AppKit')
const app = $.NSWorkspace.sharedWorkspace.frontmostApplication
if (!app) {
  ''
} else {
  [
    ObjC.unwrap(app.bundleIdentifier) || '',
    ObjC.unwrap(app.localizedName) || ''
  ].join('\\n')
}
`

export function getFrontmostAppInfo(): FrontmostAppInfo {
  try {
    const output = execFileSync('osascript', ['-l', 'JavaScript', '-e', FRONTMOST_APP_SCRIPT], {
      encoding: 'utf8'
    })

    const [bundleIdLine, nameLine] = output.split('\n')
    return {
      bundleId: safeTrim(bundleIdLine),
      name: safeTrim(nameLine)
    }
  } catch {
    return { bundleId: null, name: null }
  }
}

export function activateApp(target: FrontmostAppInfo): void {
  try {
    if (target.bundleId) {
      execFileSync('open', ['-b', target.bundleId], { encoding: 'utf8' })
      return
    }

    if (target.name) {
      execFileSync('open', ['-a', target.name], { encoding: 'utf8' })
    }
  } catch {
    // ignore
  }
}

export function sendCmdVKeystroke(): void {
  try {
    execFileSync(
      'osascript',
      [
        '-e',
        'delay 0.05',
        '-e',
        'tell application "System Events" to keystroke "v" using {command down}'
      ],
      { encoding: 'utf8' }
    )
  } catch {
    // ignore
  }
}
