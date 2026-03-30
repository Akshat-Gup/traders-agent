import AppKit
import Foundation
import Vision

struct OCRItem: Codable {
    let path: String
    let text: String
}

struct OCRPayload: Codable {
    let items: [OCRItem]
}

func recognizeText(at imagePath: String) -> OCRItem {
    let url = URL(fileURLWithPath: imagePath)
    guard let image = NSImage(contentsOf: url) else {
        return OCRItem(path: imagePath, text: "")
    }

    var rect = NSRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        return OCRItem(path: imagePath, text: "")
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
        let text = (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
        return OCRItem(path: imagePath, text: text)
    } catch {
        return OCRItem(path: imagePath, text: "")
    }
}

let imagePaths = Array(CommandLine.arguments.dropFirst())
guard !imagePaths.isEmpty else {
    fputs("usage: swift ocr_pages.swift <image> [image...]\n", stderr)
    exit(1)
}

let payload = OCRPayload(items: imagePaths.map(recognizeText(at:)))
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted]

do {
    let data = try encoder.encode(payload)
    if let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        fputs("failed to encode payload\n", stderr)
        exit(2)
    }
} catch {
    fputs("failed to encode payload\n", stderr)
    exit(3)
}
