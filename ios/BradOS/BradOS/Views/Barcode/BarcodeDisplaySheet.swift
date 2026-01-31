import SwiftUI
import BradOSCore

/// Full-screen barcode display optimized for scanning
/// Auto-boosts screen brightness and supports swiping between barcodes
struct BarcodeDisplaySheet: View {
    let barcodes: [Barcode]

    @State private var selectedIndex = 0
    @State private var previousBrightness: CGFloat = 0.5
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if barcodes.isEmpty {
                emptyState
            } else {
                TabView(selection: $selectedIndex) {
                    ForEach(Array(barcodes.enumerated()), id: \.element.id) { index, barcode in
                        barcodeCard(barcode)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: barcodes.count > 1 ? .always : .never))
                .indexViewStyle(.page(backgroundDisplayMode: .always))
            }

            // Dismiss button
            Button(action: { dismiss() }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundColor(.white.opacity(0.7))
            }
            .padding(Theme.Spacing.lg)
        }
        .background(Color.black)
        .onAppear {
            previousBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = 1.0
        }
        .onDisappear {
            UIScreen.main.brightness = previousBrightness
        }
    }

    // MARK: - Barcode Card

    @ViewBuilder
    private func barcodeCard(_ barcode: Barcode) -> some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 0) {
                // Barcode image on white background
                BarcodeImageView(
                    value: barcode.value,
                    barcodeType: barcode.barcodeType,
                    height: barcode.barcodeType == .qr ? 200 : 140
                )
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.vertical, Theme.Spacing.xl)
                .background(Color.white)

                // Label on colored background
                Text(barcode.label)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.lg)
                    .background(Color(hex: String(barcode.color.dropFirst())))
            }
            .cornerRadius(Theme.CornerRadius.xl)
            .padding(.horizontal, Theme.Spacing.lg)

            // Value text below card
            Text(barcode.value)
                .font(.system(.title3, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
                .padding(.top, Theme.Spacing.lg)

            Spacer()
        }
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 48))
                .foregroundColor(.white.opacity(0.5))

            Text("No Barcodes")
                .font(.headline)
                .foregroundColor(.white.opacity(0.7))

            Text("Add barcodes in Profile > Barcode Wallet")
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.5))
        }
    }
}
