import UIKit
import CoreImage
import BradOSCore

/// Generates barcode images from string values
enum BarcodeRenderer {

    /// Generate a barcode UIImage for the given value and type
    static func generate(value: String, type: BarcodeType, size: CGSize) -> UIImage? {
        switch type {
        case .code128:
            return generateCIBarcode(value: value, filterName: "CICode128BarcodeGenerator", size: size)
        case .qr:
            return generateCIBarcode(value: value, filterName: "CIQRCodeGenerator", size: size)
        case .code39:
            return generateCode39(value: value, size: size)
        }
    }

    // MARK: - CIFilter-based (Code 128, QR)

    private static func generateCIBarcode(value: String, filterName: String, size: CGSize) -> UIImage? {
        let context = CIContext()
        guard let filter = CIFilter(name: filterName) else { return nil }
        guard let data = value.data(using: .ascii) else { return nil }
        filter.setValue(data, forKey: "inputMessage")

        guard let outputImage = filter.outputImage else { return nil }

        // Scale to requested size (nearest-neighbor for crisp bars)
        let scaleX = size.width / outputImage.extent.width
        let scaleY = size.height / outputImage.extent.height
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Custom Code 39 Renderer

    /// Code 39 character encoding patterns
    /// Each character is encoded as 9 elements: 5 bars + 4 spaces (alternating bar/space)
    /// 'w' = wide element, 'n' = narrow element
    private static let code39Patterns: [Character: [Bool]] = {
        // Pattern strings: 9 chars each, alternating bar/space
        // true = wide, false = narrow
        let raw: [Character: String] = [
            "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw",
            "3": "wnwwnnnnn", "4": "nnnwwnnnw", "5": "wnnwwnnnn",
            "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn",
            "9": "nnwwnnwnn",
            "A": "wnnnnwnnw", "B": "nnwnnwnnw", "C": "wnwnnwnnn",
            "D": "nnnnwwnnw", "E": "wnnnwwnnn", "F": "nnwnwwnnn",
            "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn",
            "J": "nnnnwwwnn",
            "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn",
            "N": "nnnnwnnww", "O": "wnnnwnnwn", "P": "nnwnwnnwn",
            "Q": "nnnnnnwww", "R": "wnnnnnwwn", "S": "nnwnnnwwn",
            "T": "nnnnwnwwn",
            "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn",
            "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
            "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn",
            "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn",
            "%": "nnnwnwnwn", "*": "nwnnwnwnn",
        ]
        var result: [Character: [Bool]] = [:]
        for (char, pattern) in raw {
            result[char] = pattern.map { $0 == "w" }
        }
        return result
    }()

    private static func generateCode39(value: String, size: CGSize) -> UIImage? {
        // Code 39 wraps value in start/stop character (*)
        let encoded = "*\(value.uppercased())*"

        // Validate all characters exist in the encoding table
        for char in encoded {
            guard code39Patterns[char] != nil else { return nil }
        }

        // Build the list of bar/space widths
        let narrowWidth: CGFloat = 1
        let wideWidth: CGFloat = 3
        let interCharGap: CGFloat = 1

        // Calculate total width
        var totalUnits: CGFloat = 0
        for (charIndex, char) in encoded.enumerated() {
            guard let pattern = code39Patterns[char] else { return nil }
            for isWide in pattern {
                totalUnits += isWide ? wideWidth : narrowWidth
            }
            if charIndex < encoded.count - 1 {
                totalUnits += interCharGap
            }
        }

        let scale = size.width / totalUnits

        // Render
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            // White background
            ctx.cgContext.setFillColor(UIColor.white.cgColor)
            ctx.cgContext.fill(CGRect(origin: .zero, size: size))

            var x: CGFloat = 0
            for (charIndex, char) in encoded.enumerated() {
                guard let pattern = code39Patterns[char] else { continue }
                for (elementIndex, isWide) in pattern.enumerated() {
                    let elementWidth = (isWide ? wideWidth : narrowWidth) * scale
                    let isBar = elementIndex % 2 == 0 // even indices are bars, odd are spaces
                    if isBar {
                        ctx.cgContext.setFillColor(UIColor.black.cgColor)
                        ctx.cgContext.fill(CGRect(x: x, y: 0, width: elementWidth, height: size.height))
                    }
                    x += elementWidth
                }
                // Inter-character gap (narrow space)
                if charIndex < encoded.count - 1 {
                    x += interCharGap * scale
                }
            }
        }
    }
}
