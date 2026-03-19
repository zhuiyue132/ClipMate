import Foundation
import Vision
import AppKit

func loadCGImage(from path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let image = NSImage(contentsOf: url) else { return nil }
  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
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
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.02

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let observations = request.results ?? []
  let lines = observations.compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
} catch {
  fputs("OCR error: \(error)\\n", stderr)
  exit(4)
}
