import Foundation

/// ViewModel for the Barcode Wallet feature
/// Manages CRUD operations for membership barcodes
@MainActor
public class BarcodeWalletViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var barcodes: [Barcode] = []
    @Published public var isLoading = false
    @Published public var error: String?
    @Published public var isSaving = false

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    public func loadBarcodes() async {
        isLoading = true
        error = nil

        do {
            barcodes = try await apiClient.getBarcodes()
        } catch {
            self.error = "Failed to load barcodes"
        }

        isLoading = false
    }

    // MARK: - CRUD Operations

    public func createBarcode(
        label: String,
        value: String,
        barcodeType: BarcodeType,
        color: String
    ) async -> Bool {
        isSaving = true
        error = nil

        let dto = CreateBarcodeDTO(
            label: label,
            value: value,
            barcodeType: barcodeType,
            color: color,
            sortOrder: barcodes.count
        )

        do {
            let barcode = try await apiClient.createBarcode(dto)
            barcodes.append(barcode)
            isSaving = false
            return true
        } catch {
            self.error = "Failed to create barcode"
            isSaving = false
            return false
        }
    }

    public func updateBarcode(
        id: String,
        label: String? = nil,
        value: String? = nil,
        barcodeType: BarcodeType? = nil,
        color: String? = nil
    ) async -> Bool {
        isSaving = true
        error = nil

        let dto = UpdateBarcodeDTO(
            label: label,
            value: value,
            barcodeType: barcodeType,
            color: color
        )

        do {
            let updated = try await apiClient.updateBarcode(id: id, dto: dto)
            if let index = barcodes.firstIndex(where: { $0.id == id }) {
                barcodes[index] = updated
            }
            isSaving = false
            return true
        } catch {
            self.error = "Failed to update barcode"
            isSaving = false
            return false
        }
    }

    public func deleteBarcode(id: String) async {
        error = nil

        do {
            try await apiClient.deleteBarcode(id: id)
            barcodes.removeAll { $0.id == id }
        } catch {
            self.error = "Failed to delete barcode"
        }
    }
}

// MARK: - Preview Support

public extension BarcodeWalletViewModel {
    static var preview: BarcodeWalletViewModel {
        let viewModel = BarcodeWalletViewModel(apiClient: MockAPIClient())
        viewModel.barcodes = Barcode.mockBarcodes
        return viewModel
    }

    static var empty: BarcodeWalletViewModel {
        let viewModel = BarcodeWalletViewModel(apiClient: MockAPIClient.empty)
        return viewModel
    }
}
