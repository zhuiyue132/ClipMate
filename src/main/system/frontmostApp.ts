import { execFileSync } from 'node:child_process'

export interface FrontmostAppInfo {
  bundleId: string | null
  name: string | null
}

function safeTrim(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getFrontmostAppInfo(): FrontmostAppInfo {
  try {
    const output = execFileSync(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get bundle identifier of first application process whose frontmost is true',
        '-e',
        'tell application "System Events" to get name of first application process whose frontmost is true'
      ],
      { encoding: 'utf8' }
    )

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
      execFileSync('osascript', ['-e', `tell application id "${target.bundleId}" to activate`], {
        encoding: 'utf8'
      })
      return
    }

    if (target.name) {
      execFileSync('osascript', ['-e', `tell application "${target.name}" to activate`], {
        encoding: 'utf8'
      })
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
