import Foundation
import Vision
import AppKit

func loadCGImage(from path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let image = NSImage(contentsOf: url) else { return nil }
  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

func configure(_ request: VNRecognizeTextRequest) {
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.minimumTextHeight = 0.008

  if #available(macOS 13.0, *) {
    request.automaticallyDetectsLanguage = true
  }

  if #available(macOS 12.0, *) {
    do {
      let supported = try request.supportedRecognitionLanguages()
      let preferred = ["zh-Hans", "zh-Hant", "en-US"].filter { supported.contains($0) }
      if !preferred.isEmpty {
        request.recognitionLanguages = preferred
      }
    } catch {
      // Ignore language hint lookup failures and keep Vision defaults.
    }
  }
}

func sortedLines(from observations: [VNRecognizedTextObservation]) -> [String] {
  let sorted = observations.sorted { left, right in
    let verticalDelta = abs(left.boundingBox.midY - right.boundingBox.midY)
    if verticalDelta > 0.025 {
      return left.boundingBox.midY > right.boundingBox.midY
    }

    return left.boundingBox.minX < right.boundingBox.minX
  }

  return sorted.compactMap { $0.topCandidates(1).first?.string }
}

guard CommandLine.arguments.count >= 2 else {
  fputs("Usage: vision_ocr.swift <imagePath>\\n", stderr)
  exit(2)
}

let imagePath = CommandLine.arguments[1]

guard let cgImage = loadCGImage(from: imagePath) else {
  fputs("Failed to load image\\n", stderr)
  exit(3)
}

let request = VNRecognizeTextRequest()
configure(request)

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let observations = request.results ?? []
  let lines = sortedLines(from: observations)
  print(lines.joined(separator: "\n"))
} catch {
  fputs("OCR error: \(error)\\n", stderr)
  exit(4)
}
