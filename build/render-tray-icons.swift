import AppKit
import Foundation

struct TrayVariant {
  let fileName: String
  let size: CGFloat
  let paused: Bool
}

let variants = [
  TrayVariant(fileName: "clipmate-tray.png", size: 18, paused: false),
  TrayVariant(fileName: "clipmate-tray@2x.png", size: 36, paused: false),
  TrayVariant(fileName: "clipmate-tray-paused.png", size: 18, paused: true),
  TrayVariant(fileName: "clipmate-tray-paused@2x.png", size: 36, paused: true),
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

func clearPauseBars(in rect: NSRect) {
  guard let context = NSGraphicsContext.current?.cgContext else {
    return
  }

  let barWidth = max(1.75, rect.width * 0.15)
  let barHeight = rect.height * 0.46
  let gap = rect.width * 0.1
  let originX = (rect.width - (barWidth * 2) - gap) / 2
  let originY = (rect.height - barHeight) / 2
  let radius = min(barWidth / 2, 2.4)

  context.saveGState()
  context.setBlendMode(.clear)

  let leftBar = CGPath(
    roundedRect: CGRect(x: originX, y: originY, width: barWidth, height: barHeight),
    cornerWidth: radius,
    cornerHeight: radius,
    transform: nil
  )
  context.addPath(leftBar)
  context.fillPath()

  let rightBar = CGPath(
    roundedRect: CGRect(
      x: originX + barWidth + gap,
      y: originY,
      width: barWidth,
      height: barHeight
    ),
    cornerWidth: radius,
    cornerHeight: radius,
    transform: nil
  )
  context.addPath(rightBar)
  context.fillPath()
  context.restoreGState()
}

func renderTemplateIcon(from sourceImage: NSImage, size: CGFloat, paused: Bool) -> NSImage {
  let canvasSize = NSSize(width: size, height: size)
  let canvas = NSImage(size: canvasSize)
  let rect = NSRect(origin: .zero, size: canvasSize)

  canvas.lockFocus()
  defer { canvas.unlockFocus() }

  sourceImage.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
  NSColor.black.setFill()
  rect.fill(using: .sourceIn)

  if paused {
    clearPauseBars(in: rect)
  }

  return canvas
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  exitWithError("usage: xcrun swift build/render-tray-icons.swift <source-png> <output-dir>")
}

let sourcePath = arguments[1]
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)

guard let sourceImage = NSImage(contentsOfFile: sourcePath) else {
  exitWithError("failed to load source image: \(sourcePath)")
}

let fileManager = FileManager.default

do {
  try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
} catch {
  exitWithError("failed to create output directory: \(error.localizedDescription)")
}

for variant in variants {
  let rendered = renderTemplateIcon(from: sourceImage, size: variant.size, paused: variant.paused)
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
