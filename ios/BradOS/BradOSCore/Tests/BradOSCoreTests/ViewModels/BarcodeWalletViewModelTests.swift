import Testing
@testable import BradOSCore

@Suite("BarcodeWalletViewModel")
struct BarcodeWalletViewModelTests {

    @Test("initial state is empty and idle")
    @MainActor
    func initialStateIsEmptyAndIdle() {
        let mock = MockAPIClient.empty
        let vm = BarcodeWalletViewModel(apiClient: mock)

        #expect(vm.barcodes.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.isSaving == false)
        #expect(vm.error == nil)
    }

    @Test("loadBarcodes success updates list and clears loading/error")
    @MainActor
    func loadBarcodesSuccessUpdatesListAndClearsLoadingAndError() async {
        let mock = MockAPIClient.withDelay(0.1)
        let expectedBarcodes = [
            makeBarcode(id: "barcode-1", label: "Gym", value: "111", barcodeType: .code128),
            makeBarcode(id: "barcode-2", label: "Pool", value: "222", barcodeType: .qr)
        ]
        mock.mockBarcodes = expectedBarcodes

        let vm = BarcodeWalletViewModel(apiClient: mock)

        async let load: Void = vm.loadBarcodes()
        await Task.yield()
        #expect(vm.isLoading == true)
        #expect(vm.error == nil)
        await load

        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
        #expect(vm.barcodes == expectedBarcodes)
    }

    @Test("loadBarcodes failure sets error and clears loading")
    @MainActor
    func loadBarcodesFailureSetsErrorAndClearsLoading() async {
        let mock = MockAPIClient.failing()
        mock.delay = 0.1
        let priorBarcodes = [makeBarcode(id: "barcode-keep", label: "Before", value: "333")]
        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = priorBarcodes

        vm.error = "Previous error"

        async let load: Void = vm.loadBarcodes()
        await Task.yield()
        #expect(vm.isLoading == true)
        #expect(vm.error == nil)
        await load

        #expect(vm.isLoading == false)
        #expect(vm.error == "Failed to load barcodes")
        #expect(vm.barcodes == priorBarcodes)
    }

    @Test("createBarcode success toggles isSaving and appends barcode")
    @MainActor
    func createBarcodeSuccessTogglesIsSavingAndAppendsBarcode() async {
        let mock = MockAPIClient.withDelay(0.1)
        let initialBarcodes = [makeBarcode(id: "barcode-1", label: "Gym", value: "111")]
        mock.mockBarcodes = initialBarcodes

        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes
        let createLabel = "Office"
        let createValue = "777"
        let createColor = "#AABBCC"
        let createType = BarcodeType.code39

        async let result: Bool = vm.createBarcode(
            label: createLabel,
            value: createValue,
            barcodeType: createType,
            color: createColor
        )
        await Task.yield()
        #expect(vm.isSaving == true)
        #expect(vm.error == nil)
        let didCreate = await result
        #expect(didCreate == true)
        #expect(vm.isSaving == false)
        #expect(vm.error == nil)
        #expect(vm.barcodes.count == initialBarcodes.count + 1)

        guard let createdBarcode = vm.barcodes.last else {
            Issue.record("Expected a barcode to be appended after create")
            return
        }
        #expect(createdBarcode.label == createLabel)
        #expect(createdBarcode.value == createValue)
        #expect(createdBarcode.barcodeType == createType)
        #expect(createdBarcode.color == createColor)
    }

    @Test("createBarcode failure toggles isSaving and sets error")
    @MainActor
    func createBarcodeFailureTogglesIsSavingAndSetsError() async {
        let mock = MockAPIClient.failing()
        mock.delay = 0.1
        let initialBarcodes = [makeBarcode(id: "barcode-1", label: "Gym", value: "111")]
        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes

        vm.error = "Previous error"

        async let result: Bool = vm.createBarcode(
            label: "Office",
            value: "777",
            barcodeType: .qr,
            color: "#AABBCC"
        )
        await Task.yield()
        #expect(vm.isSaving == true)
        #expect(vm.error == nil)
        let didCreate = await result
        #expect(didCreate == false)
        #expect(vm.isSaving == false)
        #expect(vm.error == "Failed to create barcode")
        #expect(vm.barcodes == initialBarcodes)
    }

    @Test("updateBarcode success toggles isSaving and updates matching local barcode")
    @MainActor
    func updateBarcodeSuccessTogglesIsSavingAndUpdatesMatchingLocalBarcode() async {
        let mock = MockAPIClient.withDelay(0.1)
        let initialBarcodes = [
            makeBarcode(id: "barcode-1", label: "Gym", value: "111"),
            makeBarcode(id: "barcode-2", label: "Library", value: "222")
        ]
        mock.mockBarcodes = initialBarcodes

        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes

        let updatedLabel = "Updated Gym"
        let updatedValue = "999"
        let updatedColor = "#FF00FF"
        let updatedType = BarcodeType.qr

        async let result: Bool = vm.updateBarcode(
            id: "barcode-1",
            label: updatedLabel,
            value: updatedValue,
            barcodeType: updatedType,
            color: updatedColor
        )
        await Task.yield()
        #expect(vm.isSaving == true)
        #expect(vm.error == nil)
        let didUpdate = await result
        #expect(didUpdate == true)
        #expect(vm.isSaving == false)
        #expect(vm.error == nil)

        let updatedBarcode = vm.barcodes.first { $0.id == "barcode-1" }
        #expect(updatedBarcode != nil)
        #expect(updatedBarcode?.label == updatedLabel)
        #expect(updatedBarcode?.value == updatedValue)
        #expect(updatedBarcode?.barcodeType == updatedType)
        #expect(updatedBarcode?.color == updatedColor)
        #expect(vm.barcodes.count == 2)
    }

    @Test("updateBarcode failure toggles isSaving and sets error")
    @MainActor
    func updateBarcodeFailureTogglesIsSavingAndSetsError() async {
        let mock = MockAPIClient.failing()
        mock.delay = 0.1
        let initialBarcodes = [makeBarcode(id: "barcode-1", label: "Gym", value: "111")]
        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes

        vm.error = "Previous error"

        async let result: Bool = vm.updateBarcode(
            id: "barcode-1",
            label: "Gym Updated",
            value: "999",
            barcodeType: .qr,
            color: "#000000"
        )
        await Task.yield()
        #expect(vm.isSaving == true)
        #expect(vm.error == nil)
        let didUpdate = await result
        #expect(didUpdate == false)
        #expect(vm.isSaving == false)
        #expect(vm.error == "Failed to update barcode")
        #expect(vm.barcodes == initialBarcodes)
    }

    @Test("deleteBarcode success clears error and removes local barcode")
    @MainActor
    func deleteBarcodeSuccessClearsErrorAndRemovesLocalBarcode() async {
        let mock = MockAPIClient.withDelay(0.1)
        let initialBarcodes = [
            makeBarcode(id: "barcode-1", label: "Gym", value: "111"),
            makeBarcode(id: "barcode-2", label: "Library", value: "222")
        ]
        mock.mockBarcodes = initialBarcodes

        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes
        vm.error = "Previous error"

        async let task: Void = vm.deleteBarcode(id: "barcode-1")
        await Task.yield()
        #expect(vm.error == nil)
        await task

        #expect(vm.error == nil)
        #expect(vm.isSaving == false)
        #expect(vm.barcodes.count == 1)
        #expect(vm.barcodes.first?.id == "barcode-2")
    }

    @Test("deleteBarcode failure sets error and keeps local barcode")
    @MainActor
    func deleteBarcodeFailureSetsErrorAndKeepsLocalBarcode() async {
        let mock = MockAPIClient.failing()
        mock.delay = 0.1
        let initialBarcodes = [
            makeBarcode(id: "barcode-1", label: "Gym", value: "111"),
            makeBarcode(id: "barcode-2", label: "Library", value: "222")
        ]
        let vm = BarcodeWalletViewModel(apiClient: mock)
        vm.barcodes = initialBarcodes

        vm.error = "Previous error"

        async let task: Void = vm.deleteBarcode(id: "barcode-1")
        await Task.yield()
        #expect(vm.error == nil)
        await task

        #expect(vm.error == "Failed to delete barcode")
        #expect(vm.isSaving == false)
        #expect(vm.barcodes == initialBarcodes)
    }
}

private func makeBarcode(
    id: String,
    label: String,
    value: String,
    barcodeType: BarcodeType = .code128,
    color: String = "#E879F9",
    sortOrder: Int = 0,
    date: Date = fixedDate()
) -> Barcode {
    Barcode(
        id: id,
        label: label,
        value: value,
        barcodeType: barcodeType,
        color: color,
        sortOrder: sortOrder,
        createdAt: date,
        updatedAt: date
    )
}

private func fixedDate() -> Date {
    Date(timeIntervalSince1970: 1_700_000_000)
}
