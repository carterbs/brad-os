import EventKit

// MARK: - Types

/// Result of a successful Reminders export
public struct RemindersExportResult: Sendable {
    public let itemCount: Int
    public let listName: String

    public init(itemCount: Int, listName: String) {
        self.itemCount = itemCount
        self.listName = listName
    }
}

/// Errors that can occur during Reminders export
public enum RemindersError: Error, Equatable {
    case accessDenied
    case listNotFound(String)
    case exportFailed(String)
}

// MARK: - Protocol

/// Protocol for exporting shopping list items to Apple Reminders
public protocol RemindersServiceProtocol: Sendable {
    func exportToReminders(_ sections: [ShoppingListSection]) async throws -> RemindersExportResult
}

// MARK: - Real Implementation

public final class RemindersService: RemindersServiceProtocol {
    public static var listName: String {
        #if DEBUG && targetEnvironment(simulator)
        return "Groceries-2"
        #else
        return "Groceries"
        #endif
    }

    private let store = EKEventStore()

    public init() {}

    public func exportToReminders(_ sections: [ShoppingListSection]) async throws -> RemindersExportResult {
        // Request full access (iOS 17+)
        let granted = try await store.requestFullAccessToReminders()
        guard granted else {
            throw RemindersError.accessDenied
        }

        let targetName = Self.listName

        // Ensure the store has up-to-date calendar data
        store.refreshSourcesIfNecessary()

        // Find the target list
        let calendars = store.calendars(for: .reminder)
        guard let list = calendars.first(where: { $0.title == targetName }) else {
            throw RemindersError.listNotFound(targetName)
        }

        // Collect all items
        let items = sections.flatMap { $0.items }
        guard !items.isEmpty else {
            return RemindersExportResult(itemCount: 0, listName: targetName)
        }

        // Create reminders (append only — never modify or remove existing items)
        for item in items {
            let reminder = EKReminder(eventStore: store)
            reminder.title = item.displayText
            reminder.calendar = list
            try store.save(reminder, commit: false)
        }

        // Batch commit
        do {
            try store.commit()
        } catch {
            throw RemindersError.exportFailed(error.localizedDescription)
        }

        return RemindersExportResult(itemCount: items.count, listName: targetName)
    }
}

// MARK: - Mock

public final class MockRemindersService: RemindersServiceProtocol, @unchecked Sendable {
    public var result: Result<RemindersExportResult, RemindersError>

    public init(result: Result<RemindersExportResult, RemindersError> = .success(
        RemindersExportResult(itemCount: 5, listName: "Groceries-2")
    )) {
        self.result = result
    }

    public func exportToReminders(_ sections: [ShoppingListSection]) async throws -> RemindersExportResult {
        switch result {
        case .success(let value):
            return value
        case .failure(let error):
            throw error
        }
    }
}
