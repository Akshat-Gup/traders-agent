import Foundation
import Vision
import AppKit

let args = Array(CommandLine.arguments.dropFirst())
guard let path = args.first else {
    fputs("usage: swift scripts/ocr_image.swift <image-path>\n", stderr)
    exit(1)
}

let url = URL(fileURLWithPath: path)
guard let image = NSImage(contentsOf: url) else {
    fputs("failed to load image\n", stderr)
    exit(1)
}

var rect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    fputs("failed to convert image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

for observation in request.results ?? [] {
    if let top = observation.topCandidates(1).first {
        print(top.string)
    }
}
