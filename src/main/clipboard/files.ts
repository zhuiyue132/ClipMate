import { clipboard, nativeImage } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TEMP_DIR = path.join(tmpdir(), 'clipmate-exports')

function ensureTempDir(): string {
  mkdirSync(TEMP_DIR, { recursive: true })
  return TEMP_DIR
}

function createFileListPlist(fileUrls: string[]): string {
  const items = fileUrls.map((fileUrl) => `    <string>${fileUrl}</string>`).join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<array>',
    items,
    '</array>',
    '</plist>'
  ].join('\n')
}

export function writeBase64ImageToTempFile(itemId: string, contentBase64: string): string {
  const dirPath = ensureTempDir()
  const filePath = path.join(dirPath, `${itemId}.png`)
  writeFileSync(filePath, Buffer.from(contentBase64, 'base64'))
  return filePath
}

export function createDragIconFromBase64(contentBase64: string): Electron.NativeImage {
  const image = nativeImage.createFromBuffer(Buffer.from(contentBase64, 'base64'))
  if (image.isEmpty()) {
    return nativeImage.createEmpty()
  }

  return image.resize({ width: 96, height: 96 })
}

export function writeFilePathsToClipboard(paths: string[]): void {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  if (uniquePaths.length === 0) return

  const fileUrls = uniquePaths.map((filePath) => pathToFileURL(filePath).toString())
  const firstFileUrl = fileUrls[0]
  const plist = createFileListPlist(fileUrls)

  clipboard.clear()
  clipboard.writeBuffer('public.file-url', Buffer.from(firstFileUrl, 'utf8'))
  clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf8'))
  clipboard.writeBuffer('text/uri-list', Buffer.from(fileUrls.join('\n'), 'utf8'))
  clipboard.writeText(fileUrls.join('\n'))
}
