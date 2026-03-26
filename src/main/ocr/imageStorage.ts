import type { NativeImage, Size } from 'electron'
import { logOcrDebug } from './debug'

export interface StoredClipboardImageDiagnostics {
  scaleFactors: number[]
  selectedScaleFactor: number
  logicalSize: Size
  pixelSize: Size
  contentBytes: number
  thumbnailBytes: number
}

export interface StoredClipboardImage {
  contentBase64: string
  thumbnail: Buffer | null
  diagnostics: StoredClipboardImageDiagnostics
}

function getNormalizedScaleFactors(image: NativeImage): number[] {
  const factors = image
    .getScaleFactors()
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)

  if (factors.length === 0) {
    return [1]
  }

  return Array.from(new Set(factors))
}

export function serializeClipboardImageForStorage(image: NativeImage): StoredClipboardImage {
  const scaleFactors = getNormalizedScaleFactors(image)
  const selectedScaleFactor = Math.max(...scaleFactors)
  const png = image.toPNG({ scaleFactor: selectedScaleFactor })
  const thumbnail = image.resize({ width: 320 }).toPNG()
  const diagnostics: StoredClipboardImageDiagnostics = {
    scaleFactors,
    selectedScaleFactor,
    logicalSize: image.getSize(),
    pixelSize: image.getSize(selectedScaleFactor),
    contentBytes: png.length,
    thumbnailBytes: thumbnail.length
  }

  logOcrDebug('captured clipboard image', diagnostics)

  return {
    contentBase64: png.toString('base64'),
    thumbnail: thumbnail.length > 0 ? thumbnail : null,
    diagnostics
  }
}
