import AppKit
import Foundation
import Vision

struct OCRItem: Codable {
    let path: String
    let text: String
}

struct OCRResponse: Codable {
    let items: [OCRItem]
}

func recognizeText(at path: String) -> OCRItem {
    let url = URL(fileURLWithPath: path)
    guard
        let image = NSImage(contentsOf: url),
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let cgImage = bitmap.cgImage
    else {
        return OCRItem(path: path, text: "")
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return OCRItem(path: path, text: "")
    }

    let lines = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    return OCRItem(path: path, text: lines.joined(separator: "\n"))
}

let items = CommandLine.arguments.dropFirst().map { recognizeText(at: $0) }
let response = OCRResponse(items: items)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted]

if let data = try? encoder.encode(response),
   let text = String(data: data, encoding: .utf8) {
    FileHandle.standardOutput.write(text.data(using: .utf8)!)
}
