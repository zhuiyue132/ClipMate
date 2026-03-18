import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface AppIconTarget {
  bundleId: string | null
  name: string | null
}

const appPathCache = new Map<string, string | null>()
const appIconCache = new Map<string, string | null>()
const bundleIconPathCache = new Map<string, string | null>()

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

function safeReadPlistValue(plistPath: string, key: string): string | null {
  try {
    const output = execFileSync('defaults', ['read', plistPath, key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return output || null
  } catch {
    return null
  }
}

function appendIcnsExtension(name: string): string {
  return name.endsWith('.icns') ? name : `${name}.icns`
}

function resolveBundleIconPath(appPath: string): string | null {
  if (bundleIconPathCache.has(appPath)) {
    return bundleIconPathCache.get(appPath) ?? null
  }

  const contentsPath = join(appPath, 'Contents')
  const resourcesPath = join(contentsPath, 'Resources')
  const plistPath = join(contentsPath, 'Info')
  const iconCandidates = new Set<string>()

  const iconFile = safeReadPlistValue(plistPath, 'CFBundleIconFile')
  if (iconFile) {
    iconCandidates.add(join(resourcesPath, appendIcnsExtension(iconFile)))
  }

  const iconName = safeReadPlistValue(plistPath, 'CFBundleIconName')
  if (iconName) {
    iconCandidates.add(join(resourcesPath, appendIcnsExtension(iconName)))
  }

  for (const iconPath of iconCandidates) {
    if (existsSync(iconPath)) {
      bundleIconPathCache.set(appPath, iconPath)
      return iconPath
    }
  }

  try {
    const appBase = basename(appPath, '.app').toLowerCase()
    const files = readdirSync(resourcesPath).filter((name) => name.toLowerCase().endsWith('.icns'))

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

function convertIcnsToDataUrl(iconPath: string): string | null {
  const cacheDir = join(app.getPath('temp'), 'clipmate-app-icons')
  mkdirSync(cacheDir, { recursive: true })

  const fileHash = createHash('sha1').update(iconPath).digest('hex')
  const pngPath = join(cacheDir, `${fileHash}.png`)

  try {
    if (!existsSync(pngPath)) {
      execFileSync('sips', ['-s', 'format', 'png', iconPath, '--out', pngPath], {
        stdio: ['ignore', 'ignore', 'ignore']
      })
    }

    const base64 = readFileSync(pngPath).toString('base64')
    return base64 ? `data:image/png;base64,${base64}` : null
  } catch {
    return null
  }
}

function resolveApplicationPath(target: AppIconTarget): string | null {
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
    const output = execFileSync('osascript', ['-l', 'JavaScript', '-e', RESOLVE_APP_PATH_SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLIPMATE_BUNDLE_ID: normalized.bundleId ?? '',
        CLIPMATE_APP_NAME: normalized.name ?? ''
      }
    }).trim()

    const path = output || null
    appPathCache.set(key, path)
    return path
  } catch {
    appPathCache.set(key, null)
    return null
  }
}

export async function getApplicationIconDataUrl(target: AppIconTarget): Promise<string | null> {
  const key = getAppIconCacheKey(target)
  if (appIconCache.has(key)) {
    return appIconCache.get(key) ?? null
  }

  const appPath = resolveApplicationPath(target)
  if (!appPath) {
    appIconCache.set(key, null)
    return null
  }

  try {
    const bundleIconPath = resolveBundleIconPath(appPath)
    if (bundleIconPath) {
      const bundleIconDataUrl = convertIcnsToDataUrl(bundleIconPath)
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
