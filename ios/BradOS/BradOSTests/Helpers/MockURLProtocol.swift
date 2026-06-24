import Foundation

/// Mock URLProtocol for stubbing HTTP requests in unit tests
/// Allows tests to control API responses without hitting the real backend
final class MockURLProtocol: URLProtocol {
    /// Static handler closure that processes requests
    /// Set this to control what responses your tests get
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    private static var pathHandlers: [(pathPrefix: String, handler: (URLRequest) throws -> (HTTPURLResponse, Data))] = []
    private static let lock = NSLock()

    static func setHandler(
        forPathPrefix pathPrefix: String,
        handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) {
        lock.lock()
        defer { lock.unlock() }
        pathHandlers.removeAll { $0.pathPrefix == pathPrefix }
        pathHandlers.append((pathPrefix, handler))
    }

    /// Reset the handler for test isolation
    static func reset() {
        lock.lock()
        defer { lock.unlock() }
        requestHandler = nil
        pathHandlers = []
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
        guard let handler = Self.handler(for: request) else {
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

    private static func handler(
        for request: URLRequest
    ) -> ((URLRequest) throws -> (HTTPURLResponse, Data))? {
        lock.lock()
        defer { lock.unlock() }

        let path = request.url?.path ?? ""
        return pathHandlers.first { path.hasPrefix($0.pathPrefix) }?.handler ?? requestHandler
    }
}
