import Foundation

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

    /// Whether FTP has been set
    var hasFTP: Bool {
        currentFTP != nil
    }

    // MARK: - Private Properties

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all cycling data
    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Implement API calls when backend is ready
        // For now, load mock data for UI development

        // Simulate network delay
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Mock training load
        trainingLoad = TrainingLoadModel(
            atl: 65,
            ctl: 48,
            tsb: -17
        )

        // Mock FTP
        currentFTP = 195
        ftpLastTested = Calendar.current.date(byAdding: .weekOfYear, value: -3, to: Date())

        // Mock current block
        currentBlock = TrainingBlockModel(
            id: "block-1",
            startDate: Calendar.current.date(byAdding: .weekOfYear, value: -3, to: Date()) ?? Date(),
            endDate: Calendar.current.date(byAdding: .weekOfYear, value: 5, to: Date()) ?? Date(),
            currentWeek: 4,
            goals: [.regainFitness, .loseWeight],
            status: .active
        )

        // Mock activities
        activities = [
            CyclingActivityModel(
                id: "ride-1",
                stravaId: 12345,
                date: Date(),
                durationMinutes: 45,
                avgPower: 165,
                normalizedPower: 178,
                maxPower: 312,
                avgHeartRate: 142,
                maxHeartRate: 168,
                tss: 52,
                intensityFactor: 0.91,
                type: .threshold
            ),
            CyclingActivityModel(
                id: "ride-2",
                stravaId: 12344,
                date: Calendar.current.date(byAdding: .day, value: -2, to: Date()) ?? Date(),
                durationMinutes: 30,
                avgPower: 138,
                normalizedPower: 145,
                maxPower: 245,
                avgHeartRate: 125,
                maxHeartRate: 142,
                tss: 28,
                intensityFactor: 0.74,
                type: .recovery
            ),
            CyclingActivityModel(
                id: "ride-3",
                stravaId: 12343,
                date: Calendar.current.date(byAdding: .day, value: -4, to: Date()) ?? Date(),
                durationMinutes: 60,
                avgPower: 155,
                normalizedPower: 168,
                maxPower: 385,
                avgHeartRate: 152,
                maxHeartRate: 182,
                tss: 75,
                intensityFactor: 0.86,
                type: .vo2max
            )
        ]

        // Load chart data
        loadChartData()
    }

    /// Load chart data for TSS and training load trends
    private func loadChartData() {
        // Mock TSS history (last 8 weeks)
        tssHistory = [
            TSSDataPoint(weekLabel: "W1", tss: 180),
            TSSDataPoint(weekLabel: "W2", tss: 220),
            TSSDataPoint(weekLabel: "W3", tss: 195),
            TSSDataPoint(weekLabel: "W4", tss: 240),
            TSSDataPoint(weekLabel: "W5", tss: 120), // Recovery week
            TSSDataPoint(weekLabel: "W6", tss: 210),
            TSSDataPoint(weekLabel: "W7", tss: 255),
            TSSDataPoint(weekLabel: "W8", tss: 175)
        ]

        // Mock training load history (last 4 weeks)
        let calendar = Calendar.current
        loadHistory = (0..<28).compactMap { daysAgo -> TrainingLoadDataPoint? in
            guard let date = calendar.date(byAdding: .day, value: -daysAgo, to: Date()) else {
                return nil
            }

            // Simulate gradual CTL build and ATL fluctuation
            let baseCTL = 45.0 + Double(28 - daysAgo) * 0.3
            let baseATL = 50.0 + sin(Double(daysAgo) * 0.5) * 20
            let ctl = baseCTL + Double.random(in: -2...2)
            let atl = baseATL + Double.random(in: -5...5)

            return TrainingLoadDataPoint(
                date: date,
                ctl: ctl,
                atl: atl,
                tsb: ctl - atl
            )
        }.reversed()
    }

    /// Refresh activities from the server
    func refreshActivities() async {
        // TODO: Implement when backend is ready
        await loadData()
    }

    // MARK: - Block Management

    /// Start a new training block
    func startNewBlock(goals: [TrainingBlockModel.TrainingGoal], startDate: Date) async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Implement API call to create new block
        // For now, create mock block locally

        let endDate = Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate

        currentBlock = TrainingBlockModel(
            id: UUID().uuidString,
            startDate: startDate,
            endDate: endDate,
            currentWeek: 1,
            goals: goals,
            status: .active
        )

        // Reload chart data for new block
        loadChartData()
    }

    /// Complete the current training block
    func completeCurrentBlock() async {
        guard let block = currentBlock else { return }

        // TODO: Implement API call to mark block as completed

        // Update local state
        currentBlock = TrainingBlockModel(
            id: block.id,
            startDate: block.startDate,
            endDate: block.endDate,
            currentWeek: block.currentWeek,
            goals: block.goals,
            status: .completed
        )
    }

    // MARK: - FTP Management

    /// Update FTP value
    func updateFTP(_ value: Int, testDate: Date = Date()) async {
        // TODO: Implement API call to save FTP
        currentFTP = value
        ftpLastTested = testDate
    }
}
