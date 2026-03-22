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

protocol ReminderStoreProtocol: Sendable {
    associatedtype ReminderList

    func requestFullAccessToReminders() async throws -> Bool
    func findOrCreateList(named targetName: String) throws -> ReminderList
    func removeAllReminders(in list: ReminderList) async throws -> Int
    func saveReminder(title: String, in list: ReminderList) throws
    func commit() throws
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
        try await Self.exportToReminders(
            sections,
            listName: Self.listName,
            using: EventKitReminderStore()
        )
    }

    static func exportToReminders<Store: ReminderStoreProtocol>(
        _ sections: [ShoppingListSection],
        listName targetName: String,
        using store: Store
    ) async throws -> RemindersExportResult {
        log.info("[export] requesting Reminders access…")
        let granted = try await store.requestFullAccessToReminders()
        guard granted else {
            log.error("[export] Reminders access DENIED")
            throw RemindersError.accessDenied
        }
        log.info("[export] Reminders access granted")

        let list = try store.findOrCreateList(named: targetName)
        log.info("[export] using list '\(targetName, privacy: .public)'")

        let removedCount = try await store.removeAllReminders(in: list)
        log.info("[export] cleared \(removedCount) existing reminders from '\(targetName, privacy: .public)'")

        let items = sections.flatMap { $0.items }
        if items.isEmpty {
            try store.commit()
            log.warning("[export] no items to export — returning 0")
            return RemindersExportResult(itemCount: 0, listName: targetName)
        }

        log.info("[export] saving \(items.count) reminders…")
        for item in items {
            try store.saveReminder(title: item.displayText, in: list)
        }

        do {
            try store.commit()
            log.info("[export] batch commit succeeded — \(items.count) items saved")
        } catch {
            log.error("[export] batch commit FAILED: \(error)")
            throw RemindersError.exportFailed(error.localizedDescription)
        }

        return RemindersExportResult(itemCount: items.count, listName: targetName)
    }
}

private struct EventKitReminderStore: ReminderStoreProtocol, @unchecked Sendable {
    private let store: EKEventStore

    init(store: EKEventStore = EKEventStore()) {
        self.store = store
    }

    func requestFullAccessToReminders() async throws -> Bool {
        try await store.requestFullAccessToReminders()
    }

    func findOrCreateList(named targetName: String) throws -> EKCalendar {
        store.refreshSourcesIfNecessary()

        let calendars = store.calendars(for: .reminder)
        if let existing = calendars.first(where: { $0.title == targetName }) {
            return existing
        }

        let newList = EKCalendar(for: .reminder, eventStore: store)
        newList.title = targetName

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

    func removeAllReminders(in list: EKCalendar) async throws -> Int {
        let reminders = try await fetchReminders(in: list)
        for reminder in reminders {
            try store.remove(reminder, commit: false)
        }
        return reminders.count
    }

    func saveReminder(title: String, in list: EKCalendar) throws {
        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.calendar = list
        try store.save(reminder, commit: false)
    }

    func commit() throws {
        try store.commit()
    }

    private func fetchReminders(in list: EKCalendar) async throws -> [EKReminder] {
        let predicate = store.predicateForReminders(in: [list])
        return try await withCheckedThrowingContinuation { continuation in
            store.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
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
