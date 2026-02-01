import SwiftUI

/// Floating glass dock tab bar
struct MainTabView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack(alignment: .bottom) {
            // Content area
            Group {
                switch appState.selectedTab {
                case .today:
                    TodayDashboardView()
                case .activities:
                    ActivitiesView()
                case .history:
                    HistoryView()
                case .profile:
                    ProfileView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // Extra bottom padding so content doesn't hide behind dock
            .padding(.bottom, Theme.Dimensions.tabBarHeight + Theme.Spacing.space4)

            // Floating glass dock
            HStack(spacing: 0) {
                ForEach(TabItem.allCases) { tab in
                    tabButton(tab)
                }
            }
            .frame(height: Theme.Dimensions.tabBarHeight)
            .glassCard(.chrome, radius: Theme.CornerRadius.xxl, padding: 0)
            .padding(.horizontal, Theme.Spacing.space5)
            .padding(.bottom, Theme.Spacing.space4)
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
                ZStack {
                    // Aurora highlight behind active icon
                    if isActive {
                        Circle()
                            .fill(Theme.interactivePrimary.opacity(0.20))
                            .frame(width: 32, height: 32)
                            .blur(radius: 8)
                    }

                    Image(systemName: isActive ? tab.filledIcon : tab.outlinedIcon)
                        .font(.system(size: Theme.Typography.tabBarIcon, weight: isActive ? .semibold : .medium))
                        .foregroundColor(isActive ? Theme.interactivePrimary : Theme.textTertiary)
                }
                .frame(height: 28)

                Text(tab.label)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(isActive ? Theme.interactivePrimary : Theme.textTertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space1)
            .background(
                isActive
                    ? Capsule(style: .continuous)
                        .fill(Theme.interactivePrimary.opacity(0.10))
                    : nil
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Tab Item

enum TabItem: String, CaseIterable, Identifiable {
    case today
    case activities
    case history
    case profile

    var id: String { rawValue }

    var mainTab: MainTab {
        switch self {
        case .today: return .today
        case .activities: return .activities
        case .history: return .history
        case .profile: return .profile
        }
    }

    var label: String {
        switch self {
        case .today: return "Today"
        case .activities: return "Activities"
        case .history: return "History"
        case .profile: return "Profile"
        }
    }

    var filledIcon: String {
        switch self {
        case .today: return "house.fill"
        case .activities: return "square.grid.2x2.fill"
        case .history: return "calendar"
        case .profile: return "person.fill"
        }
    }

    var outlinedIcon: String {
        switch self {
        case .today: return "house"
        case .activities: return "square.grid.2x2"
        case .history: return "calendar"
        case .profile: return "person"
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
        .background(AuroraBackground())
        .preferredColorScheme(.dark)
}
