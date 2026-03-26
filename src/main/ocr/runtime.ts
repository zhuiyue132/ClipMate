import { app } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { logOcrDebug } from './debug'

const execFileAsync = promisify(execFile)

export interface OcrRuntimeInfo {
  helperPath: string | null
  scriptPath: string | null
  swiftAvailable: boolean
  enabled: boolean
}

export interface OcrRunResult {
  text: string
  engine: 'helper' | 'swift'
  executablePath: string
  usedFallback: boolean
}

function fileExists(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function findOcrHelperPath(): string | null {
  const candidates = [
    join(process.resourcesPath, 'ocr/vision_ocr'),
    join(process.cwd(), 'build/generated-resources/ocr/vision_ocr'),
    join(app.getAppPath(), 'build/generated-resources/ocr/vision_ocr'),
    join(__dirname, '../../../build/generated-resources/ocr/vision_ocr')
  ]

  return candidates.find(isExecutable) ?? null
}

export function findOcrScriptPath(): string | null {
  const candidates = [
    join(process.cwd(), 'resources/ocr/vision_ocr.swift'),
    join(app.getAppPath(), 'resources/ocr/vision_ocr.swift'),
    join(__dirname, '../../../resources/ocr/vision_ocr.swift')
  ]

  return candidates.find(fileExists) ?? null
}

export function isSwiftAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  try {
    execFileSync('swift', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function getOcrRuntimeInfo(): OcrRuntimeInfo {
  const helperPath = findOcrHelperPath()
  const scriptPath = findOcrScriptPath()
  const swiftAvailable = isSwiftAvailable()

  return {
    helperPath,
    scriptPath,
    swiftAvailable,
    enabled: Boolean(helperPath) || swiftAvailable
  }
}

function getImageFileBytes(imagePath: string): number | null {
  try {
    return statSync(imagePath).size
  } catch {
    return null
  }
}

export async function runVisionOcr(imagePath: string): Promise<OcrRunResult> {
  const runtime = getOcrRuntimeInfo()
  const fileBytes = getImageFileBytes(imagePath)

  if (runtime.helperPath) {
    try {
      logOcrDebug('running OCR helper', {
        imagePath,
        fileBytes,
        helperPath: runtime.helperPath
      })

      const { stdout } = await execFileAsync(runtime.helperPath, [imagePath], {
        timeout: 30_000,
        maxBuffer: 5 * 1024 * 1024
      })

      return {
        text: (stdout ?? '').trim(),
        engine: 'helper',
        executablePath: runtime.helperPath,
        usedFallback: false
      }
    } catch (error) {
      logOcrDebug('OCR helper failed', {
        imagePath,
        fileBytes,
        helperPath: runtime.helperPath,
        error: error instanceof Error ? error.message : String(error)
      })

      if (!runtime.scriptPath || !runtime.swiftAvailable) {
        throw error
      }
    }
  }

  if (!runtime.scriptPath || !runtime.swiftAvailable) {
    throw new Error('Vision OCR runtime unavailable')
  }

  logOcrDebug('running OCR swift fallback', {
    imagePath,
    fileBytes,
    scriptPath: runtime.scriptPath
  })

  const { stdout } = await execFileAsync('swift', [runtime.scriptPath, imagePath], {
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024
  })

  return {
    text: (stdout ?? '').trim(),
    engine: 'swift',
    executablePath: runtime.scriptPath,
    usedFallback: Boolean(runtime.helperPath)
  }
}
