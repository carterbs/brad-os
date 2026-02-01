import SwiftUI
import BradOSCore

/// Form for adding or editing a barcode
struct BarcodeFormView: View {
    @ObservedObject var viewModel: BarcodeWalletViewModel
    let editingBarcode: Barcode?

    @Environment(\.dismiss) private var dismiss

    @State private var label = ""
    @State private var value = ""
    @State private var barcodeType: BarcodeType = .code128
    @State private var selectedColor = "#6366F1"

    private let colorPresets: [(name: String, hex: String)] = [
        ("Indigo", "#6366F1"),
        ("Pink", "#E879F9"),
        ("Teal", "#14B8A6"),
        ("Orange", "#F97316"),
        ("Green", "#22C55E"),
        ("Blue", "#3B82F6"),
        ("Purple", "#A855F7"),
        ("Yellow", "#FACC15"),
    ]

    private var isEditing: Bool { editingBarcode != nil }
    private var isFormValid: Bool { !label.isEmpty && !value.isEmpty }

    init(viewModel: BarcodeWalletViewModel, editingBarcode: Barcode? = nil) {
        self.viewModel = viewModel
        self.editingBarcode = editingBarcode
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space7) {
                    // Barcode preview
                    previewSection

                    // Form fields
                    formFields
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground())
            .navigationTitle(isEditing ? "Edit Barcode" : "Add Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Theme.interactivePrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(isEditing ? "Save" : "Add") {
                        Task { await save() }
                    }
                    .foregroundColor(isFormValid ? Theme.interactivePrimary : Theme.textDisabled)
                    .fontWeight(.semibold)
                    .disabled(!isFormValid || viewModel.isSaving)
                }
            }
            .onAppear {
                if let barcode = editingBarcode {
                    label = barcode.label
                    value = barcode.value
                    barcodeType = barcode.barcodeType
                    selectedColor = barcode.color
                }
            }
        }
    }

    // MARK: - Preview Section

    @ViewBuilder
    private var previewSection: some View {
        VStack(spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Preview")

            VStack(spacing: Theme.Spacing.space2) {
                if !value.isEmpty {
                    BarcodeImageView(value: value, barcodeType: barcodeType, height: 100)
                        .padding(Theme.Spacing.space4)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                        .padding(.horizontal, Theme.Spacing.space4)
                        .padding(.top, Theme.Spacing.space4)
                } else {
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 100)
                        .overlay(
                            Text("Enter a value to see preview")
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        )
                        .padding(.horizontal, Theme.Spacing.space4)
                        .padding(.top, Theme.Spacing.space4)
                }

                // Label area with selected color
                Text(label.isEmpty ? "Label" : label)
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(Theme.Spacing.space4)
                    .background(Color(hex: String(selectedColor.dropFirst())))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                    .padding(.horizontal, Theme.Spacing.space4)
                    .padding(.bottom, Theme.Spacing.space4)
            }
            .glassCard(padding: 0)
        }
    }

    // MARK: - Form Fields

    @ViewBuilder
    private var formFields: some View {
        VStack(spacing: Theme.Spacing.space6) {
            // Label field
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Label")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)
                TextField("e.g. Gym, Library", text: $label)
                    .textFieldStyle(BarcodeTextFieldStyle())
            }

            // Value field
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Barcode Value")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)
                TextField("e.g. 657701658", text: $value)
                    .textFieldStyle(BarcodeTextFieldStyle())
                    .autocapitalization(.allCharacters)
                    .disableAutocorrection(true)
            }

            // Barcode type picker
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Barcode Type")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: Theme.Spacing.space2) {
                    ForEach(BarcodeType.allCases, id: \.self) { type in
                        let isSelected = barcodeType == type
                        Button(action: { barcodeType = type }) {
                            Text(type.displayName)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(isSelected ? Theme.textOnAccent : Theme.textSecondary)
                                .padding(.horizontal, Theme.Spacing.space4)
                                .padding(.vertical, Theme.Spacing.space2)
                                .background(isSelected ? AnyShapeStyle(Theme.interactivePrimary) : AnyShapeStyle(Color.white.opacity(0.06)))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                                        .stroke(isSelected ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                                )
                        }
                    }
                }
            }

            // Color picker
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Color")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: Theme.Spacing.space2) {
                    ForEach(colorPresets, id: \.hex) { preset in
                        Button(action: { selectedColor = preset.hex }) {
                            Circle()
                                .fill(Color(hex: String(preset.hex.dropFirst())))
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white, lineWidth: selectedColor == preset.hex ? 3 : 0)
                                )
                                .overlay(
                                    selectedColor == preset.hex
                                        ? Image(systemName: "checkmark")
                                            .font(.caption)
                                            .fontWeight(.bold)
                                            .foregroundColor(.white)
                                        : nil
                                )
                        }
                    }
                }
            }
        }
    }

    // MARK: - Save

    private func save() async {
        if let barcode = editingBarcode {
            let success = await viewModel.updateBarcode(
                id: barcode.id,
                label: label,
                value: value,
                barcodeType: barcodeType,
                color: selectedColor
            )
            if success { dismiss() }
        } else {
            let success = await viewModel.createBarcode(
                label: label,
                value: value,
                barcodeType: barcodeType,
                color: selectedColor
            )
            if success { dismiss() }
        }
    }
}

/// Custom text field style matching the Aurora Glass design system
/// H:52pt, R:12pt (Theme.CornerRadius.md), Glass L1 background
struct BarcodeTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, Theme.Spacing.space4)
            .frame(height: Theme.Dimensions.inputHeight)
            .background(Color.white.opacity(0.06))
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .foregroundColor(Theme.textPrimary)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.strokeSubtle, lineWidth: 1)
            )
    }
}
