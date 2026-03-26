import { nativeImage } from 'electron'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { logOcrDebug } from './debug'
import { serializeClipboardImageForStorage } from './imageStorage'
import { getOcrRuntimeInfo, runVisionOcr } from './runtime'

interface OcrFixtureManifest {
  fixtures: OcrFixtureDefinition[]
}

interface OcrFixtureDefinition {
  id: string
  description: string
  representations: Array<{
    path: string
    scaleFactor: number
  }>
  requiredFragments: string[]
}

interface OcrFixtureVerificationResult {
  id: string
  description: string
  engine: 'helper' | 'swift'
  usedFallback: boolean
  selectedScaleFactor: number
  pixelSize: { width: number; height: number }
  recognizedText: string
  missingFragments: string[]
}

function findFixtureManifestPath(): string | null {
  const candidates = [
    join(process.cwd(), 'resources/ocr/fixtures/manifest.json'),
    join(__dirname, '../../../resources/ocr/fixtures/manifest.json')
  ]

  for (const candidate of candidates) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // ignore
    }
  }

  return null
}

function loadFixtureManifest(): { manifestPath: string; manifest: OcrFixtureManifest } {
  const manifestPath = findFixtureManifestPath()
  if (!manifestPath) {
    throw new Error('OCR fixture manifest not found')
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as OcrFixtureManifest
  return { manifestPath, manifest }
}

function createFixtureNativeImage(manifestDir: string, fixture: OcrFixtureDefinition) {
  const image = nativeImage.createEmpty()

  for (const representation of fixture.representations) {
    const representationPath = join(manifestDir, representation.path)
    const buffer = readFileSync(representationPath)
    image.addRepresentation({
      scaleFactor: representation.scaleFactor,
      dataURL: `data:image/png;base64,${buffer.toString('base64')}`
    })
  }

  return image
}

async function verifyFixture(
  manifestDir: string,
  tempDir: string,
  fixture: OcrFixtureDefinition
): Promise<OcrFixtureVerificationResult> {
  const image = createFixtureNativeImage(manifestDir, fixture)
  const stored = serializeClipboardImageForStorage(image)
  const filePath = join(tempDir, `${fixture.id}.png`)

  writeFileSync(filePath, Buffer.from(stored.contentBase64, 'base64'))

  const ocr = await runVisionOcr(filePath)
  const missingFragments = fixture.requiredFragments.filter(
    (fragment) => !ocr.text.includes(fragment)
  )

  logOcrDebug('verified OCR fixture', {
    fixtureId: fixture.id,
    selectedScaleFactor: stored.diagnostics.selectedScaleFactor,
    pixelSize: stored.diagnostics.pixelSize,
    engine: ocr.engine,
    usedFallback: ocr.usedFallback,
    missingFragments
  })

  return {
    id: fixture.id,
    description: fixture.description,
    engine: ocr.engine,
    usedFallback: ocr.usedFallback,
    selectedScaleFactor: stored.diagnostics.selectedScaleFactor,
    pixelSize: stored.diagnostics.pixelSize,
    recognizedText: ocr.text,
    missingFragments
  }
}

export async function runOcrFixtureVerification(): Promise<{
  runtime: ReturnType<typeof getOcrRuntimeInfo>
  results: OcrFixtureVerificationResult[]
}> {
  const runtime = getOcrRuntimeInfo()
  if (!runtime.enabled) {
    throw new Error('OCR runtime unavailable. Build the helper or install swift first.')
  }

  const { manifestPath, manifest } = loadFixtureManifest()
  const manifestDir = dirname(manifestPath)
  const tempDir = mkdtempSync(join(tmpdir(), 'clipmate-ocr-fixtures-'))

  try {
    const results: OcrFixtureVerificationResult[] = []
    for (const fixture of manifest.fixtures) {
      results.push(await verifyFixture(manifestDir, tempDir, fixture))
    }

    return { runtime, results }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function runOcrFixtureVerificationCli(): Promise<number> {
  try {
    const { runtime, results } = await runOcrFixtureVerification()
    const failures = results.filter((result) => result.missingFragments.length > 0)

    console.info('[ocr] fixture verification runtime', runtime)

    for (const result of results) {
      if (result.missingFragments.length === 0) {
        console.info(
          `[ocr] PASS ${result.id} (${result.engine}${result.usedFallback ? ', fallback' : ''}) scale=${result.selectedScaleFactor} size=${result.pixelSize.width}x${result.pixelSize.height}`
        )
        continue
      }

      console.error(
        `[ocr] FAIL ${result.id} missing=${result.missingFragments.join(', ')} text=${JSON.stringify(result.recognizedText)}`
      )
    }

    if (failures.length > 0) {
      return 1
    }

    console.info('[ocr] all fixtures passed')
    return 0
  } catch (error) {
    console.error('[ocr] fixture verification failed to run', error)
    return 1
  }
}
