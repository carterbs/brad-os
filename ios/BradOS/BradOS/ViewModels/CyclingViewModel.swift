import Foundation
import BradOSCore

// MARK: - Cycling ViewModel

/// View model for cycling data management
@MainActor
class CyclingViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var activities: [CyclingActivityModel] = []
    @Published var currentBlock: TrainingBlockModel?
    @Published var trainingLoad: TrainingLoadModel?
    @Published var currentFTP: Int?
    @Published var ftpLastTested: Date?
    @Published var isLoading = false
    @Published var error: String?

    // Chart data
    @Published var tssHistory: [TSSDataPoint]?
    @Published var loadHistory: [TrainingLoadDataPoint]?

    // VO2 Max data
    @Published var vo2maxEstimate: VO2MaxEstimateModel?
    @Published var vo2maxHistory: [VO2MaxEstimateModel] = []

    // Efficiency Factor data
    @Published var efHistory: [EFDataPoint] = []

    /// Whether FTP has been set
    var hasFTP: Bool {
        currentFTP != nil
    }

    // MARK: - Private Properties

    private let apiClient: APIClient

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all cycling data from the API
    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        // Fetch all data concurrently
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.fetchActivities() }
            group.addTask { await self.fetchTrainingLoad() }
            group.addTask { await self.fetchFTP() }
            group.addTask { await self.fetchBlock() }
            group.addTask { await self.fetchVO2Max() }
            group.addTask { await self.fetchEFHistory() }
        }

        loadChartData()
    }

    private func fetchActivities() async {
        do {
            activities = try await apiClient.getCyclingActivities(limit: 30)
        } catch {
            print("[CyclingVM] Failed to fetch activities: \(error)")
        }
    }

    private func fetchTrainingLoad() async {
        do {
            let response = try await apiClient.getCyclingTrainingLoad()
            trainingLoad = TrainingLoadModel(atl: response.atl, ctl: response.ctl, tsb: response.tsb)
        } catch {
            print("[CyclingVM] Failed to fetch training load: \(error)")
        }
    }

    private func fetchFTP() async {
        do {
            if let ftp = try await apiClient.getCurrentFTP() {
                currentFTP = ftp.value
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                ftpLastTested = formatter.date(from: ftp.date)
            }
        } catch {
            print("[CyclingVM] Failed to fetch FTP: \(error)")
        }
    }

    private func fetchBlock() async {
        do {
            if let block = try await apiClient.getCurrentBlock() {
                let dateFormatter = DateFormatter()
                dateFormatter.dateFormat = "yyyy-MM-dd"
                let startDate = dateFormatter.date(from: block.startDate) ?? Date()
                let endDate = dateFormatter.date(from: block.endDate) ?? Date()
                let goals = block.goals.compactMap { TrainingBlockModel.TrainingGoal(rawValue: $0) }

                currentBlock = TrainingBlockModel(
                    id: block.id,
                    startDate: startDate,
                    endDate: endDate,
                    currentWeek: block.currentWeek,
                    goals: goals,
                    status: block.status == "completed" ? .completed : .active
                )
            }
        } catch {
            print("[CyclingVM] Failed to fetch block: \(error)")
        }
    }

    private func fetchVO2Max() async {
        do {
            let response = try await apiClient.getVO2Max()
            vo2maxEstimate = response.latest
            vo2maxHistory = response.history
        } catch {
            print("[CyclingVM] Failed to fetch VO2 max: \(error)")
        }
    }

    private func fetchEFHistory() async {
        do {
            efHistory = try await apiClient.getEFHistory()
        } catch {
            print("[CyclingVM] Failed to fetch EF history: \(error)")
        }
    }

    /// Build chart data from loaded activities
    private func loadChartData() {
        // Build TSS history by week from real activities
        let calendar = Calendar.current
        var weeklyTSS: [String: Int] = [:]
        for activity in activities {
            let weekOfYear = calendar.component(.weekOfYear, from: activity.date)
            let label = "W\(weekOfYear)"
            weeklyTSS[label, default: 0] += activity.tss
        }
        tssHistory = weeklyTSS.sorted { $0.key < $1.key }
            .suffix(8)
            .map { TSSDataPoint(weekLabel: $0.key, tss: $0.value) }

        // Build training load history from activities (simplified daily TSS)
        let thirtyDaysAgo = calendar.date(byAdding: .day, value: -28, to: Date()) ?? Date()
        let recentActivities = activities.filter { $0.date >= thirtyDaysAgo }

        // Group by day
        var dailyTSS: [Date: Int] = [:]
        for activity in recentActivities {
            let day = calendar.startOfDay(for: activity.date)
            dailyTSS[day, default: 0] += activity.tss
        }

        // Generate load history points
        var runningATL = trainingLoad?.atl ?? 0
        var runningCTL = trainingLoad?.ctl ?? 0
        loadHistory = (0..<28).compactMap { daysAgo -> TrainingLoadDataPoint? in
            guard let date = calendar.date(byAdding: .day, value: -daysAgo, to: Date()) else { return nil }
            let day = calendar.startOfDay(for: date)
            let tss = Double(dailyTSS[day] ?? 0)

            // Simplified exponential decay
            runningATL = runningATL + (tss - runningATL) / 7
            runningCTL = runningCTL + (tss - runningCTL) / 42

            return TrainingLoadDataPoint(date: date, ctl: runningCTL, atl: runningATL, tsb: runningCTL - runningATL)
        }.reversed()
    }

    /// Refresh activities from the server
    func refreshActivities() async {
        await loadData()
    }

    // MARK: - Block Management

    /// Start a new training block
    func startNewBlock(goals: [TrainingBlockModel.TrainingGoal], startDate: Date) async {
        isLoading = true
        defer { isLoading = false }

        let endDate = Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
        let goalStrings = goals.map { $0.rawValue }

        do {
            let response = try await apiClient.createTrainingBlock(startDate: startDate, endDate: endDate, goals: goalStrings)
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            let responseStart = dateFormatter.date(from: response.startDate) ?? startDate
            let responseEnd = dateFormatter.date(from: response.endDate) ?? endDate
            let responseGoals = response.goals.compactMap { TrainingBlockModel.TrainingGoal(rawValue: $0) }

            currentBlock = TrainingBlockModel(
                id: response.id,
                startDate: responseStart,
                endDate: responseEnd,
                currentWeek: response.currentWeek,
                goals: responseGoals,
                status: response.status == "completed" ? .completed : .active
            )
            loadChartData()
        } catch {
            self.error = "Failed to create training block: \(error.localizedDescription)"
            print("[CyclingVM] Failed to create block: \(error)")
        }
    }

    /// Complete the current training block
    func completeCurrentBlock() async {
        guard let block = currentBlock else { return }

        do {
            _ = try await apiClient.completeTrainingBlock(id: block.id)
            currentBlock = TrainingBlockModel(
                id: block.id,
                startDate: block.startDate,
                endDate: block.endDate,
                currentWeek: block.currentWeek,
                goals: block.goals,
                status: .completed
            )
        } catch {
            self.error = "Failed to complete block: \(error.localizedDescription)"
            print("[CyclingVM] Failed to complete block: \(error)")
        }
    }

    // MARK: - FTP Management

    /// Save FTP value to backend
    func saveFTP(_ value: Int, date: Date = Date(), source: String = "manual") async {
        do {
            let response = try await apiClient.createFTPEntry(value: value, date: date, source: source)
            currentFTP = response.value
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            ftpLastTested = formatter.date(from: response.date)
        } catch {
            self.error = "Failed to save FTP: \(error.localizedDescription)"
            print("[CyclingVM] Failed to save FTP: \(error)")
        }
    }
}
