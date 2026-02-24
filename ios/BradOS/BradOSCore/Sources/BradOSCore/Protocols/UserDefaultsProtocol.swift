import Foundation

/// Protocol for UserDefaults dependency injection in tests
public protocol UserDefaultsProtocol {
    func data(forKey defaultName: String) -> Data?
    func string(forKey defaultName: String) -> String?
    func set(_ value: Any?, forKey defaultName: String)
    func removeObject(forKey defaultName: String)
}

extension UserDefaults: UserDefaultsProtocol {}
