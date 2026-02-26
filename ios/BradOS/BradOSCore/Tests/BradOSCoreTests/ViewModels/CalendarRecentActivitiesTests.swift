import Foundation
import Testing
@testable import BradOSCore

@Suite("CalendarRecentActivities")
struct CalendarRecentActivitiesTests {
    private func makeDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        var comps = DateComponents()
        comps.year = year
        comps.month = month
        comps.day = day
        comps.hour = hour
        comps.minute = minute
        comps.second = 0
        return Calendar.current.date(from: comps) ?? Date()
    }

    private func makeActivity(
        id: String,
        type: ActivityType,
        date: Date,
        completedAt: Date?
    ) -> CalendarActivity {
        CalendarActivity(
            id: id,
            type: type,
            date: date,
            completedAt: completedAt,
            summary: ActivitySummary()
        )
    }

    private func key(for date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    @Test("recentActivities prioritizes completedAt when present and date when absent")
    @MainActor
    func recentActivitiesSortOrderMixedCompletion() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())

        let d1 = makeDate(2026, 3, 1, 8)
        let d2 = makeDate(2026, 3, 2, 8)
        let d3 = makeDate(2026, 3, 3, 8)

        let a = makeActivity(id: "a", type: .workout, date: d1, completedAt: nil)
        let b = makeActivity(id: "b", type: .stretch, date: d2, completedAt: makeDate(2026, 3, 3, 7))
        let c = makeActivity(id: "c", type: .cycling, date: d3, completedAt: makeDate(2026, 3, 3, 9))

        vm.activitiesByDate = [
            key(for: d1): [a],
            key(for: d2): [b],
            key(for: d3): [c],
        ]

        let recent = vm.recentActivities(limit: 3)
        #expect(recent.map(\.id) == ["c", "b", "a"])
    }

    @Test("recentActivities uses deterministic id tie-break when timestamps match")
    @MainActor
    func recentActivitiesDeterministicTieBreak() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())

        let now = makeDate(2026, 3, 5, 10)
        let x = makeActivity(id: "x-2", type: .workout, date: now, completedAt: now)
        let y = makeActivity(id: "x-1", type: .stretch, date: now, completedAt: now)

        vm.activitiesByDate = [key(for: now): [x, y]]

        let recent = vm.recentActivities(limit: 2)
        #expect(recent.map(\.id) == ["x-1", "x-2"])
    }

    @Test("recentActivities respects explicit limit including zero and oversize")
    @MainActor
    func recentActivitiesLimitBoundaries() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())

        let day = makeDate(2026, 3, 6, 8)
        vm.activitiesByDate = [
            key(for: day): [
                makeActivity(id: "1", type: .workout, date: day, completedAt: day),
                makeActivity(id: "2", type: .stretch, date: day, completedAt: day),
            ],
        ]

        #expect(vm.recentActivities(limit: 0).isEmpty)
        #expect(vm.recentActivities(limit: 10).count == 2)
    }

    @Test("activitiesForDate filter returns only selected type even with mixed content")
    @MainActor
    func activitiesForDateStrictFiltering() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())

        let day = makeDate(2026, 3, 7, 8)
        vm.activitiesByDate = [
            key(for: day): [
                makeActivity(id: "w", type: .workout, date: day, completedAt: day),
                makeActivity(id: "s", type: .stretch, date: day, completedAt: day),
                makeActivity(id: "m", type: .meditation, date: day, completedAt: day),
                makeActivity(id: "c", type: .cycling, date: day, completedAt: day),
            ],
        ]

        #expect(vm.activitiesForDate(day, filter: .workout).map(\.id) == ["w"])
        #expect(vm.activitiesForDate(day, filter: .stretch).map(\.id) == ["s"])
        #expect(vm.activitiesForDate(day, filter: .meditation).map(\.id) == ["m"])
        #expect(vm.activitiesForDate(day, filter: .cycling).map(\.id) == ["c"])
    }
}
