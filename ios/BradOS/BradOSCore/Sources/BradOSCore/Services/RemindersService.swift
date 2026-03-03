import EventKit
import os

private let log = Logger(subsystem: "com.bradcarter.brad-os", category: "shopping.reminders")

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
        log.info("[export] requesting Reminders access…")
        let granted = try await store.requestFullAccessToReminders()
        guard granted else {
            log.error("[export] Reminders access DENIED")
            throw RemindersError.accessDenied
        }
        log.info("[export] Reminders access granted")

        let targetName = Self.listName

        // Find or create the target list
        let list = try findOrCreateList(named: targetName, in: store)
        log.info("[export] using list '\(targetName, privacy: .public)' (id=\(list.calendarIdentifier, privacy: .public))")

        // Collect all items
        let items = sections.flatMap { $0.items }
        guard !items.isEmpty else {
            log.warning("[export] no items to export — returning 0")
            return RemindersExportResult(itemCount: 0, listName: targetName)
        }
        log.info("[export] saving \(items.count) reminders…")

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
            log.info("[export] batch commit succeeded — \(items.count) items saved")
        } catch {
            log.error("[export] batch commit FAILED: \(error)")
            throw RemindersError.exportFailed(error.localizedDescription)
        }

        return RemindersExportResult(itemCount: items.count, listName: targetName)
    }

    /// Finds the target reminder list, or creates it if it doesn't exist.
    private func findOrCreateList(named targetName: String, in store: EKEventStore) throws -> EKCalendar {
        store.refreshSourcesIfNecessary()

        let calendars = store.calendars(for: .reminder)
        if let existing = calendars.first(where: { $0.title == targetName }) {
            return existing
        }

        // List doesn't exist (common on simulator without iCloud) — create it
        let newList = EKCalendar(for: .reminder, eventStore: store)
        newList.title = targetName

        // Pick the best available source: prefer local, fall back to any
        if let local = store.sources.first(where: { $0.sourceType == .local }) {
            newList.source = local
        } else if let fallback = store.sources.first(where: {
            $0.sourceType == .calDAV || $0.sourceType == .subscribed
        }) {
            newList.source = fallback
        } else if let any = store.sources.first {
            newList.source = any
        } else {
            throw RemindersError.exportFailed("No calendar sources available.")
        }

        try store.saveCalendar(newList, commit: true)
        return newList
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
