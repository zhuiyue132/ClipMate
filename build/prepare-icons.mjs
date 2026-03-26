import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const sourceIconsetDir = resolve(repoRoot, 'build/iconset-source/clipmate.iconset')
const sourceIconPngPath = resolve(sourceIconsetDir, 'icon_512x512@2x.png')
const buildDir = resolve(repoRoot, 'build')
const buildTrayDir = resolve(buildDir, 'tray')
const outputIconIcnsPath = resolve(buildDir, 'icon.icns')
const outputIconPngPath = resolve(buildDir, 'icon.png')
const trayRendererScriptPath = resolve(buildDir, 'render-tray-icons.swift')

const requiredIconsetFiles = [
  'icon_16x16.png',
  'icon_16x16@2x.png',
  'icon_32x32.png',
  'icon_32x32@2x.png',
  'icon_128x128.png',
  'icon_128x128@2x.png',
  'icon_256x256.png',
  'icon_256x256@2x.png',
  'icon_512x512.png',
  'icon_512x512@2x.png'
]

function exitWithError(message) {
  console.error(`[icons] ${message}`)
  process.exit(1)
}

function runOrExit(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    exitWithError(`failed at step: ${label}`)
  }
}

if (process.platform !== 'darwin') {
  console.log('[icons] skipped: icon generation is only supported on macOS')
  process.exit(0)
}

if (!existsSync(sourceIconsetDir)) {
  exitWithError(`source iconset not found: ${sourceIconsetDir}`)
}

if (!existsSync(trayRendererScriptPath)) {
  exitWithError(`tray renderer script not found: ${trayRendererScriptPath}`)
}

for (const fileName of requiredIconsetFiles) {
  const filePath = resolve(sourceIconsetDir, fileName)
  if (!existsSync(filePath)) {
    exitWithError(`missing required source icon: ${filePath}`)
  }
}

mkdirSync(buildDir, { recursive: true })
mkdirSync(buildTrayDir, { recursive: true })

runOrExit('convert iconset to icns', 'xcrun', [
  'iconutil',
  '--convert',
  'icns',
  '--output',
  outputIconIcnsPath,
  sourceIconsetDir
])

copyFileSync(sourceIconPngPath, outputIconPngPath)

runOrExit('render tray icons', 'xcrun', [
  'swift',
  trayRendererScriptPath,
  sourceIconPngPath,
  buildTrayDir
])

console.log(`[icons] built app icon: ${outputIconIcnsPath}`)
console.log(`[icons] built active tray icons: ${buildTrayDir}`)
