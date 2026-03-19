import { ipcMain, shell, systemPreferences } from 'electron'
import {
  getApplicationIconDataUrl,
  getAppIconCacheKey,
  type AppIconTarget
} from '../system/appIcons'
import { quickLookFile } from '../system/quickLook'

function getScreenPermissionStatus():
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unknown' {
  if (process.platform !== 'darwin') return 'unknown'

  try {
    const status = systemPreferences.getMediaAccessStatus('screen')
    switch (status) {
      case 'granted':
      case 'denied':
      case 'restricted':
      case 'not-determined':
        return status
      default:
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

async function openPrivacySettings(kind: 'accessibility' | 'screen'): Promise<void> {
  if (process.platform !== 'darwin') return

  const url =
    kind === 'accessibility'
      ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

  try {
    await shell.openExternal(url)
  } catch {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security')
  }
}

export function registerSystemIpcHandlers(): void {
  ipcMain.handle('system:getAccessibilityPermission', () => {
    return process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false)
      : false
  })

  ipcMain.on('system:requestAccessibilityPermission', () => {
    if (process.platform !== 'darwin') return
    systemPreferences.isTrustedAccessibilityClient(true)
  })

  ipcMain.handle('system:getPermissions', () => {
    return {
      accessibility:
        process.platform === 'darwin'
          ? systemPreferences.isTrustedAccessibilityClient(false)
          : false,
      screen: getScreenPermissionStatus()
    }
  })

  ipcMain.handle('system:openPrivacySettings', async (_event, kind: 'accessibility' | 'screen') => {
    await openPrivacySettings(kind)
  })

  ipcMain.handle('system:getAppIcons', async (_event, targets: AppIconTarget[]) => {
    const uniqueTargets = new Map<string, AppIconTarget>()
    for (const target of targets ?? []) {
      if (!target?.bundleId && !target?.name) continue

      const key = getAppIconCacheKey(target)
      if (!uniqueTargets.has(key)) {
        uniqueTargets.set(key, target)
      }
    }

    const entries = await Promise.all(
      Array.from(uniqueTargets.entries()).map(async ([key, target]) => {
        const icon = await getApplicationIconDataUrl(target)
        return [key, icon] as const
      })
    )

    return Object.fromEntries(entries)
  })

  ipcMain.handle('system:quickLookFile', async (_event, filePath: string) => {
    await quickLookFile(filePath)
  })
}
