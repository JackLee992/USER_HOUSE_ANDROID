// Technical app-bundle conversion of the existing imagegen artwork; no retouching.
import Foundation
import ImageIO
import CoreGraphics
guard CommandLine.arguments.count == 3 else { fatalError("Usage: swift prepare-ios-icon.swift source.png output.png") }
let source = URL(fileURLWithPath: CommandLine.arguments[1]), output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let input = CGImageSourceCreateWithURL(source as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(input, 0, nil) else { fatalError("Invalid source") }
let probe = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
probe.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
let bytes = probe.data!.assumingMemoryBound(to: UInt8.self)
for index in stride(from: 3, to: image.width * image.height * 4, by: 4) { precondition(bytes[index] == 255, "Source contains transparent pixels: explicitly choose a background before making a store icon") }
let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 4096, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.interpolationQuality = .high; context.draw(image, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil); precondition(CGImageDestinationFinalize(destination))
print("AppIcon 1024×1024 RGB; source all pixels opaque")
