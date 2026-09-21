// Local-only OCR for large archive images. Requires macOS Vision.
// Compile: swiftc -O -module-cache-path /tmp/giga-swift-cache scripts/ocr-image.swift -o /tmp/giga-image-ocr
// Usage: /tmp/giga-image-ocr INPUT.png OUTPUT.json [--overview-only]
// Boxes use ORIGINAL IMAGE PIXELS with a TOP-LEFT origin: [x, y, width, height].
import Foundation
import CoreGraphics
import ImageIO
import Vision

struct Recognition: Codable {
    let text: String
    let confidence: Float
    let bbox: [Double]
    let tile: Int
    let edgeDistance: Double
}

struct OCRResult: Codable {
    let source: String
    let width: Int
    let height: Int
    let engine: String
    let coordinates: String
    let language: String
    let note: String
    let tileCount: Int
    let failedTiles: [Int]
    let lines: [Recognition]
    let words: [Recognition]
}

func globalBox(_ box: CGRect, crop: CGRect) -> [Double] {
    [crop.minX + box.minX * crop.width,
     crop.minY + (1 - box.maxY) * crop.height,
     box.width * crop.width,
     box.height * crop.height]
}

func edgeDistance(_ box: [Double], crop: CGRect) -> Double {
    min(box[0] - crop.minX, box[1] - crop.minY,
        crop.maxX - box[0] - box[2], crop.maxY - box[1] - box[3])
}

func overlap(_ first: [Double], _ second: [Double]) -> Double {
    let firstRect = CGRect(x: first[0], y: first[1], width: first[2], height: first[3])
    let secondRect = CGRect(x: second[0], y: second[1], width: second[2], height: second[3])
    let intersection = firstRect.intersection(secondRect)
    guard !intersection.isNull else { return 0 }
    let area = intersection.width * intersection.height
    return area / max(1, firstRect.width * firstRect.height + secondRect.width * secondRect.height - area)
}

// Adjacent crops intentionally overlap. Prefer well-contained, confident words
// and remove duplicate observations without imposing any reading-order claim.
func deduplicate(_ observations: [Recognition]) -> [Recognition] {
    let sorted = observations.sorted {
        let a = Double($0.confidence) + min(300, $0.edgeDistance) / 3000
        let b = Double($1.confidence) + min(300, $1.edgeDistance) / 3000
        return a > b
    }
    var selected: [Recognition] = []
    var grid: [String: [Int]] = [:]
    let cell = 128.0
    for candidate in sorted {
        let x = Int((candidate.bbox[0] + candidate.bbox[2] / 2) / cell)
        let y = Int((candidate.bbox[1] + candidate.bbox[3] / 2) / cell)
        var duplicate = false
        for dx in -1...1 {
            for dy in -1...1 {
                for index in grid["\(x + dx),\(y + dy)"] ?? [] {
                    let existing = selected[index]
                    let sameText = existing.text.caseInsensitiveCompare(candidate.text) == .orderedSame
                    if overlap(existing.bbox, candidate.bbox) > (sameText ? 0.38 : 0.70) {
                        duplicate = true
                        break
                    }
                }
                if duplicate { break }
            }
            if duplicate { break }
        }
        if !duplicate {
            grid["\(x),\(y)", default: []].append(selected.count)
            selected.append(candidate)
        }
    }
    // A fast heading pass can mistake a decorative stroke for a short word
    // inside an accurately recognized word. Keep the accurate observation.
    let unambiguous = selected.filter { candidate in
        guard candidate.tile == 0 else { return true }
        let candidateRect = CGRect(x: candidate.bbox[0], y: candidate.bbox[1], width: candidate.bbox[2], height: candidate.bbox[3])
        let candidateArea = max(1, candidateRect.width * candidateRect.height)
        return !selected.contains { existing in
            guard existing.tile != 0, existing.confidence >= candidate.confidence + 0.3 else { return false }
            let existingRect = CGRect(x: existing.bbox[0], y: existing.bbox[1], width: existing.bbox[2], height: existing.bbox[3])
            guard existingRect.width * existingRect.height > candidateArea * 1.4 else { return false }
            let intersection = candidateRect.intersection(existingRect)
            return !intersection.isNull && intersection.width * intersection.height / candidateArea > 0.85
        }
    }
    let headings = unambiguous.filter { $0.tile == 0 }
    let completed = unambiguous.filter { fragment in
        guard fragment.tile != 0, fragment.text.count >= 4 else { return true }
        let fragmentRect = CGRect(x: fragment.bbox[0], y: fragment.bbox[1], width: fragment.bbox[2], height: fragment.bbox[3])
        return !headings.contains { heading in
            guard heading.text.count > fragment.text.count,
                  heading.text.lowercased().contains(fragment.text.lowercased()) else { return false }
            let headingRect = CGRect(x: heading.bbox[0], y: heading.bbox[1], width: heading.bbox[2], height: heading.bbox[3])
            let intersection = fragmentRect.intersection(headingRect)
            return !intersection.isNull && intersection.width * intersection.height / max(1, fragmentRect.width * fragmentRect.height) > 0.85
        }
    }
    return completed.sorted {
        let firstRow = Int($0.bbox[1] / 16)
        let secondRow = Int($1.bbox[1] / 16)
        return firstRow == secondRow ? $0.bbox[0] < $1.bbox[0] : firstRow < secondRow
    }
}

guard (3...4).contains(CommandLine.arguments.count) else {
    fputs("Usage: giga-image-ocr INPUT.png OUTPUT.json [--overview-only]\n", stderr)
    exit(2)
}
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let overviewOnly = CommandLine.arguments.count == 4 && CommandLine.arguments[3] == "--overview-only"
guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
      let original = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary) else {
    fputs("Cannot open source image\n", stderr)
    exit(1)
}
let width = original.width
let height = original.height
let step = 2400
let margin = 300
var allWords: [Recognition] = []
var allLines: [Recognition] = []
var failedTiles: [Int] = []
var tileIndex = 0
let tileCount = Int(ceil(Double(width) / Double(step))) * Int(ceil(Double(height) / Double(step)))
let wordPattern = try NSRegularExpression(pattern: "\\S+")
if overviewOnly {
    let previous = try JSONDecoder().decode(OCRResult.self, from: Data(contentsOf: output))
    guard previous.width == width && previous.height == height else {
        fputs("Existing OCR dimensions do not match input\n", stderr)
        exit(1)
    }
    allWords = previous.words
    allLines = previous.lines
    failedTiles = previous.failedTiles
}
print("OCR \(input.lastPathComponent): \(width) × \(height), \(tileCount) tiles")
fflush(stdout)

if !overviewOnly {
for y in stride(from: 0, to: height, by: step) {
    for x in stride(from: 0, to: width, by: step) {
        tileIndex += 1
        autoreleasepool {
            let core = CGRect(x: x, y: y, width: min(step, width - x), height: min(step, height - y))
            let crop = core.insetBy(dx: -CGFloat(margin), dy: -CGFloat(margin))
                .intersection(CGRect(x: 0, y: 0, width: width, height: height)).integral
            guard let cropped = original.cropping(to: crop),
                  let bitmap = CGContext(data: nil, width: Int(crop.width), height: Int(crop.height),
                    bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                failedTiles.append(tileIndex)
                return
            }
            // A cropped CGImage may retain the complete encoded PNG provider.
            // Detach it so Vision sees a small, already-decoded bitmap.
            bitmap.draw(cropped, in: CGRect(x: 0, y: 0, width: crop.width, height: crop.height))
            guard let image = bitmap.makeImage() else {
                failedTiles.append(tileIndex)
                return
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = true
            request.minimumTextHeight = 0.002
            request.preferBackgroundProcessing = true
            do {
                try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
                for observation in request.results ?? [] {
                    guard let text = observation.topCandidates(1).first, !text.string.isEmpty else { continue }
                    let lineBox = globalBox(observation.boundingBox, crop: crop)
                    let lineCenter = CGPoint(x: lineBox[0] + lineBox[2] / 2, y: lineBox[1] + lineBox[3] / 2)
                    if core.contains(lineCenter) {
                        allLines.append(Recognition(text: text.string, confidence: text.confidence,
                            bbox: lineBox, tile: tileIndex, edgeDistance: edgeDistance(lineBox, crop: crop)))
                    }
                    let fullRange = NSRange(text.string.startIndex..<text.string.endIndex, in: text.string)
                    for match in wordPattern.matches(in: text.string, range: fullRange) {
                        guard let range = Range(match.range, in: text.string),
                              let wordObservation = try? text.boundingBox(for: range) else { continue }
                        let box = globalBox(wordObservation.boundingBox, crop: crop)
                        let edge = edgeDistance(box, crop: crop)
                        // Ignore fragments cropped at interior tile boundaries;
                        // the overlapping neighbour provides the complete word.
                        if (crop.minX > 0 && box[0] - crop.minX < 5) ||
                           (crop.minY > 0 && box[1] - crop.minY < 5) ||
                           (crop.maxX < Double(width) && crop.maxX - box[0] - box[2] < 5) ||
                           (crop.maxY < Double(height) && crop.maxY - box[1] - box[3] < 5) { continue }
                        allWords.append(Recognition(text: String(text.string[range]), confidence: text.confidence,
                            bbox: box, tile: tileIndex, edgeDistance: edge))
                    }
                }
            } catch {
                failedTiles.append(tileIndex)
                fputs("Tile \(tileIndex) failed: \(error)\n", stderr)
            }
        }
        print("Tile \(tileIndex)/\(tileCount): \(allWords.count) word observations")
        fflush(stdout)
    }
}
}

// A whole-image pass recovers unusually large heading words that can span
// several tile boundaries. Smaller text still comes from original-size tiles.
autoreleasepool {
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 4096,
        kCGImageSourceShouldCacheImmediately: true
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
          let bitmap = CGContext(data: nil, width: thumbnail.width, height: thumbnail.height,
            bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        failedTiles.append(0)
        return
    }
    bitmap.draw(thumbnail, in: CGRect(x: 0, y: 0, width: thumbnail.width, height: thumbnail.height))
    guard let image = bitmap.makeImage() else {
        failedTiles.append(0)
        return
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.004
    request.preferBackgroundProcessing = true
    let entireImage = CGRect(x: 0, y: 0, width: width, height: height)
    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        for observation in request.results ?? [] {
            guard let text = observation.topCandidates(1).first, text.confidence >= 0.3 else { continue }
            let lineBox = globalBox(observation.boundingBox, crop: entireImage)
            guard lineBox[3] >= 120 else { continue }
            allLines.append(Recognition(text: text.string, confidence: text.confidence,
                bbox: lineBox, tile: 0, edgeDistance: 300))
            let fullRange = NSRange(text.string.startIndex..<text.string.endIndex, in: text.string)
            for match in wordPattern.matches(in: text.string, range: fullRange) {
                guard let range = Range(match.range, in: text.string),
                      let wordObservation = try? text.boundingBox(for: range) else { continue }
                let box = globalBox(wordObservation.boundingBox, crop: entireImage)
                allWords.append(Recognition(text: String(text.string[range]), confidence: text.confidence,
                    bbox: box, tile: 0, edgeDistance: 300))
            }
        }
        print("Whole-map heading pass complete")
    } catch {
        failedTiles.append(0)
        fputs("Whole-map heading pass failed: \(error)\n", stderr)
    }
}

let words = deduplicate(allWords)
let lines = deduplicate(allLines)
guard !words.isEmpty else {
    fputs("OCR produced no words\n", stderr)
    exit(1)
}
let result = OCRResult(source: input.lastPathComponent, width: width, height: height,
    engine: "Apple Vision VNRecognizeTextRequest; accurate original-resolution tiles; supplementary reduced-resolution headings",
    coordinates: "Original image pixels; top-left origin; bbox = [x, y, width, height]",
    language: "en-US", note: "Machine-recognized text is approximate. Artwork is authoritative. Word positions support an invisible PDF search layer; reading order is not guaranteed.",
    tileCount: tileCount, failedTiles: failedTiles, lines: lines, words: words)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
try encoder.encode(result).write(to: output, options: .atomic)
try lines.map(\.text).joined(separator: "\n").write(to: output.deletingPathExtension().appendingPathExtension("txt"), atomically: true, encoding: .utf8)
print("Saved \(words.count) distinct words and \(lines.count) lines to \(output.path); failed tiles: \(failedTiles)")
