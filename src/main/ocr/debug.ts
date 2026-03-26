const OCR_DEBUG_ENABLED = process.env.CLIPMATE_OCR_DEBUG === '1'

export function logOcrDebug(event: string, meta?: unknown): void {
  if (!OCR_DEBUG_ENABLED) return

  if (meta) {
    console.info(`[ocr] ${event}`, meta)
    return
  }

  console.info(`[ocr] ${event}`)
}
