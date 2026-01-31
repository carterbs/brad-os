import Foundation

/// Type of barcode encoding
public enum BarcodeType: String, Codable, CaseIterable, Sendable {
    case code128
    case code39
    case qr

    public var displayName: String {
        switch self {
        case .code128: return "Code 128"
        case .code39: return "Code 39"
        case .qr: return "QR Code"
        }
    }
}

/// A membership barcode stored in the wallet
public struct Barcode: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public var label: String
    public var value: String
    public var barcodeType: BarcodeType
    public var color: String
    public var sortOrder: Int
    public let createdAt: Date
    public var updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id
        case label
        case value
        case barcodeType = "barcode_type"
        case color
        case sortOrder = "sort_order"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        label: String,
        value: String,
        barcodeType: BarcodeType,
        color: String,
        sortOrder: Int,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.label = label
        self.value = value
        self.barcodeType = barcodeType
        self.color = color
        self.sortOrder = sortOrder
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - DTOs

/// Request body for POST /api/barcodes
public struct CreateBarcodeDTO: Encodable, Sendable {
    public let label: String
    public let value: String
    public let barcodeType: String
    public let color: String
    public let sortOrder: Int

    public enum CodingKeys: String, CodingKey {
        case label
        case value
        case barcodeType = "barcode_type"
        case color
        case sortOrder = "sort_order"
    }

    public init(label: String, value: String, barcodeType: BarcodeType, color: String, sortOrder: Int = 0) {
        self.label = label
        self.value = value
        self.barcodeType = barcodeType.rawValue
        self.color = color
        self.sortOrder = sortOrder
    }
}

/// Request body for PUT /api/barcodes/:id
public struct UpdateBarcodeDTO: Encodable, Sendable {
    public let label: String?
    public let value: String?
    public let barcodeType: String?
    public let color: String?
    public let sortOrder: Int?

    public enum CodingKeys: String, CodingKey {
        case label
        case value
        case barcodeType = "barcode_type"
        case color
        case sortOrder = "sort_order"
    }

    public init(
        label: String? = nil,
        value: String? = nil,
        barcodeType: BarcodeType? = nil,
        color: String? = nil,
        sortOrder: Int? = nil
    ) {
        self.label = label
        self.value = value
        self.barcodeType = barcodeType?.rawValue
        self.color = color
        self.sortOrder = sortOrder
    }
}

// MARK: - Mock Data

public extension Barcode {
    static let mockBarcodes: [Barcode] = [
        Barcode(
            id: "mock-barcode-1",
            label: "Gym",
            value: "657701658",
            barcodeType: .code128,
            color: "#E879F9",
            sortOrder: 0,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Barcode(
            id: "mock-barcode-2",
            label: "Augusta County Library",
            value: "299990603327G",
            barcodeType: .code39,
            color: "#FACC15",
            sortOrder: 1,
            createdAt: Date(),
            updatedAt: Date()
        ),
    ]
}
