import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const sourcePath = resolve(repoRoot, 'resources/ocr/vision_ocr.swift')
const outputPath = resolve(repoRoot, 'build/generated-resources/ocr/vision_ocr')

if (process.platform !== 'darwin') {
  console.log('[ocr-helper] skipped: only required on macOS builds')
  process.exit(0)
}

if (!existsSync(sourcePath)) {
  console.error(`[ocr-helper] source not found: ${sourcePath}`)
  process.exit(1)
}

mkdirSync(dirname(outputPath), { recursive: true })
rmSync(outputPath, { force: true })

const result = spawnSync(
  'xcrun',
  ['swiftc', '-O', sourcePath, '-framework', 'Vision', '-framework', 'AppKit', '-o', outputPath],
  {
    cwd: repoRoot,
    stdio: 'inherit'
  }
)

if (result.status !== 0) {
  console.error('[ocr-helper] failed to compile Vision OCR helper')
  process.exit(result.status ?? 1)
}

chmodSync(outputPath, 0o755)
console.log(`[ocr-helper] built: ${outputPath}`)
