import Foundation
import BradOSCore

// MARK: - Type Alias

/// Use BradOSCore's CyclingAPIClientProtocol as the single source of truth
typealias CyclingAPIClientProtocol = BradOSCore.CyclingAPIClientProtocol

// MARK: - APIClient Conformance

// APIClient already has all these methods, so conformance is automatic
extension APIClient: CyclingAPIClientProtocol {}
