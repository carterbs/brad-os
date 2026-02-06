import WidgetKit
import SwiftUI
import BradOSCore

struct MealPlanWidget: Widget {
    let kind: String = "MealPlanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MealPlanTimelineProvider()) { entry in
            MealPlanWidgetEntryView(entry: entry)
                .environment(\.colorScheme, .dark)
                .containerBackground(for: .widget) {
                    ThemeColors.bgDeep
                }
        }
        .configurationDisplayName("Meal Plan")
        .description("Today's breakfast, lunch, and dinner.")
        .supportedFamilies([.systemMedium])
    }
}
