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

    // Schedule generation
    @Published var generatedSchedule: GenerateScheduleResponse?
    @Published var isGeneratingSchedule = false

    /// Whether FTP has been set
    var hasFTP: Bool {
        currentFTP != nil
    }

    /// The next incomplete session in this week's queue
    var nextSession: WeeklySessionModel? {
        guard let sessions = currentBlock?.weeklySessions else { return nil }
        let completed = sessionsCompletedThisWeek
        guard completed < sessions.count else { return nil }
        return sessions[completed]
    }

    /// Number of sessions completed this week (matched against Strava activities)
    var sessionsCompletedThisWeek: Int {
        guard let sessions = currentBlock?.weeklySessions else { return 0 }
        let calendar = Calendar.current
        let startOfWeek = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let thisWeekActivities = activities.filter { $0.date >= startOfWeek }

        var matchedCount = 0
        var usedActivityIds: Set<String> = []

        for session in sessions {
            let sessionType = SessionType(rawValue: session.sessionType)
            let matched = thisWeekActivities.first { activity in
                !usedActivityIds.contains(activity.id) && activityMatchesSession(activity, sessionType: sessionType)
            }
            if let matched = matched {
                usedActivityIds.insert(matched.id)
                matchedCount += 1
            } else {
                break
            }
        }

        return matchedCount
    }

    /// Total weekly sessions in current block
    var weeklySessionsTotal: Int {
        currentBlock?.weeklySessions?.count ?? 0
    }

    private func activityMatchesSession(_ activity: CyclingActivityModel, sessionType: SessionType?) -> Bool {
        guard let sessionType = sessionType else { return true }
        switch sessionType {
        case .vo2max: return activity.type == .vo2max
        case .threshold: return activity.type == .threshold
        case .endurance, .tempo, .fun: return activity.type == .fun || activity.type == .unknown
        case .recovery: return activity.type == .recovery
        case .off: return false
        }
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
                    status: block.status == "completed" ? .completed : .active,
                    daysPerWeek: block.daysPerWeek,
                    weeklySessions: block.weeklySessions,
                    preferredDays: block.preferredDays,
                    experienceLevel: ExperienceLevel(rawValue: block.experienceLevel ?? ""),
                    weeklyHoursAvailable: block.weeklyHoursAvailable
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
            weeklyTSS[label, default: 0] += Int(activity.tss)
        }
        tssHistory = weeklyTSS.sorted { $0.key < $1.key }
            .suffix(8)
            .map { TSSDataPoint(weekLabel: $0.key, tss: $0.value) }

        // Build training load history from activities (simplified daily TSS)
        let thirtyDaysAgo = calendar.date(byAdding: .day, value: -28, to: Date()) ?? Date()
        let recentActivities = activities.filter { $0.date >= thirtyDaysAgo }

        // Group by day
        var dailyTSS: [Date: Double] = [:]
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
            let tss = dailyTSS[day] ?? 0

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

    // MARK: - Schedule Generation

    /// Generate a weekly schedule from the AI coach
    func generateSchedule(request: GenerateScheduleRequest) async {
        isGeneratingSchedule = true
        error = nil
        defer { isGeneratingSchedule = false }

        do {
            generatedSchedule = try await apiClient.generateSchedule(request)
        } catch {
            self.error = "Failed to generate schedule: \(error.localizedDescription)"
            print("[CyclingVM] Failed to generate schedule: \(error)")
        }
    }

    // MARK: - Block Management

    /// Start a new training block
    func startNewBlock(
        goals: [TrainingBlockModel.TrainingGoal],
        startDate: Date,
        daysPerWeek: Int? = nil,
        weeklySessions: [WeeklySessionModel]? = nil,
        preferredDays: [Int]? = nil,
        experienceLevel: ExperienceLevel? = nil,
        weeklyHoursAvailable: Double? = nil
    ) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        let endDate = Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        do {
            let response = try await apiClient.createBlock(
                startDate: dateFormatter.string(from: startDate),
                endDate: dateFormatter.string(from: endDate),
                goals: goals.map(\.rawValue),
                daysPerWeek: daysPerWeek,
                weeklySessions: weeklySessions,
                preferredDays: preferredDays,
                experienceLevel: experienceLevel,
                weeklyHoursAvailable: weeklyHoursAvailable
            )

            currentBlock = TrainingBlockModel(
                id: response.id,
                startDate: startDate,
                endDate: endDate,
                currentWeek: response.currentWeek,
                goals: goals,
                status: .active,
                daysPerWeek: daysPerWeek,
                weeklySessions: response.weeklySessions ?? weeklySessions,
                preferredDays: response.preferredDays ?? preferredDays,
                experienceLevel: ExperienceLevel(rawValue: response.experienceLevel ?? "") ?? experienceLevel,
                weeklyHoursAvailable: response.weeklyHoursAvailable ?? weeklyHoursAvailable
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
            try await apiClient.completeBlock(id: block.id)

            currentBlock = TrainingBlockModel(
                id: block.id,
                startDate: block.startDate,
                endDate: block.endDate,
                currentWeek: block.currentWeek,
                goals: block.goals,
                status: .completed,
                daysPerWeek: block.daysPerWeek,
                weeklySessions: block.weeklySessions,
                preferredDays: block.preferredDays,
                experienceLevel: block.experienceLevel,
                weeklyHoursAvailable: block.weeklyHoursAvailable
            )
        } catch {
            self.error = "Failed to complete block: \(error.localizedDescription)"
            print("[CyclingVM] Failed to complete block: \(error)")
        }
    }

    // MARK: - FTP Management

    /// Save FTP value to backend
    func saveFTP(_ value: Int, date: Date = Date(), source: String = "manual") async -> Bool {
        error = nil
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        do {
            _ = try await apiClient.createFTP(
                value: value,
                date: dateFormatter.string(from: date),
                source: source
            )
            currentFTP = value
            ftpLastTested = date
            return true
        } catch {
            self.error = "Failed to save FTP: \(error.localizedDescription)"
            print("[CyclingVM] Failed to save FTP: \(error)")
            return false
        }
    }

    /// Load FTP history from backend
    func loadFTPHistory() async -> [FTPEntryResponse] {
        do {
            return try await apiClient.getFTPHistory()
        } catch {
            print("[CyclingVM] Failed to load FTP history: \(error)")
            return []
        }
    }
}
