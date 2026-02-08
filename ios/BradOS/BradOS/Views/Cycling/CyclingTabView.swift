import SwiftUI

// MARK: - Cycling Tab Selection

/// Tab selection within cycling context
enum CyclingTab: Int, Hashable {
    case today = 0
    case block = 1
    case history = 2
}

// MARK: - Cycling Tab View

/// Tab navigation for cycling context (Today, Block, History)
struct CyclingTabView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKit: HealthKitManager
    @EnvironmentObject var stravaAuth: StravaAuthManager
    @StateObject private var viewModel = CyclingViewModel()
    @State private var selectedTab: CyclingTab = .today

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented tab picker
                Picker("", selection: $selectedTab) {
                    Text("Today").tag(CyclingTab.today)
                    Text("Block").tag(CyclingTab.block)
                    Text("History").tag(CyclingTab.history)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Theme.Spacing.space5)
                .padding(.top, Theme.Spacing.space4)
                .padding(.bottom, Theme.Spacing.space3)

                // Tab content
                TabView(selection: $selectedTab) {
                    CyclingTodayView()
                        .tag(CyclingTab.today)

                    CyclingBlockView()
                        .tag(CyclingTab.block)

                    CyclingHistoryView()
                        .tag(CyclingTab.history)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .environmentObject(viewModel)
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Cycling")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        appState.isShowingCycling = false
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Back")
                        }
                        .foregroundColor(Theme.interactivePrimary)
                    }
                }
            }
            .task {
                await viewModel.loadData()
            }
        }
    }
}

// MARK: - Preview

#Preview {
    CyclingTabView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .environmentObject(StravaAuthManager())
        .preferredColorScheme(.dark)
}
