import SwiftUI
import BradOSCore

/// Renders a barcode image from a value and type
struct BarcodeImageView: View {
    let value: String
    let barcodeType: BarcodeType
    var height: CGFloat = 120

    var body: some View {
        GeometryReader { geometry in
            if let image = BarcodeRenderer.generate(
                value: value,
                type: barcodeType,
                size: CGSize(width: geometry.size.width, height: height)
            ) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                // Fallback if rendering fails
                VStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.title2)
                        .foregroundColor(Theme.textSecondary)
                    Text(value)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(height: height)
    }
}
