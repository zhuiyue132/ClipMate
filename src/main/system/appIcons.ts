import { app } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

export interface AppIconTarget {
  bundleId: string | null
  name: string | null
}

const execFileAsync = promisify(execFile)
const appPathCache = new Map<string, string | null>()
const appIconCache = new Map<string, string | null>()
const appIconInFlight = new Map<string, Promise<string | null>>()
const bundleIconPathCache = new Map<string, string | null>()
const APP_ICON_CONCURRENCY = 2

let runningIconTasks = 0
const pendingIconTasks: Array<() => void> = []

function normalizeTarget(target: AppIconTarget): AppIconTarget {
  return {
    bundleId: target.bundleId?.trim() || null,
    name: target.name?.trim() || null
  }
}

export function getAppIconCacheKey(target: AppIconTarget): string {
  const normalized = normalizeTarget(target)
  return `${normalized.bundleId ?? ''}|${normalized.name ?? ''}`
}

const RESOLVE_APP_PATH_SCRIPT = `
ObjC.import('AppKit')
ObjC.import('stdlib')
const ws = $.NSWorkspace.sharedWorkspace
const bundleId = ObjC.unwrap($.getenv('CLIPMATE_BUNDLE_ID')) || ''
const appName = ObjC.unwrap($.getenv('CLIPMATE_APP_NAME')) || ''

let resolvedPath = ''
if (bundleId) {
  const url = ws.URLForApplicationWithBundleIdentifier(bundleId)
  if (url) {
    resolvedPath = ObjC.unwrap(url.path) || ''
  }
}

if (!resolvedPath && appName) {
  resolvedPath = ObjC.unwrap(ws.fullPathForApplication(appName)) || ''
}

resolvedPath
`

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function withIconTaskSlot<T>(task: () => Promise<T>): Promise<T> {
  if (runningIconTasks >= APP_ICON_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      pendingIconTasks.push(resolve)
    })
  }

  runningIconTasks += 1
  try {
    return await task()
  } finally {
    runningIconTasks = Math.max(0, runningIconTasks - 1)
    pendingIconTasks.shift()?.()
  }
}

async function safeReadPlistValue(plistPath: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('defaults', ['read', plistPath, key], {
      encoding: 'utf8'
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

function appendIcnsExtension(name: string): string {
  return name.endsWith('.icns') ? name : `${name}.icns`
}

async function resolveBundleIconPath(appPath: string): Promise<string | null> {
  if (bundleIconPathCache.has(appPath)) {
    return bundleIconPathCache.get(appPath) ?? null
  }

  const contentsPath = join(appPath, 'Contents')
  const resourcesPath = join(contentsPath, 'Resources')
  const plistPath = join(contentsPath, 'Info')
  const iconCandidates = new Set<string>()

  const [iconFile, iconName] = await Promise.all([
    safeReadPlistValue(plistPath, 'CFBundleIconFile'),
    safeReadPlistValue(plistPath, 'CFBundleIconName')
  ])

  if (iconFile) {
    iconCandidates.add(join(resourcesPath, appendIcnsExtension(iconFile)))
  }

  if (iconName) {
    iconCandidates.add(join(resourcesPath, appendIcnsExtension(iconName)))
  }

  for (const iconPath of iconCandidates) {
    if (await fileExists(iconPath)) {
      bundleIconPathCache.set(appPath, iconPath)
      return iconPath
    }
  }

  try {
    const appBase = basename(appPath, '.app').toLowerCase()
    const files = (await readdir(resourcesPath)).filter((name) =>
      name.toLowerCase().endsWith('.icns')
    )

    if (files.length > 0) {
      const ranked = files.sort((left, right) => {
        const leftScore = scoreIcnsCandidate(left, appBase)
        const rightScore = scoreIcnsCandidate(right, appBase)
        return rightScore - leftScore || left.localeCompare(right)
      })
      const resolved = join(resourcesPath, ranked[0])
      bundleIconPathCache.set(appPath, resolved)
      return resolved
    }
  } catch {
    // ignore
  }

  bundleIconPathCache.set(appPath, null)
  return null
}

function scoreIcnsCandidate(fileName: string, appBase: string): number {
  const stem = fileName.replace(/\.icns$/i, '').toLowerCase()
  if (stem === appBase) return 100
  if (stem.includes(appBase)) return 80
  if (stem === 'app' || stem === 'appicon') return 60
  if (stem.includes('icon')) return 40
  return 10
}

async function convertIcnsToDataUrl(iconPath: string): Promise<string | null> {
  const cacheDir = join(app.getPath('temp'), 'clipmate-app-icons')
  await mkdir(cacheDir, { recursive: true })

  const fileHash = createHash('sha1').update(iconPath).digest('hex')
  const pngPath = join(cacheDir, `${fileHash}.png`)

  try {
    if (!(await fileExists(pngPath))) {
      await execFileAsync('sips', ['-s', 'format', 'png', iconPath, '--out', pngPath])
    }

    const base64 = (await readFile(pngPath)).toString('base64')
    return base64 ? `data:image/png;base64,${base64}` : null
  } catch {
    return null
  }
}

async function resolveApplicationPath(target: AppIconTarget): Promise<string | null> {
  const normalized = normalizeTarget(target)
  const key = getAppIconCacheKey(normalized)
  if (appPathCache.has(key)) {
    return appPathCache.get(key) ?? null
  }

  if (!normalized.bundleId && !normalized.name) {
    appPathCache.set(key, null)
    return null
  }

  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', RESOLVE_APP_PATH_SCRIPT],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLIPMATE_BUNDLE_ID: normalized.bundleId ?? '',
          CLIPMATE_APP_NAME: normalized.name ?? ''
        }
      }
    )

    const path = stdout.trim() || null
    appPathCache.set(key, path)
    return path
  } catch {
    appPathCache.set(key, null)
    return null
  }
}

async function loadApplicationIconDataUrl(target: AppIconTarget): Promise<string | null> {
  const key = getAppIconCacheKey(target)
  if (appIconCache.has(key)) {
    return appIconCache.get(key) ?? null
  }

  const appPath = await resolveApplicationPath(target)
  if (!appPath) {
    appIconCache.set(key, null)
    return null
  }

  try {
    const bundleIconPath = await resolveBundleIconPath(appPath)
    if (bundleIconPath) {
      const bundleIconDataUrl = await convertIcnsToDataUrl(bundleIconPath)
      if (bundleIconDataUrl) {
        appIconCache.set(key, bundleIconDataUrl)
        return bundleIconDataUrl
      }
    }

    const normalIcon = await app.getFileIcon(appPath, { size: 'normal' })
    let dataUrl: string | null = null

    if (!normalIcon.isEmpty()) {
      dataUrl = normalIcon.toDataURL()
    } else {
      const smallIcon = await app.getFileIcon(appPath, { size: 'small' })
      dataUrl = smallIcon.isEmpty() ? null : smallIcon.toDataURL()
    }

    appIconCache.set(key, dataUrl)
    return dataUrl
  } catch {
    appIconCache.set(key, null)
    return null
  }
}

export async function getApplicationIconDataUrl(target: AppIconTarget): Promise<string | null> {
  const key = getAppIconCacheKey(target)
  if (appIconCache.has(key)) {
    return appIconCache.get(key) ?? null
  }

  const inFlight = appIconInFlight.get(key)
  if (inFlight) {
    return inFlight
  }

  const task = withIconTaskSlot(() => loadApplicationIconDataUrl(target)).finally(() => {
    appIconInFlight.delete(key)
  })

  appIconInFlight.set(key, task)
  return task
}
