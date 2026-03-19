import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const sourcePath = resolve(repoRoot, 'resources/ocr/vision_ocr.swift')
const outputPath = resolve(repoRoot, 'build/generated-resources/ocr/vision_ocr')
const arm64OutputPath = resolve(repoRoot, 'build/generated-resources/ocr/vision_ocr.arm64')
const x64OutputPath = resolve(repoRoot, 'build/generated-resources/ocr/vision_ocr.x64')

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
rmSync(arm64OutputPath, { force: true })
rmSync(x64OutputPath, { force: true })

function runOrExit(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    console.error(`[ocr-helper] failed at step: ${label}`)
    process.exit(result.status ?? 1)
  }
}

runOrExit('compile arm64 helper', 'xcrun', [
  'swiftc',
  '-O',
  '-target',
  'arm64-apple-macos11.0',
  sourcePath,
  '-framework',
  'Vision',
  '-framework',
  'AppKit',
  '-o',
  arm64OutputPath
])

runOrExit('compile x64 helper', 'xcrun', [
  'swiftc',
  '-O',
  '-target',
  'x86_64-apple-macos10.15',
  sourcePath,
  '-framework',
  'Vision',
  '-framework',
  'AppKit',
  '-o',
  x64OutputPath
])

runOrExit('lipo universal helper', 'xcrun', [
  'lipo',
  '-create',
  '-output',
  outputPath,
  arm64OutputPath,
  x64OutputPath
])

chmodSync(outputPath, 0o755)
rmSync(arm64OutputPath, { force: true })
rmSync(x64OutputPath, { force: true })
console.log(`[ocr-helper] built: ${outputPath}`)
