import BradOSCore

extension HealthMetricHistoryViewModel {
    convenience init(_ metric: HealthMetric) {
        self.init(metric, apiClient: APIClient.shared)
    }
}

extension SleepHistoryViewModel {
    convenience init() {
        self.init(apiClient: APIClient.shared)
    }
}
