import AppKit
import Foundation

struct TrayVariant {
  let fileName: String
  let size: CGFloat
}

let variants = [
  TrayVariant(fileName: "clipmate-tray.png", size: 18),
  TrayVariant(fileName: "clipmate-tray@2x.png", size: 36),
]

func exitWithError(_ message: String) -> Never {
  fputs("[tray-icons] \(message)\n", stderr)
  exit(1)
}

func pngData(from image: NSImage) -> Data? {
  guard
    let tiffData = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData)
  else {
    return nil
  }

  return bitmap.representation(using: .png, properties: [:])
}

func renderTemplateIcon(from sourceImage: NSImage, size: CGFloat) -> NSImage {
  let canvasSize = NSSize(width: size, height: size)
  let canvas = NSImage(size: canvasSize)
  let rect = NSRect(origin: .zero, size: canvasSize)

  canvas.lockFocus()
  defer { canvas.unlockFocus() }

  sourceImage.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
  NSColor.black.setFill()
  rect.fill(using: .sourceIn)

  return canvas
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  exitWithError("usage: xcrun swift build/render-tray-icons.swift <active-source-png> <output-dir>")
}

let activeSourcePath = arguments[1]
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)

guard let activeSourceImage = NSImage(contentsOfFile: activeSourcePath) else {
  exitWithError("failed to load active tray source image: \(activeSourcePath)")
}

let fileManager = FileManager.default

do {
  try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
} catch {
  exitWithError("failed to create output directory: \(error.localizedDescription)")
}

for variant in variants {
  let rendered = renderTemplateIcon(from: activeSourceImage, size: variant.size)
  guard let data = pngData(from: rendered) else {
    exitWithError("failed to encode PNG for \(variant.fileName)")
  }

  let outputURL = outputDirectory.appendingPathComponent(variant.fileName)

  do {
    try data.write(to: outputURL)
  } catch {
    exitWithError("failed to write \(variant.fileName): \(error.localizedDescription)")
  }
}

print("[tray-icons] rendered \(variants.count) tray assets into \(outputDirectory.path)")
