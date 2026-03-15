import Foundation
import PDFKit
import Vision
import AppKit

struct CLI {
    let pdfPath: String
    let pageLimit: Int?
    let startPage: Int
    let dpi: CGFloat
    let preferExtractedText: Bool

    init() throws {
        let args = Array(CommandLine.arguments.dropFirst())
        guard !args.isEmpty else {
            throw NSError(domain: "ocr_pdf", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "usage: swift scripts/ocr_pdf.swift <pdf-path> [--start-page N] [--page-limit N] [--dpi N]"
            ])
        }

        var pdfPath: String?
        var pageLimit: Int?
        var startPage = 1
        var dpi: CGFloat = 144
        var preferExtractedText = true
        var i = 0
        while i < args.count {
            let arg = args[i]
            switch arg {
            case "--page-limit":
                i += 1
                pageLimit = Int(args[i])
            case "--start-page":
                i += 1
                startPage = Int(args[i]) ?? 1
            case "--dpi":
                i += 1
                dpi = CGFloat(Double(args[i]) ?? 144)
            case "--ocr-only":
                preferExtractedText = false
            default:
                if pdfPath == nil {
                    pdfPath = arg
                }
            }
            i += 1
        }

        guard let pdfPath else {
            throw NSError(domain: "ocr_pdf", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "missing pdf path"
            ])
        }

        self.pdfPath = pdfPath
        self.pageLimit = pageLimit
        self.startPage = max(1, startPage)
        self.dpi = dpi
        self.preferExtractedText = preferExtractedText
    }
}

func render(page: PDFPage, dpi: CGFloat) -> CGImage? {
    let pageRect = page.bounds(for: .mediaBox)
    let scale = dpi / 72.0
    let width = Int(pageRect.width * scale)
    let height = Int(pageRect.height * scale)
    guard width > 0, height > 0 else { return nil }

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        return nil
    }

    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.saveGState()
    context.scaleBy(x: scale, y: scale)
    context.translateBy(x: 0, y: pageRect.height)
    context.scaleBy(x: 1, y: -1)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()
    return context.makeImage()
}

func recognizeText(from image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

let cli = try CLI()
let url = URL(fileURLWithPath: cli.pdfPath)
guard let document = PDFDocument(url: url) else {
    fputs("failed to open \(cli.pdfPath)\n", stderr)
    exit(1)
}

let startIndex = cli.startPage - 1
let endIndexExclusive: Int
if let pageLimit = cli.pageLimit {
    endIndexExclusive = min(document.pageCount, startIndex + pageLimit)
} else {
    endIndexExclusive = document.pageCount
}

for pageIndex in startIndex..<endIndexExclusive {
    guard let page = document.page(at: pageIndex) else {
        print("=== PAGE \(pageIndex + 1) ===")
        print("[page load failed]")
        continue
    }
    let directText = cli.preferExtractedText ? (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) : ""
    let text: String
    if !directText.isEmpty {
        text = directText
    } else if let image = render(page: page, dpi: cli.dpi) {
        text = try recognizeText(from: image)
    } else {
        text = "[render failed]"
    }
    print("=== PAGE \(pageIndex + 1) ===")
    print(text)
    print("")
}
