import HealthKit
import Testing
@testable import Brad_OS

private final class RecordingHealthKitObserverExecutor: HealthKitObserverExecuting {
    private(set) var executedQueries: [HKQuery] = []

    func execute(_ query: HKQuery) {
        executedQueries.append(query)
    }
}

@Suite @MainActor
struct HealthKitBackgroundDeliveryTests {
    @Test
    func registersAllObserversBeforeReturning() {
        let executor = RecordingHealthKitObserverExecutor()
        let manager = HealthKitManager(observerExecutor: executor)

        manager.registerBackgroundObservers {}

        #expect(executor.executedQueries.count == 4)
        #expect(manager.registeredBackgroundObserverCount == 4)
    }

    @Test
    func observerRegistrationIsIdempotent() {
        let executor = RecordingHealthKitObserverExecutor()
        let manager = HealthKitManager(observerExecutor: executor)

        manager.registerBackgroundObservers {}
        manager.registerBackgroundObservers {}

        #expect(executor.executedQueries.count == 4)
        #expect(manager.registeredBackgroundObserverCount == 4)
    }
}
