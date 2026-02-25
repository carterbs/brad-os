import Foundation

/// Mock URLProtocol for stubbing HTTP requests in unit tests
/// Allows tests to control API responses without hitting the real backend
final class MockURLProtocol: URLProtocol {
    /// Static handler closure that processes requests
    /// Set this to control what responses your tests get
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    /// Reset the handler for test isolation
    static func reset() {
        requestHandler = nil
    }

    /// Check if this protocol can handle the request (always yes for tests)
    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    /// Return a canonical form of the request (just return it as-is)
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    /// Handle the request by calling the static handler
    override func startLoading() {
        guard let handler = Self.requestHandler else {
            let error = NSError(domain: "MockURLProtocol", code: -1, userInfo: [NSLocalizedDescriptionKey: "No request handler configured"])
            client?.urlProtocol(self, didFailWithError: error)
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    /// Stop loading (no-op for mock)
    override func stopLoading() {}
}
