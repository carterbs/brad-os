import Testing
import Foundation
@testable import BradOSCore

@Suite("CalendarViewModel")
struct CalendarViewModelTests {
    private func makeDate(year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        components.second = 0

        let calendar = Calendar.current
        guard let date = calendar.date(from: components) else {
            fatalError("Invalid date components: \(year)-\(month)-\(day) \(hour):\(minute)")
        }
        return date
    }

    private func makeActivity(id: String, type: ActivityType, date: Date, completedAt: Date? = nil) -> CalendarActivity {
        CalendarActivity(id: id, type: type, date: date, completedAt: completedAt, summary: ActivitySummary())
    }

    private func key(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    @Test("timezoneOffset calculates correctly")
    @MainActor
    func timezoneOffsetCalculation() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let offset = vm.timezoneOffset

        // Should be minutes from GMT (can be positive or negative)
        #expect(offset >= -720 && offset <= 720)
    }

    @Test("loadCalendarData fetches for current month")
    @MainActor
    func loadCalendarDataFetchesCurrentMonth() async {
        let mock = MockAPIClient()
        mock.mockCalendarData = CalendarData(
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            days: [:]
        )

        let vm = CalendarViewModel(apiClient: mock)
        await vm.loadCalendarData()

        #expect(vm.calendarData != nil)
        #expect(vm.isLoading == false)
    }

    @Test("navigateToNextMonth increments month")
    @MainActor
    func navigateToNextMonth() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let initialMonth = vm.currentMonth

        vm.navigateToNextMonth()

        let expected = Calendar.current.date(byAdding: .month, value: 1, to: initialMonth)!
        #expect(Calendar.current.isDate(vm.currentMonth, equalTo: expected, toGranularity: .month))
    }

    @Test("navigateToPreviousMonth decrements month")
    @MainActor
    func navigateToPreviousMonth() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let initialMonth = vm.currentMonth

        vm.navigateToPreviousMonth()

        let expected = Calendar.current.date(byAdding: .month, value: -1, to: initialMonth)!
        #expect(Calendar.current.isDate(vm.currentMonth, equalTo: expected, toGranularity: .month))
    }

    @Test("filter nil shows all activities")
    @MainActor
    func filterNilShowsAll() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = nil

        #expect(vm.shouldShowActivity(type: "workout") == true)
        #expect(vm.shouldShowActivity(type: "stretch") == true)
        #expect(vm.shouldShowActivity(type: "meditation") == true)
        #expect(vm.shouldShowActivity(type: "cycling") == true)
    }

    @Test("filter workout shows only workouts")
    @MainActor
    func filterWorkoutShowsWorkouts() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = "workout"

        #expect(vm.shouldShowActivity(type: "workout") == true)
        #expect(vm.shouldShowActivity(type: "stretch") == false)
        #expect(vm.shouldShowActivity(type: "meditation") == false)
    }

    @Test("filter stretch shows only stretches")
    @MainActor
    func filterStretchShowsStretches() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = "stretch"

        #expect(vm.shouldShowActivity(type: "workout") == false)
        #expect(vm.shouldShowActivity(type: "stretch") == true)
        #expect(vm.shouldShowActivity(type: "meditation") == false)
    }

    @Test("filter meditation shows only meditation")
    @MainActor
    func filterMeditationShowsMeditation() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = "meditation"

        #expect(vm.shouldShowActivity(type: "workout") == false)
        #expect(vm.shouldShowActivity(type: "stretch") == false)
        #expect(vm.shouldShowActivity(type: "meditation") == true)
        #expect(vm.shouldShowActivity(type: "cycling") == false)
    }

    @Test("filter cycling shows only cycling")
    @MainActor
    func filterCyclingShowsCycling() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = "cycling"

        #expect(vm.shouldShowActivity(type: "workout") == false)
        #expect(vm.shouldShowActivity(type: "stretch") == false)
        #expect(vm.shouldShowActivity(type: "meditation") == false)
        #expect(vm.shouldShowActivity(type: "cycling") == true)
    }

    @Test("activitiesForDate unfiltered overload returns all activities for the day")
    @MainActor
    func activitiesForDateUnfilteredOverloadReturnsAllActivities() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        let workout = makeActivity(id: "w-1", type: .workout, date: date, completedAt: date)
        let stretch = makeActivity(id: "s-1", type: .stretch, date: date, completedAt: date)
        let meditation = makeActivity(id: "m-1", type: .meditation, date: date, completedAt: date)
        vm.activitiesByDate[key(for: date)] = [workout, stretch, meditation]

        let activities = vm.activitiesForDate(date)

        #expect(activities.count == 3)
        #expect(activities.map(\.id) == ["w-1", "s-1", "m-1"])
        #expect(activities.map(\.type) == [.workout, .stretch, .meditation])
    }

    @Test("activitiesForDate optional nil filter returns all activities for the day")
    @MainActor
    func activitiesForDateOptionalNilFilterReturnsAllActivities() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        let workout = makeActivity(id: "w-1", type: .workout, date: date, completedAt: date)
        let stretch = makeActivity(id: "s-1", type: .stretch, date: date, completedAt: date)
        let meditation = makeActivity(id: "m-1", type: .meditation, date: date, completedAt: date)
        let cycling = makeActivity(id: "c-1", type: .cycling, date: date, completedAt: date)
        vm.activitiesByDate[key(for: date)] = [workout, stretch, meditation, cycling]

        let activities = vm.activitiesForDate(date, filter: nil)

        #expect(activities.count == 4)
        #expect(activities.map(\.id) == ["w-1", "s-1", "m-1", "c-1"])
        #expect(activities.map(\.type) == [.workout, .stretch, .meditation, .cycling])
    }

    @Test("activitiesForDate optional nil filter matches unfiltered overload")
    @MainActor
    func activitiesForDateOptionalNilFilterMatchesUnfilteredOverload() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        let workout = makeActivity(id: "w-1", type: .workout, date: date, completedAt: date)
        let stretch = makeActivity(id: "s-1", type: .stretch, date: date, completedAt: date)
        let meditation = makeActivity(id: "m-1", type: .meditation, date: date, completedAt: date)
        let cycling = makeActivity(id: "c-1", type: .cycling, date: date, completedAt: date)
        vm.activitiesByDate[key(for: date)] = [workout, stretch, meditation, cycling]

        let unfilteredActivities = vm.activitiesForDate(date)
        let nilFilterActivities = vm.activitiesForDate(date, filter: nil)

        #expect(unfilteredActivities.map(\.id) == nilFilterActivities.map(\.id))
        #expect(unfilteredActivities.map(\.type) == nilFilterActivities.map(\.type))
    }

    @Test("activitiesForDate optional nil filter returns empty for missing date")
    @MainActor
    func activitiesForDateOptionalNilFilterReturnsEmptyForMissingDate() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        let unseededDate = makeDate(year: 2026, month: 3, day: 15)
        vm.activitiesByDate[key(for: date)] = [makeActivity(id: "w-1", type: .workout, date: date)]

        let activities = vm.activitiesForDate(unseededDate, filter: nil)

        #expect(activities.isEmpty)
    }

    @Test("activitiesForDate with workout filter returns only workout activities")
    @MainActor
    func activitiesForDateWorkoutFilterReturnsOnlyWorkouts() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        vm.activitiesByDate[key(for: date)] = [
            makeActivity(id: "w-1", type: .workout, date: date),
            makeActivity(id: "s-1", type: .stretch, date: date),
            makeActivity(id: "m-1", type: .meditation, date: date),
        ]

        let activities = vm.activitiesForDate(date, filter: .workout)

        #expect(activities.count == 1)
        #expect(activities.map(\.id) == ["w-1"])
        #expect(activities.allSatisfy { $0.type == .workout })
    }

    @Test("activitiesForDate with stretch filter excludes non-stretch activities")
    @MainActor
    func activitiesForDateStretchFilterReturnsOnlyStretch() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        vm.activitiesByDate[key(for: date)] = [
            makeActivity(id: "w-1", type: .workout, date: date),
            makeActivity(id: "s-1", type: .stretch, date: date),
            makeActivity(id: "m-1", type: .meditation, date: date),
        ]

        let activities = vm.activitiesForDate(date, filter: .stretch)

        #expect(activities.count == 1)
        #expect(activities.map(\.id) == ["s-1"])
        #expect(activities.allSatisfy { $0.type == .stretch })
    }

    @Test("activitiesForDate with meditation filter excludes non-meditation activities")
    @MainActor
    func activitiesForDateMeditationFilterReturnsOnlyMeditation() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        vm.activitiesByDate[key(for: date)] = [
            makeActivity(id: "w-1", type: .workout, date: date),
            makeActivity(id: "s-1", type: .stretch, date: date),
            makeActivity(id: "m-1", type: .meditation, date: date),
        ]

        let activities = vm.activitiesForDate(date, filter: .meditation)

        #expect(activities.count == 1)
        #expect(activities.map(\.id) == ["m-1"])
        #expect(activities.allSatisfy { $0.type == .meditation })
    }

    @Test("activitiesForDate with cycling filter returns only cycling activities")
    @MainActor
    func activitiesForDateCyclingFilterReturnsOnlyCycling() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        vm.activitiesByDate[key(for: date)] = [
            makeActivity(id: "w-1", type: .workout, date: date),
            makeActivity(id: "s-1", type: .stretch, date: date),
            makeActivity(id: "m-1", type: .meditation, date: date),
            makeActivity(id: "c-1", type: .cycling, date: date),
        ]

        let activities = vm.activitiesForDate(date, filter: .cycling)

        #expect(activities.count == 1)
        #expect(activities.map(\.id) == ["c-1"])
        #expect(activities.allSatisfy { $0.type == .cycling })
    }

    @Test("activitiesForDate with filter returns empty when date has no activities")
    @MainActor
    func activitiesForDateWithUnknownDateReturnsEmptyWithFilter() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        let otherDate = makeDate(year: 2026, month: 3, day: 15)
        vm.activitiesByDate[key(for: date)] = [makeActivity(id: "w-1", type: .workout, date: date)]

        let activities = vm.activitiesForDate(otherDate, filter: .workout)

        #expect(activities.isEmpty)
    }

    @Test("activitiesForDate with unmatched filter returns empty")
    @MainActor
    func activitiesForDateUnmatchedFilterReturnsEmpty() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 14)
        vm.activitiesByDate[key(for: date)] = [makeActivity(id: "w-1", type: .workout, date: date)]

        let activities = vm.activitiesForDate(date, filter: .stretch)

        #expect(activities.isEmpty)
    }

    @Test("recentActivities sorts by completedAt when present and by date when completedAt is nil")
    @MainActor
    func recentActivitiesSortsByCompletedAtOrDate() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let dateJan1 = makeDate(year: 2026, month: 3, day: 14, hour: 10)
        let dateJan2 = makeDate(year: 2026, month: 3, day: 15, hour: 9)
        let dateJan3 = makeDate(year: 2026, month: 3, day: 16, hour: 12)
        let dateJan4 = makeDate(year: 2026, month: 3, day: 17, hour: 8)

        let workoutA = makeActivity(id: "a", type: .workout, date: dateJan1, completedAt: makeDate(year: 2026, month: 3, day: 1, hour: 18))
        let stretchA = makeActivity(id: "b", type: .stretch, date: dateJan2, completedAt: nil)
        let meditationA = makeActivity(id: "c", type: .meditation, date: dateJan3, completedAt: dateJan3)
        let workoutB = makeActivity(id: "d", type: .workout, date: dateJan4, completedAt: nil)

        vm.activitiesByDate = [
            key(for: dateJan1): [workoutA],
            key(for: dateJan2): [stretchA],
            key(for: dateJan3): [meditationA],
            key(for: dateJan4): [workoutB],
        ]

        let activities = vm.recentActivities(limit: 10)

        #expect(activities.map(\.id) == ["d", "c", "b", "a"])
    }

    @Test("recentActivities default limit returns top three")
    @MainActor
    func recentActivitiesDefaultLimitReturnsTopThree() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let dateJan1 = makeDate(year: 2026, month: 3, day: 14, hour: 10)
        let dateJan2 = makeDate(year: 2026, month: 3, day: 15, hour: 9)
        let dateJan3 = makeDate(year: 2026, month: 3, day: 16, hour: 12)
        let dateJan4 = makeDate(year: 2026, month: 3, day: 17, hour: 8)

        vm.activitiesByDate = [
            key(for: dateJan1): [
                makeActivity(id: "a", type: .workout, date: dateJan1, completedAt: makeDate(year: 2026, month: 3, day: 1, hour: 18))
            ],
            key(for: dateJan2): [
                makeActivity(id: "b", type: .stretch, date: dateJan2),
            ],
            key(for: dateJan3): [
                makeActivity(id: "c", type: .meditation, date: dateJan3, completedAt: dateJan3)
            ],
            key(for: dateJan4): [
                makeActivity(id: "d", type: .workout, date: dateJan4),
            ],
        ]

        let activities = vm.recentActivities()

        #expect(activities.count == 3)
        #expect(activities.map(\.id) == ["d", "c", "b"])
    }

    @Test("recentActivities applies explicit limit")
    @MainActor
    func recentActivitiesExplicitLimitReturnsExpected() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let dateJan1 = makeDate(year: 2026, month: 3, day: 14, hour: 10)
        let dateJan2 = makeDate(year: 2026, month: 3, day: 15, hour: 9)
        let dateJan3 = makeDate(year: 2026, month: 3, day: 16, hour: 12)
        let dateJan4 = makeDate(year: 2026, month: 3, day: 17, hour: 8)

        vm.activitiesByDate = [
            key(for: dateJan1): [makeActivity(id: "a", type: .workout, date: dateJan1)],
            key(for: dateJan2): [makeActivity(id: "b", type: .stretch, date: dateJan2)],
            key(for: dateJan3): [makeActivity(id: "c", type: .meditation, date: dateJan3, completedAt: dateJan3)],
            key(for: dateJan4): [makeActivity(id: "d", type: .workout, date: dateJan4)],
        ]

        let activities = vm.recentActivities(limit: 2)

        #expect(activities.count == 2)
        #expect(activities.map(\.id) == ["d", "c"])
    }

    @Test("recentActivities returns all when limit exceeds total")
    @MainActor
    func recentActivitiesReturnsAllWhenLimitExceedsTotal() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let date = makeDate(year: 2026, month: 3, day: 15)
        let earlier = makeDate(year: 2026, month: 3, day: 15, hour: 10)
        let later = makeDate(year: 2026, month: 3, day: 15, hour: 12)
        vm.activitiesByDate = [
            key(for: date): [
                makeActivity(id: "a", type: .workout, date: earlier),
                makeActivity(id: "b", type: .stretch, date: later),
            ]
        ]

        let activities = vm.recentActivities(limit: 10)

        #expect(activities.count == 2)
        #expect(activities.map(\.id) == ["b", "a"])
    }

    @Test("recentActivities returns empty when no data")
    @MainActor
    func recentActivitiesReturnsEmptyWhenNoData() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())

        let activities = vm.recentActivities(limit: 5)

        #expect(activities.isEmpty)
    }

    @Test("activitiesForDate returns empty for no data")
    @MainActor
    func activitiesForDateEmpty() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let activities = vm.activitiesForDate(Date())

        #expect(activities.isEmpty)
    }

    @Test("year and month are computed correctly")
    @MainActor
    func yearAndMonthComputed() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let calendar = Calendar.current
        let expectedYear = calendar.component(.year, from: vm.currentMonth)
        let expectedMonth = calendar.component(.month, from: vm.currentMonth)

        #expect(vm.year == expectedYear)
        #expect(vm.month == expectedMonth)
    }
}
