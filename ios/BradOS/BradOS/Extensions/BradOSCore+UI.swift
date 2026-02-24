import SwiftUI
import BradOSCore

// MARK: - ActivityType UI Extensions

extension ActivityType {
    /// Color associated with this activity type (SwiftUI layer)
    var color: Color {
        switch self {
        case .workout: return Theme.lifting
        case .stretch: return Theme.stretch
        case .meditation: return Theme.meditation
        case .cycling: return Theme.cycling
        }
    }
}
