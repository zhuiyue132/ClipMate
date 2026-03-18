import { ipcMain, systemPreferences } from 'electron'
import {
  getApplicationIconDataUrl,
  getAppIconCacheKey,
  type AppIconTarget
} from '../system/appIcons'

export function registerSystemIpcHandlers(): void {
  ipcMain.handle('system:getAccessibilityPermission', () => {
    return systemPreferences.isTrustedAccessibilityClient(false)
  })

  ipcMain.on('system:requestAccessibilityPermission', () => {
    systemPreferences.isTrustedAccessibilityClient(true)
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
}
