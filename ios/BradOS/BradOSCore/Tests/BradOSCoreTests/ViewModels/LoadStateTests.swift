import Testing
@testable import BradOSCore

@Suite("LoadState")
struct LoadStateTests {

    @Test("idle state has no data and is not loading")
    func idleState() {
        let state: LoadState<String> = .idle
        #expect(state.data == nil)
        #expect(state.isLoading == false)
        #expect(state.error == nil)
    }

    @Test("loading state is loading")
    func loadingState() {
        let state: LoadState<String> = .loading
        #expect(state.isLoading == true)
        #expect(state.data == nil)
    }

    @Test("loaded state has data")
    func loadedState() {
        let state: LoadState<String> = .loaded("test data")
        #expect(state.data == "test data")
        #expect(state.isLoading == false)
        #expect(state.error == nil)
    }

    @Test("error state has error")
    func errorState() {
        let testError = NSError(domain: "test", code: 1)
        let state: LoadState<String> = .error(testError)
        #expect(state.error != nil)
        #expect(state.isLoading == false)
        #expect(state.data == nil)
    }

    @Test("loaded with empty array has data")
    func loadedWithEmptyArray() {
        let state: LoadState<[String]> = .loaded([])
        #expect(state.data != nil)
        #expect(state.data?.isEmpty == true)
    }

    // MARK: - Error.displayMessage

    @Test("displayMessage returns APIError message")
    func displayMessageAPIError() {
        let error: Error = APIError.validation("Name is required")
        #expect(error.displayMessage == "Name is required")
    }

    @Test("displayMessage returns localizedDescription for non-API errors")
    func displayMessageGenericError() {
        let error: Error = NSError(domain: "test", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Something went wrong"
        ])
        #expect(error.displayMessage == "Something went wrong")
    }
}
