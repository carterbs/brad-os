import Foundation

/// In-memory UserDefaults for testing
public final class MockUserDefaults: UserDefaultsProtocol {
    private var storage: [String: Any] = [:]

    public init() {}

    public func data(forKey defaultName: String) -> Data? {
        storage[defaultName] as? Data
    }

    public func string(forKey defaultName: String) -> String? {
        storage[defaultName] as? String
    }

    public func set(_ value: Any?, forKey defaultName: String) {
        if let value = value {
            storage[defaultName] = value
        } else {
            storage.removeValue(forKey: defaultName)
        }
    }

    public func removeObject(forKey defaultName: String) {
        storage.removeValue(forKey: defaultName)
    }

    public func clearAll() {
        storage.removeAll()
    }
}
