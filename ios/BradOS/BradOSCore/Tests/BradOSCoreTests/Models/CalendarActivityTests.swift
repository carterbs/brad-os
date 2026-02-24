import Testing
import Foundation
@testable import BradOSCore

@Suite("CalendarActivity")
struct CalendarActivityTests {
    @Test("decodes cycling calendar activity from server JSON")
    func decodesCyclingCalendarActivityFromServerJSON() throws {
        let json = """
        {
            "id": "cycling-1",
            "type": "cycling",
            "date": "2026-01-15T10:30:00Z",
            "completedAt": "2026-01-15T18:00:00Z",
            "summary": {
                "durationMinutes": 52,
                "tss": 67,
                "cyclingType": "threshold"
            }
        }
        """.data(using: .utf8)!

        let activity = try makeDecoder().decode(CalendarActivity.self, from: json)

        #expect(activity.id == "cycling-1")
        #expect(activity.type == .cycling)
        #expect(activity.summary.durationMinutes == 52)
        #expect(activity.summary.tss == 67)
        #expect(activity.summary.cyclingType == "threshold")
    }

    @Test("CalendarDayData hasCycling reflects mixed activity arrays")
    func calendarDayDataHasCyclingReflectsMixedActivities() {
        let date = Date()
        let workout = CalendarActivity(
            id: "workout-1",
            type: .workout,
            date: date,
            completedAt: date,
            summary: ActivitySummary(dayName: "Push")
        )
        let cycling = CalendarActivity(
            id: "cycling-1",
            type: .cycling,
            date: date,
            completedAt: date,
            summary: ActivitySummary(
                durationMinutes: 52,
                tss: 67,
                cyclingType: "threshold"
            )
        )
        let meditation = CalendarActivity(
            id: "meditation-1",
            type: .meditation,
            date: date,
            completedAt: date,
            summary: ActivitySummary(
                durationSeconds: 600,
                meditationType: "basic-breathing"
            )
        )

        let mixedDay = CalendarDayData(date: date, activities: [workout, cycling, meditation])
        let nonCyclingDay = CalendarDayData(date: date, activities: [workout, meditation])

        #expect(mixedDay.hasCycling == true)
        #expect(nonCyclingDay.hasCycling == false)
        #expect(nonCyclingDay.hasWorkout == true)
        #expect(nonCyclingDay.hasMeditation == true)
        #expect(nonCyclingDay.hasStretch == false)
    }
}

