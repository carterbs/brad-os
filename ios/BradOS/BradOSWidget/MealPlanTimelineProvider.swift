import WidgetKit
import BradOSCore

struct MealPlanWidgetEntry: TimelineEntry {
    let date: Date
    let dayName: String
    let meals: [MealPlanEntry]
    let isEmpty: Bool
}

struct MealPlanTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealPlanWidgetEntry {
        MealPlanWidgetEntry(
            date: Date(),
            dayName: "Monday",
            meals: [
                MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "p1", mealName: "Scrambled Eggs"),
                MealPlanEntry(dayIndex: 0, mealType: .lunch, mealId: "p2", mealName: "Chicken Caesar Salad"),
                MealPlanEntry(dayIndex: 0, mealType: .dinner, mealId: "p3", mealName: "Salmon with Rice"),
            ],
            isEmpty: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (MealPlanWidgetEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MealPlanWidgetEntry>) -> Void) {
        let entry = makeEntry()
        let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86400)
        let timeline = Timeline(entries: [entry], policy: .after(midnight))
        completion(timeline)
    }

    private func makeEntry() -> MealPlanWidgetEntry {
        let cacheService = MealPlanCacheService.shared
        guard let session = cacheService.getCachedSession(), session.isFinalized else {
            return MealPlanWidgetEntry(date: Date(), dayName: todayDayName(), meals: [], isEmpty: true)
        }
        let dayIndex = calendarWeekdayToDayIndex()
        let todayMeals = session.plan.filter { $0.dayIndex == dayIndex }
        return MealPlanWidgetEntry(date: Date(), dayName: todayDayName(), meals: todayMeals, isEmpty: false)
    }

    private func calendarWeekdayToDayIndex() -> Int {
        let weekday = Calendar.current.component(.weekday, from: Date())
        return weekday == 1 ? 6 : weekday - 2
    }

    private func todayDayName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: Date())
    }
}
