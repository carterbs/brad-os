import SwiftUI

/// Daymark tab bar: an anchored navigation rail rather than floating chrome.
struct MainTabView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack(alignment: .bottom) {
            // Content area
            Group {
                switch appState.selectedTab {
                case .today:
                    TodayDashboardView()
                case .health:
                    HealthView()
                case .meals:
                    MealPlanView()
                case .profile:
                    ProfileView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, Theme.Dimensions.tabBarHeight)

            HStack(spacing: 0) {
                ForEach(TabItem.allCases) { tab in
                    tabButton(tab)
                }
            }
            .frame(height: Theme.Dimensions.tabBarHeight)
            .background(Theme.Background.surface)
            .overlay(alignment: .top) {
                Rectangle().fill(Theme.divider).frame(height: 1)
            }
        }
    }

    @ViewBuilder
    private func tabButton(_ tab: TabItem) -> some View {
        let isActive = appState.selectedTab == tab.mainTab
        Button {
            withAnimation(Theme.Motion.standardSpring) {
                appState.selectedTab = tab.mainTab
            }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: isActive ? tab.filledIcon : tab.outlinedIcon)
                    .font(.system(size: Theme.Typography.tabBarIcon, weight: isActive ? .semibold : .medium))
                    .foregroundColor(isActive ? Theme.interactivePrimary : Theme.textTertiary)
                .frame(height: 28)

                Text(tab.label)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(isActive ? Theme.interactivePrimary : Theme.textTertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space1)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(isActive ? Theme.interactivePrimary : .clear)
                    .frame(height: 2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Tab Item

enum TabItem: String, CaseIterable, Identifiable {
    case today
    case health
    case meals
    case profile

    var id: String { rawValue }

    var mainTab: MainTab {
        switch self {
        case .today: return .today
        case .health: return .health
        case .meals: return .meals
        case .profile: return .profile
        }
    }

    var label: String {
        switch self {
        case .today: return "Today"
        case .health: return "Health"
        case .meals: return "Meals"
        case .profile: return "Profile"
        }
    }

    var filledIcon: String {
        switch self {
        case .today: return "house.fill"
        case .health: return "heart.fill"
        case .meals: return "fork.knife"
        case .profile: return "person.fill"
        }
    }

    var outlinedIcon: String {
        switch self {
        case .today: return "house"
        case .health: return "heart"
        case .meals: return "fork.knife"
        case .profile: return "person"
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.light)
}
