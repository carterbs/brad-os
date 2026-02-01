import SwiftUI
import BradOSCore

/// Management screen for barcode wallet — list, add, edit, delete
struct BarcodeWalletView: View {
    @StateObject private var viewModel = BarcodeWalletViewModel(apiClient: APIClient.shared)
    @State private var showingAddSheet = false
    @State private var editingBarcode: Barcode?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space4) {
                if viewModel.isLoading {
                    loadingState
                } else if let error = viewModel.error, viewModel.barcodes.isEmpty {
                    errorState(error)
                } else if viewModel.barcodes.isEmpty {
                    emptyState
                } else {
                    barcodeList
                }
            }
            .padding(Theme.Spacing.space4)
        }
        .background(AuroraBackground())
        .navigationTitle("Barcode Wallet")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingAddSheet = true }) {
                    Image(systemName: "plus")
                        .foregroundColor(Theme.interactivePrimary)
                }
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            BarcodeFormView(viewModel: viewModel)
        }
        .sheet(item: $editingBarcode) { barcode in
            BarcodeFormView(viewModel: viewModel, editingBarcode: barcode)
        }
        .task {
            await viewModel.loadBarcodes()
        }
        .refreshable {
            await viewModel.loadBarcodes()
        }
    }

    // MARK: - Barcode List

    @ViewBuilder
    private var barcodeList: some View {
        ForEach(viewModel.barcodes) { barcode in
            BarcodeCardRow(barcode: barcode) {
                editingBarcode = barcode
            } onDelete: {
                Task { await viewModel.deleteBarcode(id: barcode.id) }
            }
        }
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 48))
                .foregroundColor(Theme.textSecondary)

            Text("No Barcodes Yet")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Text("Add your membership cards and loyalty barcodes for quick access.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Add Barcode") {
                showingAddSheet = true
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(Theme.Spacing.space7)
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.textSecondary)
            Text("Loading barcodes...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space7)
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String) -> some View {
        VStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundColor(Theme.destructive)

            Text(error)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            Button("Retry") {
                Task { await viewModel.loadBarcodes() }
            }
            .buttonStyle(.bordered)
            .tint(Theme.interactivePrimary)
        }
        .padding(Theme.Spacing.space7)
    }
}

/// A card row showing a barcode with its label and type
struct BarcodeCardRow: View {
    let barcode: Barcode
    let onEdit: () -> Void
    let onDelete: () -> Void

    @State private var showingDeleteAlert = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Barcode preview
            BarcodeImageView(value: barcode.value, barcodeType: barcode.barcodeType, height: 80)
                .padding(Theme.Spacing.space4)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                .padding(.horizontal, Theme.Spacing.space4)
                .padding(.top, Theme.Spacing.space4)

            // Info row
            HStack {
                // Color dot + label
                Circle()
                    .fill(Color(hex: String(barcode.color.dropFirst())))
                    .frame(width: 12, height: 12)

                Text(barcode.label)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Spacer()
            }
            .padding(Theme.Spacing.space4)
        }
        .glassCard(padding: 0)
        .contextMenu {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive, action: { showingDeleteAlert = true }) {
                Label("Delete", systemImage: "trash")
            }
        }
        .alert("Delete Barcode?", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive, action: onDelete)
        } message: {
            Text("This will permanently delete \"\(barcode.label)\".")
        }
    }
}
