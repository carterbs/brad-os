import Foundation

/// Generic loading state for async data
public enum LoadState<T> {
    case idle
    case loading
    case loaded(T)
    case error(Error)

    public var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    public var data: T? {
        if case .loaded(let data) = self { return data }
        return nil
    }

    public var error: Error? {
        if case .error(let error) = self { return error }
        return nil
    }
}

// MARK: - Error Display

extension Error {
    /// User-facing error message, extracting APIError.message when available
    public var displayMessage: String {
        if let apiError = self as? APIError {
            return apiError.message
        }
        return localizedDescription
    }
}
