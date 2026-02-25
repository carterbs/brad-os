import Foundation
import BradOSCore

// MARK: - Convenience Initializer

typealias CyclingViewModel = BradOSCore.CyclingViewModel

@MainActor
extension BradOSCore.CyclingViewModel {
    /// Convenience initializer that injects the shared APIClient for app integration
    convenience init() {
        self.init(apiClient: APIClient.shared)
    }
}
