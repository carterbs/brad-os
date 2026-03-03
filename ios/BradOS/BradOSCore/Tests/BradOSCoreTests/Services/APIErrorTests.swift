import Testing
@testable import BradOSCore

@Suite("APIError")
struct APIErrorTests {

    @Test("validation error has correct message")
    func validationError() {
        let error = APIError.validation("Name is required")
        #expect(error.message == "Name is required")
        #expect(error.isValidationError)
    }

    @Test("notFound error has correct message")
    func notFoundError() {
        let error = APIError.notFound("Exercise 42 not found")
        #expect(error.message == "Exercise 42 not found")
        #expect(error.isNotFoundError)
    }

    @Test("network error wraps underlying error")
    func networkError() {
        let underlying = NSError(domain: "network", code: -1009)
        let error = APIError.network(underlying)
        #expect(error.isNetworkError)
    }

    @Test("internalError has message")
    func internalError() {
        let error = APIError.internalError("Server error")
        #expect(error.message == "Server error")
    }

    @Test("conflict error has correct status code")
    func conflictError() {
        let error = APIError.conflict("Resource already exists")
        #expect(error.statusCode == 409)
    }

    @Test("forbidden error has correct status code")
    func forbiddenError() {
        let error = APIError.forbidden("Access denied")
        #expect(error.statusCode == 403)
    }

    @Test("decoding error contains decode message")
    func decodingError() {
        let underlying = NSError(domain: "decode", code: 1)
        let error = APIError.decoding(underlying)
        #expect(error.message.contains("decode"))
    }

    @Test("decoding error preserves DecodingError key path details")
    func decodingErrorPreservesKeyPath() {
        struct Dummy: Decodable { let storageSection: String }
        let json = Data(#"{"name":"Salt"}"#.utf8)
        do {
            _ = try JSONDecoder().decode(Dummy.self, from: json)
            Issue.record("Expected DecodingError but decode succeeded")
        } catch {
            let apiError = APIError.decoding(error)
            // String(describing:) should include the missing key name
            #expect(apiError.message.contains("storageSection"))
            #expect(apiError.code == .decodingError)
            #expect(apiError.statusCode == nil)
        }
    }

    @Test("unknown error has optional status code")
    func unknownError() {
        let error = APIError.unknown("Something went wrong", statusCode: 418)
        #expect(error.statusCode == 418)
        #expect(error.code == .unknown)
    }
}
