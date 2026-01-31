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
                VStack(spacing: Theme.Spacing.xl) {
                    // Barcode preview
                    previewSection

                    // Form fields
                    formFields
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(isEditing ? "Edit Barcode" : "Add Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Theme.accent)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(isEditing ? "Save" : "Add") {
                        Task { await save() }
                    }
                    .foregroundColor(isFormValid ? Theme.accent : Theme.disabled)
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
        VStack(spacing: Theme.Spacing.md) {
            SectionHeader(title: "Preview")

            VStack(spacing: Theme.Spacing.sm) {
                if !value.isEmpty {
                    BarcodeImageView(value: value, barcodeType: barcodeType, height: 100)
                        .padding(Theme.Spacing.md)
                        .background(Color.white)
                        .cornerRadius(Theme.CornerRadius.md)
                        .padding(.horizontal, Theme.Spacing.md)
                        .padding(.top, Theme.Spacing.md)
                } else {
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 100)
                        .overlay(
                            Text("Enter a value to see preview")
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        )
                        .padding(.horizontal, Theme.Spacing.md)
                        .padding(.top, Theme.Spacing.md)
                }

                // Label area with selected color
                Text(label.isEmpty ? "Label" : label)
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(Theme.Spacing.md)
                    .background(Color(hex: String(selectedColor.dropFirst())))
                    .cornerRadius(Theme.CornerRadius.md)
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.md)
            }
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Form Fields

    @ViewBuilder
    private var formFields: some View {
        VStack(spacing: Theme.Spacing.lg) {
            // Label field
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Label")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)
                TextField("e.g. Gym, Library", text: $label)
                    .textFieldStyle(BarcodeTextFieldStyle())
            }

            // Value field
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
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
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Barcode Type")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: Theme.Spacing.sm) {
                    ForEach(BarcodeType.allCases, id: \.self) { type in
                        Button(action: { barcodeType = type }) {
                            Text(type.displayName)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(barcodeType == type ? .white : Theme.textSecondary)
                                .padding(.horizontal, Theme.Spacing.md)
                                .padding(.vertical, Theme.Spacing.sm)
                                .background(barcodeType == type ? Theme.accent : Theme.backgroundTertiary)
                                .cornerRadius(Theme.CornerRadius.md)
                        }
                    }
                }
            }

            // Color picker
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Color")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: Theme.Spacing.sm) {
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

/// Custom text field style matching the app theme
struct BarcodeTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundTertiary)
            .cornerRadius(Theme.CornerRadius.md)
            .foregroundColor(Theme.textPrimary)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}
