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

public final class RemindersService: RemindersServiceProtocol, @unchecked Sendable {
    public static var listName: String {
        #if DEBUG && targetEnvironment(simulator)
        return "Groceries-2"
        #else
        return "Groceries"
        #endif
    }

    public init() {}

    public func exportToReminders(_ sections: [ShoppingListSection]) async throws -> RemindersExportResult {
        // Create a fresh store each call so it picks up the latest sources
        let store = EKEventStore()

        // Request full access (iOS 17+)
        let granted = try await store.requestFullAccessToReminders()
        guard granted else {
            throw RemindersError.accessDenied
        }

        let targetName = Self.listName

        // Wait for the store to finish loading sources after access is granted.
        // EKEventStore.calendars(for:) can return empty immediately after access
        // is first granted because sources haven't synced yet.
        let list = try await findList(named: targetName, in: store)

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

    /// Attempts to find the target reminder list, retrying briefly if the store
    /// hasn't finished loading its sources yet.
    private func findList(named targetName: String, in store: EKEventStore) async throws -> EKCalendar {
        // Try up to 5 times with short delays to let the store populate
        for attempt in 0..<5 {
            store.refreshSourcesIfNecessary()
            let calendars = store.calendars(for: .reminder)
            if let list = calendars.first(where: { $0.title == targetName }) {
                return list
            }
            // Don't sleep on the last attempt
            if attempt < 4 {
                try await Task.sleep(nanoseconds: 200_000_000) // 200ms
            }
        }

        // Final attempt failed — build a diagnostic message
        let calendars = store.calendars(for: .reminder)
        let available = calendars.map { $0.title }.joined(separator: ", ")
        let detail = available.isEmpty
            ? "No reminder lists found. Check that Reminders is set up on this device."
            : "Available lists: \(available)"
        throw RemindersError.listNotFound("\(targetName)\" not found. \(detail)")
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
